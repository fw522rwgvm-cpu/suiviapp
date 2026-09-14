import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Circle, Line as SvgLine, Path } from 'react-native-svg';
import { formatDayCompact, formatWeight } from '@/core/format';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_LEFT,
  GUTTER_TOP,
} from '@/core/charts/chart-frame';
import { ChartTooltip } from '@/core/charts/chart-tooltip';
import { useScrub } from '@/core/charts/use-scrub';
import { bandGeometry, labelledIndices, linearScale } from '@/core/charts/scale';
import type { WeightPanel } from '@/features/weight/domain/panel';
import type { WeightPoint } from '@/features/weight/domain/smoothing';

/**
 * Weight over the chosen range: the raw series, the smoothed one, and the goal
 * (specs 9.2).
 *
 * > Graphique d'évolution superposant série brute, série lissée et objectif.
 *
 * ## THE AXIS DOES NOT START AT ZERO, AND THAT IS THE OPPOSITE OF THE BAR CHART
 *
 * linearScale rather than verticalScale. A bar encodes quantity by LENGTH, so
 * its baseline has to be zero or the picture lies; a LINE encodes change by
 * SLOPE, and on a domain of 0 to 80 a three-kilo loss over a quarter — the whole
 * subject — occupies four per cent of the plot and reads as flat.
 *
 * The frame's heavier baseline is switched off for the same reason: it says
 * "this is where the bars stand", and here the foot of the plot is around 76 kg
 * and nothing special happens there.
 *
 * ## THE RAW SERIES IS DOTS, THE SMOOTHED ONE IS THE LINE
 *
 * Two lines would compete, and the smoothed one is the one to read: specs 9.2
 * regresses on it, and a raw weight bounces by several hundred grams a day for
 * reasons that have nothing to do with the trend. So the raw measurements are
 * marks — what was actually observed — and the line is what they mean.
 *
 * Above 90 days they disappear entirely (specs 9.2 precision 3), which is the
 * caller's `showRaw`: aggregated by week, the two series are the same line
 * drawn twice.
 *
 * ## A HOLE IS A HOLE, AND THE LINE BREAKS AT IT
 *
 * `defined()` on the smoothed value. A day nobody weighed has no smoothed point
 * at all (specs 9.2 precision 1), so joining across it would draw a straight
 * segment through a fortnight nobody measured — which is exactly the
 * "prolongée artificiellement" the specs forbid, in picture form.
 */
export function WeightChart({ panel }: { panel: WeightPanel }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card padding (16 each side) inside a screen padded by 16 each side — the
  // same arithmetic the calories chart does, and for the same layout.
  const width = Math.max(160, screenWidth - 64);
  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = panel.points.length;
  const band = bandGeometry(count, plotWidth);

  const raw = panel.points.map((point) => point.raw);
  const smoothed = panel.points.map((point) => point.smoothed);
  const target = panel.goal?.goal.targetKg ?? null;

  /**
   * The goal is part of the DOMAIN, not just drawn on top.
   *
   * Without it in the scale, a target eight kilos below the current weight would
   * be off the bottom of the plot — a goal line nobody can see is worse than no
   * goal line, because the chart looks complete.
   */
  const scale = linearScale(
    target === null ? [...raw, ...smoothed] : [...raw, ...smoothed, target],
    plotHeight,
    TICK_COUNT,
    GUTTER_TOP,
  );

  const smoothedPath = d3Line<number>()
    .defined((index) => isDrawable(smoothed[index]))
    .x((index) => band.centre(index))
    .y((index) => scale.y(smoothed[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  const { touched, gesture: scrub } = useScrub(band);
  const shown = touched === null ? null : panel.points[touched];

  return (
    <View>
      <View style={{ height: FRAME_TOP + HEIGHT }}>
        <ChartFrame
          height={HEIGHT}
          width={width}
          scale={scale}
          // No zero on this axis, so no heavier line along the foot of it.
          baseline={false}
          // Whole kilos would print "76" three or four times over a narrow
          // domain. One decimal is what a scale reads, and what the ticks are.
          formatTick={(value) => value.toFixed(1).replace('.', ',')}
          xLabels={labelsFor(panel, count, plotWidth / Math.max(1, count))}
        >
          {() => (
            <>
              {/*
                THE GOAL IS A FLAT LINE AT THE TARGET, NOT A TRAJECTORY.

                A sloping "path to the goal" was the alternative and it needs a
                starting weight at the date the goal was set — which may not
                exist, nobody having weighed themselves that day. The flat line
                is what "objectif" literally means, it is true in both modes, and
                it assumes nothing. How fast you are approaching it is the rate
                card's job, which specs 9.4 asks for separately.
              */}
              {target === null ? null : (
                <SvgLine
                  x1={0}
                  x2={plotWidth}
                  y1={scale.y(target)}
                  y2={scale.y(target)}
                  stroke={theme.colors.accent}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              )}

              {/*
                The raw measurements, where the range is fine enough for them to
                mean anything (specs 9.2 precision 3).
              */}
              {!panel.showRaw
                ? null
                : raw.map((value, index) =>
                    !isDrawable(value) ? null : (
                      <Circle
                        key={`raw-${index}`}
                        cx={band.centre(index)}
                        cy={scale.y(value ?? 0)}
                        // Small enough to read as a measurement rather than as a
                        // series of its own, and it shrinks with the band so
                        // ninety of them do not merge into a ribbon.
                        r={Math.min(2.5, Math.max(1, band.barWidth / 2))}
                        fill={theme.colors.textFaint}
                      />
                    ),
                  )}

              {smoothedPath === null ? null : (
                <Path
                  d={smoothedPath}
                  stroke={theme.colors.text}
                  strokeWidth={2}
                  fill="none"
                />
              )}

              {/* The point being read, marked on the line it belongs to. */}
              {shown === null || shown === undefined || shown.smoothed === null ? null : (
                <Circle
                  cx={band.centre(touched ?? 0)}
                  cy={scale.y(shown.smoothed)}
                  r={4}
                  fill={theme.colors.text}
                />
              )}
            </>
          )}
        </ChartFrame>

        {shown === null || shown === undefined ? null : (
          <ChartTooltip
            x={GUTTER_LEFT + band.centre(touched ?? 0)}
            anchorY={scale.y(shown.smoothed ?? shown.raw ?? scale.max)}
            plotHeight={plotHeight}
            plotLeft={GUTTER_LEFT}
            plotRight={GUTTER_LEFT + plotWidth}
          >
            <PointReadout point={shown} showRaw={panel.showRaw} />
          </ChartTooltip>
        )}

        <GestureDetector gesture={scrub}>
          <View
            style={[styles.touch, { left: GUTTER_LEFT, width: plotWidth }]}
            accessibilityRole="image"
            accessibilityLabel="Courbe de poids sur la plage choisie"
          />
        </GestureDetector>
      </View>

      <View style={styles.legend}>
        {panel.showRaw ? <Key color={theme.colors.textFaint} label="Pesées" dot /> : null}
        <Key color={theme.colors.text} label="Lissé 7 jours" line />
        {target === null ? null : <Key color={theme.colors.accent} label="Objectif" line />}
      </View>
    </View>
  );
}

/**
 * What the bubble says about one point.
 *
 * The smoothed value leads, because it is the one the whole panel reasons
 * about; the raw measurement follows when there is one and when the range still
 * shows them. A bucket nobody weighed says so rather than showing a blank.
 */
function PointReadout({ point, showRaw }: { point: WeightPoint; showRaw: boolean }) {
  const theme = useTheme();

  return (
    <>
      {/*
        WeightPoint carries a LocalDate, so nothing has to be asserted here —
        the branded type travels from the read all the way to the label, which
        is what conventions section 4 asks for when it rules out assertions.
      */}
      <Text style={[styles.tooltipDay, { color: theme.colors.textMuted }]}>
        {formatDayCompact(point.date)}
      </Text>
      <Text style={[styles.tooltipValue, { color: theme.colors.text }]}>
        {point.smoothed === null ? 'Pas de pesée' : formatWeight(point.smoothed)}
      </Text>
      {!showRaw || point.raw === null || point.smoothed === null ? null : (
        <Text style={[styles.tooltipRaw, { color: theme.colors.textMuted }]}>
          Pesée : {formatWeight(point.raw)}
        </Text>
      )}
    </>
  );
}

function Key({
  color,
  label,
  line,
  dot,
}: {
  color: string;
  label: string;
  line?: boolean;
  dot?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.key}>
      <View
        style={[
          styles.swatch,
          line === true ? styles.swatchLine : null,
          dot === true ? styles.swatchDot : null,
          { backgroundColor: color },
        ]}
      />
      <Text style={[styles.keyLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const HEIGHT = 180;
const TICK_COUNT = 4;

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/**
 * Whether a position has a value to draw.
 *
 * Both null and undefined, and the second is not paranoia: noUncheckedIndexedAccess
 * makes every indexed read of these arrays `number | null | undefined`, so a
 * check for null alone would typecheck and let an out-of-range index through as
 * a point at zero — which on a weight axis is not even on the plot.
 */
function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function labelsFor(panel: WeightPanel, count: number, slotWidth: number): string[] {
  const shown = new Set(labelledIndices(count, slotWidth));
  return panel.points.map((point, index) =>
    shown.has(index) ? formatDayCompact(point.date) : '',
  );
}

const styles = StyleSheet.create({
  touch: { position: 'absolute', top: FRAME_TOP, height: HEIGHT - FRAME_TOP },
  tooltipDay: { fontSize: 11 },
  tooltipValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tooltipRaw: { fontSize: 11, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, minHeight: 20 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchLine: { height: 2, borderRadius: 1 },
  swatchDot: { width: 6, height: 6, borderRadius: 3 },
  keyLabel: { fontSize: 12 },
});
