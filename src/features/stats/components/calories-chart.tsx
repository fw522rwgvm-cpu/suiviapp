import { curveMonotoneX, curveStepAfter, line as d3Line } from 'd3-shape';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Path, Rect } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { formatDayShort, formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { ChartFrame, GUTTER_LEFT } from '@/core/charts/chart-frame';
import { bandGeometry, verticalScale } from '@/core/charts/scale';
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
 * ## ONE INTERACTION, AND ONLY ONE
 *
 * > Aucun zoom ni déplacement au doigt : les sélecteurs de plage y pourvoient
 * > déjà. Une seule interaction : toucher un point affiche sa valeur et sa
 * > date. (Specs 10.6, D13)
 *
 * So: a Pressable over the plot, mapping x to a slot. A press-and-drag would be
 * a scrub, which is a second interaction nobody asked for; this reads on press
 * and clears on release, which keeps the readout tied to a deliberate act.
 */
export function CaloriesChart({ panel }: { panel: NutritionPanel }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [touched, setTouched] = useState<number | null>(null);

  // Card padding (16 each side) inside a screen padded by 16 each side.
  const width = Math.max(160, screenWidth - 64);
  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  const plotHeight = HEIGHT - 16;

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

      {/*
        Over the plot only, offset by the gutter the frame reserves for its
        labels — otherwise a touch on the axis figures would read as day zero.
      */}
      <Pressable
        style={[styles.touch, { left: GUTTER_LEFT, width: plotWidth }]}
        onPressIn={(event) => setTouched(band.indexAt(event.nativeEvent.locationX))}
        onPressOut={() => setTouched(null)}
        accessibilityRole="image"
        accessibilityLabel="Calories par jour sur la plage choisie"
      />

      <View style={styles.legend}>
        {shown === undefined || shown === null ? (
          <>
            <Key color={theme.colors.macroKcal} label="Par jour" />
            <Key color={theme.colors.text} label="Moyenne 7 jours" />
            <Key color={theme.colors.textFaint} label="Objectif" dashed />
          </>
        ) : (
          <Text style={[styles.readout, { color: theme.colors.text }]}>
            {formatDayShort(shown.date, panel.days[count - 1]?.date ?? shown.date)} ·{' '}
            {shown.consumed === null
              ? 'rien enregistré'
              : `${formatKcal(shown.consumed.kcal)} kcal`}
            {shown.target === null ? '' : ` · objectif ${formatKcal(shown.target.kcal)}`}
          </Text>
        )}
      </View>
    </View>
  );
}

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
  touch: { position: 'absolute', top: 16, height: HEIGHT - 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, minHeight: 20 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchThin: { height: 2, borderRadius: 1 },
  keyLabel: { fontSize: 12 },
  readout: { fontSize: 13, fontWeight: '600' },
});
