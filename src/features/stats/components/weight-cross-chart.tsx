import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Path } from 'react-native-svg';
import { formatDayCompact, formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_LEFT,
  GUTTER_TOP,
  plotWidthFor,
} from '@/core/charts/chart-frame';
import {
  bandGeometry,
  labelledIndices,
  linearScale,
  verticalScale,
} from '@/core/charts/scale';
import type { LocalDate } from '@/core/date';
import type { WeightPanel } from '@/features/weight/domain/panel';

/**
 * Smoothed weight against the rolling mean of calories (specs 9.4).
 *
 * > Graphique croisé : poids lissé superposé à la moyenne mobile des calories
 * > consommées.
 *
 * ## THE SECOND DUAL AXIS OF THE APPLICATION, AND ChartFrame ALREADY HAD ONE
 *
 * The macro chart of slice 7 was the first — grams on the left, kilocalories on
 * the right — so nothing here had to be built. What it needed was what the
 * weight curve needed: a left scale that does not start at zero, which is
 * linearScale, and a baseline that is not drawn because the foot of the plot is
 * not zero.
 *
 * The right axis keeps the rules slice 7 set for it: IT DRAWS NO GRIDLINES OF
 * ITS OWN, and its labels are tinted with its own series' colour, so it is never
 * a guess which axis serves which. Two sets of rules at two sets of heights is
 * the noise that gives dual axes their bad name.
 *
 * ## BOTH SERIES ARE SMOOTHED, AND THEY MUST BE
 *
 * A raw weight bounces several hundred grams a day and a day's calories swing by
 * a third; crossing the two raw series would be crossing two clouds. The whole
 * question this chart asks — does eating less show up in the weight, and how
 * long afterwards — only has a shape once both are means.
 *
 * ## NO SCRUB HERE, UNLIKE THE OTHER THREE
 *
 * A touch reads ONE value, and this chart's subject is the relationship between
 * two. A bubble saying "78,2 kg / 2 150 kcal" answers a question nobody asked of
 * it — the single-series charts above already answer that one, for their own
 * range, with more room. What is read here is the shape.
 */
export function WeightCrossChart({
  panel,
  /** Rolling mean of calories, one value per bucket of the panel's range. */
  kcalSeries,
}: {
  panel: WeightPanel;
  kcalSeries: readonly (number | null)[];
}) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const width = Math.max(160, screenWidth - 64);
  // The frame narrows the plot itself when a second axis is asked for, and the
  // caller needs the SAME number to lay its bands out. A formula written twice
  // is a formula free to disagree the day a gutter changes.
  const plotWidth = plotWidthFor(width, true);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = panel.points.length;
  const band = bandGeometry(count, plotWidth);

  const smoothed = panel.points.map((point) => point.smoothed);

  const weightScale = linearScale(smoothed, plotHeight, TICK_COUNT, GUTTER_TOP);
  /**
   * The calories axis DOES start at zero.
   *
   * verticalScale rather than linearScale, and the asymmetry is deliberate: a
   * weight of zero is meaningless and a calorie intake of zero is a real,
   * readable quantity — it is the floor the amount is measured from. Framing
   * calories around their own spread would make a 200 kcal wobble look like the
   * difference between fasting and feasting.
   */
  const kcalScale = verticalScale(kcalSeries, plotHeight, TICK_COUNT, GUTTER_TOP);

  const weightPath = d3Line<number>()
    .defined((index) => isDrawable(smoothed[index]))
    .x((index) => band.centre(index))
    .y((index) => weightScale.y(smoothed[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  const kcalPath = d3Line<number>()
    .defined((index) => isDrawable(kcalSeries[index]))
    .x((index) => band.centre(index))
    .y((index) => kcalScale.y(kcalSeries[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  return (
    <View>
      <View style={{ height: FRAME_TOP + HEIGHT }}>
        <ChartFrame
          height={HEIGHT}
          width={width}
          scale={weightScale}
          rightScale={kcalScale}
          rightTint={theme.colors.macroKcal}
          baseline={false}
          formatTick={(value) => value.toFixed(1).replace('.', ',')}
          // Its own formatter, because the right axis is a different NATURE:
          // whole kilocalories beside kilograms to one decimal.
          formatRightTick={(value) => formatKcal(value)}
          xLabels={labelsFor(panel.points, count, plotWidth / Math.max(1, count))}
        >
          {() => (
            <>
              {kcalPath === null ? null : (
                <Path
                  d={kcalPath}
                  stroke={theme.colors.macroKcal}
                  strokeWidth={2}
                  fill="none"
                />
              )}
              {weightPath === null ? null : (
                // Drawn last, so the subject of the screen is the line on top.
                <Path
                  d={weightPath}
                  stroke={theme.colors.text}
                  strokeWidth={2}
                  fill="none"
                />
              )}
            </>
          )}
        </ChartFrame>
      </View>

      <View style={styles.legend}>
        <Key color={theme.colors.text} label="Poids lissé" />
        <Key color={theme.colors.macroKcal} label="Calories, moyenne 7 jours" />
      </View>
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.keyLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const HEIGHT = 180;
const TICK_COUNT = 4;

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function labelsFor(
  points: readonly { date: LocalDate }[],
  count: number,
  slotWidth: number,
): string[] {
  const shown = new Set(labelledIndices(count, slotWidth));
  return points.map((point, index) => (shown.has(index) ? formatDayCompact(point.date) : ''));
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, minHeight: 20 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 2, borderRadius: 1 },
  keyLabel: { fontSize: 12 },
});
