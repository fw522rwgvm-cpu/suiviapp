import { curveMonotoneX, curveStepAfter, line as d3Line } from 'd3-shape';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Path, Rect } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { formatDayShort, formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_LEFT,
} from '@/core/charts/chart-frame';
import { bandGeometry, verticalScale } from '@/core/charts/scale';
import type { LocalDate } from '@/core/date';
import type { DayFigure } from '../domain/adherence';
import type { NutritionPanel } from '../domain/panel';

/**
 * Calories per day, against the goal, with the weekly rolling mean over it
 * (specs 8.7).
 *
 * ## THREE SERIES ON ONE PAIR OF AXES, WHICH IS WHY THE CHARTS ARE HAND-MADE
 *
 * > Trois écrans clés superposent des séries de natures différentes — exactement
 * > là où les bibliothèques génériques se battent contre vous. (D13)
 *
 * This is the mild version of that: bars for the days, a stepped line for the
 * goal (it changes from one template to another and must not be interpolated
 * between them), and a smooth line for the seven-day mean.
 *
 * ## A GAP IS A GAP IN ALL THREE
 *
 * A day with no entry has no bar and breaks the mean line, rather than drawing
 * a bar of height zero and dragging the line to the floor. `defined()` is what
 * does it for the lines; for the bars it is simply not emitting a Rect. This is
 * the same rule the figures follow, and the chart has to agree with them or the
 * picture contradicts the caption.
 *
 * ## ONE INTERACTION, MADE CONTINUOUS
 *
 * > Aucun zoom ni déplacement au doigt : les sélecteurs de plage y pourvoient
 * > déjà. Une seule interaction : toucher un point affiche sa valeur et sa
 * > date. (Specs 10.6, D13)
 *
 * This file used to say a scrub would be "a second interaction nobody asked
 * for". It was asked for, and the objection does not survive the ask: dragging
 * neither zooms nor pans — the viewport never moves — so it is the SAME
 * interaction, read continuously. Lifting a finger ninety times to read ninety
 * bars is not a rule worth keeping. Amended rather than left as a divergence
 * (specs 14.13, architecture 9.8).
 *
 * A Pan rather than a Pressable, because a Pressable cannot follow a finger:
 *  - onBegin selects at the touch, before any movement, so a plain tap still
 *    reads exactly as it did;
 *  - onUpdate follows;
 *  - onFinalize clears, including when the ScrollView takes the gesture away.
 *
 * activeOffsetX is what keeps the page scrollable. Without it a vertical drag
 * starting on the chart would be claimed here and the Stats screen would stop
 * scrolling over its own graph. The cost, accepted: beginning a vertical scroll
 * on the chart flashes a readout for an instant before the ScrollView wins.
 *
 * runOnJS because the readout is React state and a date string — it has to
 * cross to the JS thread whatever happens, so there is nothing to gain by
 * hopping through a shared value first.
 */
export function CaloriesChart({ panel }: { panel: NutritionPanel }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [touched, setTouched] = useState<number | null>(null);

  // Card padding (16 each side) inside a screen padded by 16 each side.
  const width = Math.max(160, screenWidth - 64);
  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  // The frame's own bottom gutter, not a coincidence with FRAME_TOP: one is
  // room for the dates under the baseline, the other is air above the plot.
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = panel.days.length;
  const band = bandGeometry(count, plotWidth);

  // One scale for all three series: they are all calories, and giving the mean
  // its own axis would let a flat line look like a steep one.
  const scale = verticalScale(
    [...panel.kcalSeries, ...panel.targetSeries, ...panel.rollingKcalSeries],
    plotHeight,
  );

  const meanPath = d3Line<number>()
    .defined((index) => isDrawable(panel.rollingKcalSeries[index]))
    .x((index) => band.centre(index))
    .y((index) => scale.y(panel.rollingKcalSeries[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  // The goal is a STEP, not a curve: it holds for the whole of its day and then
  // changes, so a slope between two days would draw goals nobody set. curveStepAfter
  // carries a value forward to the next vertex before it jumps, which is the
  // shape a daily goal actually has.
  const goalPath = d3Line<number>()
    .defined((index) => isDrawable(panel.targetSeries[index]))
    .x((index) => band.centre(index))
    .y((index) => scale.y(panel.targetSeries[index] ?? 0))
    .curve(curveStepAfter)(indices(count));

  const shown = touched === null ? null : panel.days[touched];

  const scrub = Gesture.Pan()
    // Only claims the touch once the movement is clearly horizontal, so a
    // vertical drag is left to the ScrollView this chart sits in.
    .activeOffsetX([-8, 8])
    .runOnJS(true)
    .onBegin((event) => setTouched(band.indexAt(event.x)))
    .onUpdate((event) => setTouched(band.indexAt(event.x)))
    // onFinalize rather than onEnd: it also fires when another recogniser wins
    // the gesture, which is exactly what a vertical scroll does.
    .onFinalize(() => setTouched(null));

  return (
    <View>
      <ChartFrame height={HEIGHT} width={width} scale={scale} xLabels={labelsFor(panel, count)}>
        {() => (
          <>
            {panel.kcalSeries.map((kcal, index) =>
              kcal === null ? null : (
                <Rect
                  key={index}
                  x={band.left(index)}
                  y={scale.y(kcal)}
                  width={band.barWidth}
                  height={Math.max(1, plotHeight - scale.y(kcal))}
                  // The accent, like the gauge on the Journal: calories wear
                  // one colour across the application (amendment 14.4 no 15).
                  fill={theme.colors.macroKcal}
                  opacity={touched === null || touched === index ? 1 : 0.35}
                  rx={band.barWidth > 4 ? 2 : 0}
                />
              ),
            )}

            {goalPath === null ? null : (
              <Path
                d={goalPath}
                stroke={theme.colors.textFaint}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
              />
            )}

            {meanPath === null ? null : (
              <Path d={meanPath} stroke={theme.colors.text} strokeWidth={2} fill="none" />
            )}
          </>
        )}
      </ChartFrame>

      {shown === undefined || shown === null ? null : (
        <Tooltip
          x={GUTTER_LEFT + band.centre(touched ?? 0)}
          y={scale.y(shown.consumed?.kcal ?? 0)}
          plotLeft={GUTTER_LEFT}
          plotRight={GUTTER_LEFT + plotWidth}
          day={shown}
          today={panel.days[count - 1]?.date ?? shown.date}
        />
      )}

      {/*
        Over the plot only, offset by the gutter the frame reserves for its
        labels — otherwise a touch on the axis figures would read as day zero.
      */}
      <GestureDetector gesture={scrub}>
        <View
          style={[styles.touch, { left: GUTTER_LEFT, width: plotWidth }]}
          accessibilityRole="image"
          accessibilityLabel="Calories par jour sur la plage choisie"
        />
      </GestureDetector>

      {/*
        The legend STAYS while a bar is being read, where it used to be
        replaced by the readout. The readout moved above the bar, so the two no
        longer compete for the same line — and a legend that vanished the
        moment you touched the chart took away the key to what you were
        pointing at.
      */}
      <View style={styles.legend}>
        <Key color={theme.colors.macroKcal} label="Par jour" />
        <Key color={theme.colors.text} label="Moyenne 7 jours" />
        <Key color={theme.colors.textFaint} label="Objectif" dashed />
      </View>
    </View>
  );
}

/**
 * The readout, ABOVE the bar it describes.
 *
 * It was a line under the chart, and it was in the worst place there is: a
 * finger reaching a bar comes from below, so the hand covered the answer to
 * the question it was asking. Above the bar the figure sits in the one region
 * of the chart a reading hand is never over.
 *
 * ## IT IS A VIEW, NOT AN SvgText
 *
 * It needs a rounded background, a shadow and two weights of Nunito — all
 * three of which are ordinary layout and none of which an SVG text node does
 * without being rebuilt. It is positioned in the same coordinates the chart
 * uses, so it tracks the bar exactly while costing the drawing nothing.
 *
 * ## THREE CLAMPS, AND EACH ONE IS A REAL CASE
 *
 * The first and last bar would push it off the sides — at ninety days those
 * are one point wide and the bubble is a hundred and forty. A bar near the top
 * of the scale would push it off the top, which is the commonest day of all:
 * the highest day of the range. So it is held inside the plot horizontally,
 * and flips to sit INSIDE the bar's top when there is no room above it.
 */
function Tooltip({
  x,
  y,
  plotLeft,
  plotRight,
  day,
  today,
}: {
  /** Centre of the bar, in chart coordinates. */
  x: number;
  /** Top of the bar. */
  y: number;
  plotLeft: number;
  plotRight: number;
  day: DayFigure;
  today: LocalDate;
}) {
  const theme = useTheme();

  const half = TOOLTIP_WIDTH / 2;
  const left = Math.min(Math.max(x - half, plotLeft), plotRight - TOOLTIP_WIDTH);
  // FRAME_TOP is where the plot begins; above it there is nothing to draw on.
  const above = y - TOOLTIP_HEIGHT - 6;
  const top = FRAME_TOP + Math.max(0, above);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.tooltip,
        {
          left,
          top,
          width: TOOLTIP_WIDTH,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
        theme.shadow,
      ]}
    >
      <Text style={[styles.tooltipDay, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {formatDayShort(day.date, today)}
      </Text>
      <Text style={[styles.tooltipValue, { color: theme.colors.text }]} numberOfLines={1}>
        {day.consumed === null ? 'rien enregistré' : `${formatKcal(day.consumed.kcal)} kcal`}
      </Text>
      {day.target === null ? null : (
        <Text style={[styles.tooltipGoal, { color: theme.colors.textFaint }]} numberOfLines={1}>
          objectif {formatKcal(day.target.kcal)}
        </Text>
      )}
    </View>
  );
}

const TOOLTIP_WIDTH = 132;
const TOOLTIP_HEIGHT = 54;

function Key({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.key}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: color },
          dashed === true ? styles.swatchThin : null,
        ]}
      />
      <Text style={[styles.keyLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const HEIGHT = 150;

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/**
 * Whether a position has a value to draw.
 *
 * Both null and undefined, and the second is not paranoia: noUncheckedIndexedAccess
 * makes every indexed read of these arrays `number | null | undefined`, so a
 * check for null alone would typecheck and let an out-of-range index through as
 * a point at zero.
 */
function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/**
 * Dates under the axis, thinned so they never collide.
 *
 * Only the two ends are labelled: at ninety days there is room for perhaps
 * five, and choosing which five is a decision with no good answer — the reader
 * wants "where does this start and where does it end", and touching a bar
 * answers everything in between exactly.
 */
function labelsFor(panel: NutritionPanel, count: number): string[] {
  const last = panel.days[count - 1]?.date;
  return panel.days.map((day, index) => {
    if (last === undefined) return '';
    if (index === 0 || index === count - 1) return formatDayShort(day.date, last);
    return '';
  });
}

const styles = StyleSheet.create({
  touch: { position: 'absolute', top: FRAME_TOP, height: HEIGHT - FRAME_TOP },
  tooltip: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
  },
  tooltipDay: { fontSize: 11 },
  // Tabular, like every other figure of this panel: the bubble must not change
  // width as the finger moves from a three-digit day to a four-digit one.
  tooltipValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tooltipGoal: { fontSize: 11, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, minHeight: 20 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchThin: { height: 2, borderRadius: 1 },
  keyLabel: { fontSize: 12 },
});
