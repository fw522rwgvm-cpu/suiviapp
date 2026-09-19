import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Path } from 'react-native-svg';
import { formatDayCompact } from '@/core/format';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_TOP,
  plotWidthFor,
} from '@/core/charts/chart-frame';
import { bandGeometry, labelledIndices, linearScale, verticalScale } from '@/core/charts/scale';
import type { LocalDate } from '@/core/date';

/**
 * Strength volume against smoothed weight (specs 10.6).
 *
 * > Graphique croisé : volume de musculation et poids lissé.
 *
 * ## THE SECOND CROSSED CHART, AND IT IS NOT THE FIRST ONE GENERALISED
 *
 * WeightCrossChart crosses weight with calories (specs 9.4). Sharing a
 * component between them would have meant one that takes two arbitrary series,
 * two scales, two formatters, two tints and two legends — which is
 * ChartFrame, and ChartFrame is already shared. What differs here is every
 * one of those, so what is reused is the frame and the scales.
 *
 * ## WEIGHT ON THE LEFT AND IT DOES NOT START AT ZERO; VOLUME ON THE RIGHT
 * ## AND IT DOES
 *
 * The asymmetry WeightCrossChart already states, with the same reasoning: a
 * weight of zero is meaningless, so linearScale frames the values themselves
 * and the heavier baseline is switched off. A volume of zero is a real,
 * readable quantity — it is a week with no training — so verticalScale, and
 * the right axis is measured from it.
 *
 * The right axis draws no gridlines of its own, which is the rule slice 7 set
 * for the first dual axis and slice 8 kept. Its labels take its series'
 * colour, so it is never a guess which axis serves which.
 *
 * ## BOTH SERIES ARE ON THE SAME BUCKETS, AND THAT IS STRUCTURAL
 *
 * They are indexed by the SAME date axis, built once from the weight read and
 * filled from a volume map keyed by `bucketOf`. That is precisely why
 * core/db/date-bucket exists: two series of one chart landing on buckets six
 * days apart is the defect sharing avoids, and here it would put a training
 * week beside the wrong weight.
 *
 * ## NEVER PER SESSION, WHATEVER THE RANGE SAYS
 *
 * The caller coarsens the grain to a week at minimum. A per-session volume
 * against a weight that moves over weeks is two clouds — the same argument
 * WeightCrossChart makes about crossing two raw series — and the question this
 * chart asks only has a shape once both are means.
 *
 * ## NO SCRUB, AS ON THE OTHER CROSSED CHART
 *
 * A touch reads ONE value and this chart's subject is a relationship between
 * two. The panel above already answers "how much volume, when", for the same
 * range, with more room. What is read here is the shape.
 */
export function StrengthCrossChart({
  dates,
  volumeKg,
  smoothedWeightKg,
  caption,
}: {
  /** The shared axis. Dense over the range, at the crossing grain. */
  dates: readonly LocalDate[];
  /** Mean volume per session in each bucket, null where nothing was measurable. */
  volumeKg: readonly (number | null)[];
  /** Smoothed weight in each bucket, null where nobody weighed. */
  smoothedWeightKg: readonly (number | null)[];
  /** What a point stands for — "Moyenne par semaine". */
  caption: string;
}) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const width = Math.max(160, screenWidth - 64);
  // The frame narrows the plot when a second axis is asked for, and the caller
  // needs the SAME number to lay its bands out. A formula written twice is a
  // formula free to disagree the day a gutter changes.
  const plotWidth = plotWidthFor(width, true);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = dates.length;
  const band = bandGeometry(count, plotWidth);

  const weightScale = linearScale(smoothedWeightKg, plotHeight, TICK_COUNT, GUTTER_TOP);
  const volumeScale = verticalScale(volumeKg, plotHeight, TICK_COUNT, GUTTER_TOP);

  const weightPath = d3Line<number>()
    .defined((index) => isDrawable(smoothedWeightKg[index]))
    .x((index) => band.centre(index))
    .y((index) => weightScale.y(smoothedWeightKg[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  const volumePath = d3Line<number>()
    .defined((index) => isDrawable(volumeKg[index]))
    .x((index) => band.centre(index))
    .y((index) => volumeScale.y(volumeKg[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  const hasWeight = smoothedWeightKg.some(isDrawable);

  return (
    <View>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{caption}</Text>

      <View style={{ height: FRAME_TOP + HEIGHT }}>
        <ChartFrame
          height={HEIGHT}
          width={width}
          scale={weightScale}
          rightScale={volumeScale}
          rightTint={theme.colors.accent}
          // No zero on the weight axis, so no heavier line along the foot.
          baseline={false}
          formatTick={(value) => value.toFixed(1).replace('.', ',')}
          // Its own formatter, because the right axis is of another NATURE:
          // whole kilogram-repetitions beside kilograms to one decimal.
          formatRightTick={(value) => String(Math.round(value))}
          xLabels={labelsFor(dates, plotWidth / Math.max(1, count))}
        >
          {() => (
            <>
              {volumePath === null ? null : (
                <Path d={volumePath} stroke={theme.colors.accent} strokeWidth={2} fill="none" />
              )}
              {weightPath === null ? null : (
                // Drawn last: the weight is what the volume is being read
                // against, so it is the line on top.
                <Path d={weightPath} stroke={theme.colors.text} strokeWidth={2} fill="none" />
              )}
            </>
          )}
        </ChartFrame>
      </View>

      <View style={styles.legend}>
        <Key color={theme.colors.text} label="Poids lissé" />
        <Key color={theme.colors.accent} label="Volume" />
      </View>

      {/*
        SAID RATHER THAN LEFT AS AN EMPTY AXIS. With no weighing in the range
        the chart is a volume line with a left axis of nothing, which reads as
        a rendering fault. Specs 9.1 makes weight a V2 feature somebody may
        simply not use.
      */}
      {hasWeight ? null : (
        <Text style={[styles.note, { color: theme.colors.textFaint }]}>
          Aucune pesée sur cette période : seul le volume est tracé.
        </Text>
      )}
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

function labelsFor(dates: readonly LocalDate[], slot: number): string[] {
  const shown = new Set(labelledIndices(dates.length, slot));
  return dates.map((date, index) => (shown.has(index) ? formatDayCompact(date) : ''));
}

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

const HEIGHT = 180;
const TICK_COUNT = 4;

const styles = StyleSheet.create({
  caption: { fontSize: 12, marginBottom: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10, minHeight: 20 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 2, borderRadius: 1 },
  keyLabel: { fontSize: 12 },
  note: { fontSize: 12, marginTop: 6 },
});
