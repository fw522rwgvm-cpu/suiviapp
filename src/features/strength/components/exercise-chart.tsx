import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Circle, Path } from 'react-native-svg';
import { formatDayCompact } from '@/core/format';
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
import type { Grain } from '@/core/db/date-bucket';
import type { ChartPoint } from '../domain/exercise-range';
import {
  metricCaption,
  metricValueText,
  type ExerciseMetric,
} from '../domain/exercise-metric';

/**
 * One of the five series of specs 10.1, over the chosen range.
 *
 * > Graphiques sur 3 mois / 1 an / tout : charge maximale, 1RM estimé,
 * > meilleur volume de série, volume de séance, total de répétitions.
 *
 * ## FIVE SERIES, ONE CHART AT A TIME
 *
 * Five stacked charts would be seven or eight hundred points of scrolling on a
 * page that also carries the exercise's identity, its body map, its notes and
 * its history — and four of them would be scrolled past every time. A chooser
 * above one chart costs a tap and gives each series the full width.
 *
 * The chooser is CHIPS rather than a segmented control, for the reason
 * exercise-filter already uses them: five labels do not fit 390 points as
 * equal segments, and "Vol. séance" truncated to "Vol. sé…" is the one thing
 * that makes a chooser useless.
 *
 * ## A LINE, ON A SCALE THAT DOES NOT START AT ZERO
 *
 * linearScale rather than verticalScale, and the weight curve's argument
 * applies unchanged: a line encodes change by SLOPE, and on a domain of 0 to
 * 120 kg a five-kilo gain over a quarter — the whole subject — is four per
 * cent of the plot and reads as flat. The frame's heavier baseline goes with
 * it, since the foot of the plot is not zero and a strong rule there would say
 * something untrue with emphasis.
 *
 * ## A GAP IS A BREAK IN THE LINE, NOT A DIP TO THE FLOOR
 *
 * `defined()` on the value. A bucket with no volume — a month of bodyweight
 * sets — has null, and joining across it would draw a straight segment through
 * work that was done but cannot be measured in kilogram-repetitions. The rule
 * of the whole slice, in picture form.
 *
 * ## THE POINTS ARE DRAWN AS WELL AS JOINED
 *
 * Unlike the weight curve, where the marks are the RAW series and the line is
 * the smoothing. Here there is no smoothing: every point is a session, or a
 * bucket of them, and a line alone would hide how many there are. Four
 * sessions in a quarter and forty draw the same line; the dots are what say
 * which.
 *
 * ## NOT TESTED, AND DELIBERATELY SO
 *
 * The rendering of a chart is not covered anywhere in this project, by
 * construction — only the arithmetic behind it is, in exercise-stats and
 * exercise-range. That line is kept here.
 */
export function ExerciseChart({
  points,
  metric,
  grain,
}: {
  points: readonly ChartPoint[];
  metric: ExerciseMetric;
  grain: Grain;
}) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card padding (16 each side) inside a screen padded by 16 each side — the
  // arithmetic every chart in this application does.
  const width = Math.max(160, screenWidth - 64);
  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const values = points.map((point) => metric.value(point));
  const count = points.length;
  const band = bandGeometry(count, plotWidth);
  const scale = linearScale(values, plotHeight, TICK_COUNT, GUTTER_TOP);

  const path = d3Line<number>()
    .defined((index) => isDrawable(values[index]))
    .x((index) => band.centre(index))
    .y((index) => scale.y(values[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  const { touched, gesture: scrub } = useScrub(band);
  const shown = touched === null ? null : points[touched];
  const caption = metricCaption(metric, grain);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{metric.label}</Text>
        {/*
          Said out loud whenever a point is not one session. Without it a
          monthly mean of four workouts looks exactly like one workout, which
          is the misreading this whole aggregation invites.
        */}
        {caption === null ? null : (
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{caption}</Text>
        )}
      </View>

      {count === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Rien d’enregistré sur cette période.
        </Text>
      ) : (
        <View style={{ height: FRAME_TOP + HEIGHT }}>
          <ChartFrame
            height={HEIGHT}
            width={width}
            scale={scale}
            // No zero on this axis, so no heavier line along the foot of it.
            baseline={false}
            formatTick={(value) => tickText(value, metric)}
            xLabels={labelsFor(points, plotWidth / Math.max(1, count))}
          >
            {() => (
              <>
                {path === null ? null : (
                  <Path d={path} stroke={theme.colors.accent} strokeWidth={2} fill="none" />
                )}

                {values.map((value, index) =>
                  !isDrawable(value) ? null : (
                    <Circle
                      key={index}
                      cx={band.centre(index)}
                      cy={scale.y(value ?? 0)}
                      // Shrinks with the band, so a hundred points stay a line
                      // with texture rather than merging into a ribbon.
                      r={Math.min(3, Math.max(1.2, band.barWidth / 2))}
                      fill={theme.colors.accent}
                    />
                  ),
                )}

                {shown === undefined || shown === null || !isDrawable(metric.value(shown)) ? null : (
                  <Circle
                    cx={band.centre(touched ?? 0)}
                    cy={scale.y(metric.value(shown) ?? 0)}
                    r={5}
                    fill={theme.colors.accent}
                    stroke={theme.colors.surface}
                    strokeWidth={2}
                  />
                )}
              </>
            )}
          </ChartFrame>

          {shown === undefined || shown === null ? null : (
            <ChartTooltip
              x={GUTTER_LEFT + band.centre(touched ?? 0)}
              anchorY={scale.y(metric.value(shown) ?? scale.max)}
              plotHeight={plotHeight}
              plotLeft={GUTTER_LEFT}
              plotRight={GUTTER_LEFT + plotWidth}
            >
              <Readout point={shown} metric={metric} grain={grain} />
            </ChartTooltip>
          )}

          <GestureDetector gesture={scrub}>
            <View
              style={[styles.touch, { left: GUTTER_LEFT, width: plotWidth }]}
              accessibilityRole="image"
              accessibilityLabel={`${metric.label} sur la plage choisie`}
            />
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

/**
 * What the bubble says about one point (specs 10.6, the one interaction).
 *
 * > Toucher un point affiche sa valeur et sa date.
 *
 * Plus, on a bucket, how many sessions it stands for. That third line is not
 * decoration: it is the difference between "72,5 kg in March" and "the most
 * anybody lifted across four March sessions", and the point cannot say which
 * on its own.
 */
function Readout({
  point,
  metric,
  grain,
}: {
  point: ChartPoint;
  metric: ExerciseMetric;
  grain: Grain;
}) {
  const theme = useTheme();
  const value = metric.value(point);

  return (
    <>
      <Text style={[styles.tooltipDay, { color: theme.colors.textMuted }]}>
        {formatDayCompact(point.date)}
      </Text>
      <Text style={[styles.tooltipValue, { color: theme.colors.text }]}>
        {value === null ? 'Non mesuré' : metricValueText(metric, value)}
      </Text>
      {grain === 'day' ? null : (
        <Text style={[styles.tooltipNote, { color: theme.colors.textMuted }]}>
          {point.sessions === 1 ? '1 séance' : `${point.sessions} séances`}
        </Text>
      )}
    </>
  );
}

/** A tick, in the metric's own precision. A comma, as everywhere. */
function tickText(value: number, metric: ExerciseMetric): string {
  const rounded = value.toFixed(metric.decimals);
  return (metric.decimals > 0 ? String(Number(rounded)) : rounded).replace('.', ',');
}

/**
 * The dates under the plot, thinned so they cannot collide.
 *
 * labelledIndices owns the thinning; this only turns the survivors into text,
 * exactly as the other charts do.
 */
function labelsFor(points: readonly ChartPoint[], slot: number): string[] {
  const shown = new Set(labelledIndices(points.length, slot));
  return points.map((point, index) =>
    shown.has(index) ? formatDayCompact(point.date) : '',
  );
}

function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

const HEIGHT = 168;
const TICK_COUNT = 4;

const styles = StyleSheet.create({
  container: { gap: 8 },
  heading: { gap: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 12 },
  empty: { fontSize: 14, paddingVertical: 28, textAlign: 'center' },
  touch: { position: 'absolute', top: 0, bottom: 0 },
  tooltipDay: { fontSize: 11 },
  tooltipValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tooltipNote: { fontSize: 11 },
});
