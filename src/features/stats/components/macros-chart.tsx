import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Circle, Path } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import {
  formatDayCompact,
  formatDayShort,
  formatKcal,
  formatMacroWhole,
} from '@/core/format';
import { useTheme, type ColorTokens } from '@/core/theme';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_LEFT,
  GUTTER_TOP,
  plotWidthFor,
} from '@/core/charts/chart-frame';
import { ChartTooltip } from '@/core/charts/chart-tooltip';
import { useScrub } from '@/core/charts/use-scrub';
import { bandGeometry, labelledIndices, verticalScale } from '@/core/charts/scale';
import type { LocalDate } from '@/core/date';
import type { NutritionPanel } from '../domain/panel';

/**
 * Protein, carbohydrates and fat, in grams, day by day (specs 8.7).
 *
 * ## WHAT IT ADDS THAT THE SPLIT CARD CANNOT
 *
 * The split states a balance averaged over the whole range, which is the right
 * answer to "what do I eat" and no answer at all to "has it moved". A month
 * whose protein slid from 160 g to 110 g reads as one unchanged pie. Three
 * lines are the only shape that shows the slide.
 *
 * ## ONE AXIS FOR THE THREE, DELIBERATELY
 *
 * They are all grams, and the comparison between them is the subject — an axis
 * each would let a flat line look steep and put fat visually level with
 * carbohydrates. The cost is that fat, being the smallest of the three by
 * nature, lives low on the chart. That is not a distortion: it IS the smaller
 * number.
 *
 * ## SMOOTHED OVER A WEEK, NOT RAW
 *
 * Raw, ninety days of macros is three lines crossing each other every day: the
 * shape of daily variation, which nobody asked about and which the Journal
 * already answers a day at a time. The seven-day mean specs 8.7 names is what
 * makes drift visible, and drift is the only question a range of ninety days
 * can be asked. A window with no measurement in it at all breaks the lines
 * rather than dropping them to zero, the rule this whole panel holds to.
 *
 * ## CALORIES RIDE A SECOND AXIS, IN A DASHED LINE
 *
 * They belong here — macros drifting at constant calories is a different story
 * from macros drifting because everything did — and they cannot share the left
 * axis: two thousand against a hundred and fifty would press the three macros
 * flat onto the floor. So a right-hand axis, tinted to say which is which, and
 * a dashed stroke to say it is not one of the three.
 */
export function MacrosChart({ panel }: { panel: NutritionPanel }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card padding (16 each side) inside a screen padded by 16 each side.
  const width = Math.max(160, screenWidth - 64);
  // A second axis is in play, so the plot is narrower on both sides.
  const plotWidth = plotWidthFor(width, true);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = panel.days.length;
  const band = bandGeometry(count, plotWidth);
  const { touched, gesture } = useScrub(band);

  const series: { key: keyof typeof panel.macroSeries; color: keyof ColorTokens }[] = [
    { key: 'protein', color: 'macroProtein' },
    { key: 'carbs', color: 'macroCarbs' },
    { key: 'fat', color: 'macroFat' },
  ];

  const smoothed = panel.rollingMacroSeries;

  const scale = verticalScale(
    [...smoothed.protein, ...smoothed.carbs, ...smoothed.fat],
    plotHeight,
    TICK_COUNT,
    GUTTER_TOP,
  );

  const kcalScale = verticalScale(
    panel.rollingKcalSeries,
    plotHeight,
    TICK_COUNT,
    GUTTER_TOP,
  );

  const shown = touched === null ? null : panel.days[touched];
  const at = (values: readonly (number | null)[]): number | null =>
    touched === null ? null : (values[touched] ?? null);

  /** The highest of the three at the touched day: what the bubble sits above. */
  const highest = Math.max(
    ...[at(smoothed.protein), at(smoothed.carbs), at(smoothed.fat)]
      .filter((value): value is number => value !== null),
    Number.NEGATIVE_INFINITY,
  );
  const anchorY = Number.isFinite(highest) ? scale.y(highest) : plotHeight;

  // On the RIGHT scale, which is the whole point of it being a second axis.
  const kcalPath = d3Line<number>()
    .defined((index) => isDrawable(panel.rollingKcalSeries[index]))
    .x((index) => band.centre(index))
    .y((index) => kcalScale.y(panel.rollingKcalSeries[index] ?? 0))
    .curve(curveMonotoneX)(indices(count));

  return (
    <View>
      <View style={{ height: FRAME_TOP + HEIGHT }}>
        <ChartFrame
          height={HEIGHT}
          width={width}
          scale={scale}
          rightScale={kcalScale}
          rightTint={theme.colors.macroKcal}
          xLabels={labelsFor(panel, count, plotWidth / Math.max(1, count))}
        >
          {() => (
            <>
              {/*
                Calories first, so the three macros — the subject — are drawn
                over their context rather than under it.
              */}
              {kcalPath === null ? null : (
                <Path
                  d={kcalPath}
                  stroke={theme.colors.macroKcal}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  opacity={touched === null ? 1 : 0.45}
                />
              )}

              {series.map(({ key, color }) => {
                const values = smoothed[key];
                const path = d3Line<number>()
                  .defined((index) => isDrawable(values[index]))
                  .x((index) => band.centre(index))
                  .y((index) => scale.y(values[index] ?? 0))
                  .curve(curveMonotoneX)(indices(count));

                return path === null ? null : (
                  <Path
                    key={key}
                    d={path}
                    stroke={theme.colors[color]}
                    strokeWidth={2}
                    fill="none"
                    opacity={touched === null ? 1 : 0.45}
                  />
                );
              })}

              {/*
                Three dots on the touched day, so the bubble's figures can be
                matched to their lines. Drawn last, at full strength, while the
                lines behind them fade — which is what makes one day stand out
                of ninety without moving anything.
              */}
              {touched === null || shown?.consumed === null || shown?.consumed === undefined
                ? null
                : series.flatMap(({ key, color }) => {
                    const value = at(smoothed[key]);
                    return value === null
                      ? []
                      : [
                          <Circle
                            key={`dot-${key}`}
                            cx={band.centre(touched)}
                            cy={scale.y(value)}
                            r={3}
                            fill={theme.colors[color]}
                          />,
                        ];
                  })}
            </>
          )}
        </ChartFrame>

        {shown === undefined || shown === null ? null : (
          <ChartTooltip
            x={GUTTER_LEFT + band.centre(touched ?? 0)}
            anchorY={anchorY}
            plotHeight={plotHeight}
            plotLeft={GUTTER_LEFT}
            plotRight={GUTTER_LEFT + plotWidth}
          >
            <MacroReadout
              date={shown.date}
              today={panel.days[count - 1]?.date ?? shown.date}
              protein={at(smoothed.protein)}
              carbs={at(smoothed.carbs)}
              fat={at(smoothed.fat)}
              kcal={at(panel.rollingKcalSeries)}
            />
          </ChartTooltip>
        )}

        <GestureDetector gesture={gesture}>
          <View
            style={[styles.touch, { left: GUTTER_LEFT, width: plotWidth }]}
            accessibilityRole="image"
            accessibilityLabel="Protéines, glucides et lipides par jour"
          />
        </GestureDetector>
      </View>

      <View style={styles.legend}>
        <Key color={theme.colors.macroProtein} label="Protéines" />
        <Key color={theme.colors.macroCarbs} label="Glucides" />
        <Key color={theme.colors.macroFat} label="Lipides" />
        <Key color={theme.colors.macroKcal} label="Calories" dashed />
      </View>
    </View>
  );
}

/**
 * What the bubble says, and it says the SMOOTHED figures.
 *
 * The dots sit on the lines, so the numbers beside them have to be the lines'
 * values — a dot on a smoothed curve labelled with that day's raw intake would
 * be a figure that does not match the point it is attached to.
 *
 * Which is why it says so out loud. "Moyenne 7 jours" is what stops the bubble
 * being mistaken for what was eaten that day, and the Journal is where that
 * question is answered.
 */
function MacroReadout({
  date,
  today,
  protein,
  carbs,
  fat,
  kcal,
}: {
  date: LocalDate;
  today: LocalDate;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  kcal: number | null;
}) {
  const theme = useTheme();
  const empty = protein === null && carbs === null && fat === null;

  return (
    <>
      <Text style={[styles.day, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {formatDayShort(date, today)}
      </Text>
      {empty ? (
        <Text style={[styles.value, { color: theme.colors.text }]}>rien enregistré</Text>
      ) : (
        <>
          <Text style={[styles.basis, { color: theme.colors.textFaint }]} numberOfLines={1}>
            moyenne 7 jours
          </Text>
          <Row color={theme.colors.macroProtein} grams={protein} />
          <Row color={theme.colors.macroCarbs} grams={carbs} />
          <Row color={theme.colors.macroFat} grams={fat} />
          {kcal === null ? null : (
            <Row color={theme.colors.macroKcal} grams={kcal} unit="kcal" />
          )}
        </>
      )}
    </>
  );
}

/**
 * A dot and a figure, with no name.
 *
 * The legend under the chart carries the names, and repeating them in a bubble
 * a hundred and thirty points wide would leave no room for the figures — which
 * are the thing being asked for.
 */
function Row({
  color,
  grams,
  unit = 'g',
}: {
  color: string;
  grams: number | null;
  unit?: string;
}) {
  const theme = useTheme();
  if (grams === null) return null;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.value, { color: theme.colors.text }]}>
        {unit === 'kcal' ? formatKcal(grams) : formatMacroWhole(grams)} {unit}
      </Text>
    </View>
  );
}

function Key({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  /** The second axis's series: narrower, to read as a dashed stroke. */
  dashed?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.key}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: color },
          dashed === true ? styles.swatchDashed : null,
        ]}
      />
      <Text style={[styles.keyLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const HEIGHT = 130;
const TICK_COUNT = 3;

function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function isDrawable(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function labelsFor(panel: NutritionPanel, count: number, slotWidth: number): string[] {
  const shown = new Set(labelledIndices(count, slotWidth));
  return panel.days.map((day, index) =>
    shown.has(index) ? formatDayCompact(day.date) : '',
  );
}

const styles = StyleSheet.create({
  touch: { position: 'absolute', top: FRAME_TOP, height: HEIGHT - FRAME_TOP },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 2, borderRadius: 1 },
  swatchDashed: { width: 6 },
  keyLabel: { fontSize: 12 },
  day: { fontSize: 11 },
  basis: { fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
