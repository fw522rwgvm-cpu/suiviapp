import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Circle, Path } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { formatDayCompact, formatDayShort, formatMacroWhole } from '@/core/format';
import { useTheme, type ColorTokens } from '@/core/theme';
import {
  ChartFrame,
  FRAME_TOP,
  GUTTER_BOTTOM,
  GUTTER_LEFT,
  GUTTER_TOP,
} from '@/core/charts/chart-frame';
import { ChartTooltip } from '@/core/charts/chart-tooltip';
import { useScrub } from '@/core/charts/use-scrub';
import { bandGeometry, labelledIndices, verticalScale } from '@/core/charts/scale';
import type { LocalDate } from '@/core/date';
import type { DayFigure } from '../domain/adherence';
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
 * ## RAW DAYS, NOT A SMOOTHED CURVE
 *
 * The calories chart already carries the seven-day mean specs 8.7 asks for.
 * Here the day is the point — the tooltip reads one, and a smoothed line would
 * answer a question the card next to it already answers. A day with no entry
 * breaks all three lines rather than dropping them to zero, the rule this whole
 * panel holds to.
 */
export function MacrosChart({ panel }: { panel: NutritionPanel }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card padding (16 each side) inside a screen padded by 16 each side.
  const width = Math.max(160, screenWidth - 64);
  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  const plotHeight = HEIGHT - GUTTER_BOTTOM;

  const count = panel.days.length;
  const band = bandGeometry(count, plotWidth);
  const { touched, gesture } = useScrub(band);

  const series: { key: keyof typeof panel.macroSeries; color: keyof ColorTokens }[] = [
    { key: 'protein', color: 'macroProtein' },
    { key: 'carbs', color: 'macroCarbs' },
    { key: 'fat', color: 'macroFat' },
  ];

  const scale = verticalScale(
    [...panel.macroSeries.protein, ...panel.macroSeries.carbs, ...panel.macroSeries.fat],
    plotHeight,
    TICK_COUNT,
    GUTTER_TOP,
  );

  const shown = touched === null ? null : panel.days[touched];

  /** The highest of the three at the touched day: what the bubble sits above. */
  const anchorY =
    shown?.consumed === null || shown?.consumed === undefined
      ? plotHeight
      : scale.y(Math.max(shown.consumed.protein, shown.consumed.carbs, shown.consumed.fat));

  return (
    <View>
      <View style={{ height: FRAME_TOP + HEIGHT }}>
        <ChartFrame
          height={HEIGHT}
          width={width}
          scale={scale}
          xLabels={labelsFor(panel, count, plotWidth / Math.max(1, count))}
        >
          {() => (
            <>
              {series.map(({ key, color }) => {
                const values = panel.macroSeries[key];
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
                : series.map(({ key, color }) => (
                    <Circle
                      key={`dot-${key}`}
                      cx={band.centre(touched)}
                      cy={scale.y(panel.macroSeries[key][touched] ?? 0)}
                      r={3}
                      fill={theme.colors[color]}
                    />
                  ))}
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
            <MacroReadout day={shown} today={panel.days[count - 1]?.date ?? shown.date} />
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
      </View>
    </View>
  );
}

function MacroReadout({ day, today }: { day: DayFigure; today: LocalDate }) {
  const theme = useTheme();

  return (
    <>
      <Text style={[styles.day, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {formatDayShort(day.date, today)}
      </Text>
      {day.consumed === null ? (
        <Text style={[styles.value, { color: theme.colors.text }]}>rien enregistré</Text>
      ) : (
        <>
          <Row color={theme.colors.macroProtein} grams={day.consumed.protein} />
          <Row color={theme.colors.macroCarbs} grams={day.consumed.carbs} />
          <Row color={theme.colors.macroFat} grams={day.consumed.fat} />
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
function Row({ color, grams }: { color: string; grams: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.value, { color: theme.colors.text }]}>
        {formatMacroWhole(grams)} g
      </Text>
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
  keyLabel: { fontSize: 12 },
  day: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
