import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Text as SvgText } from 'react-native-svg';
import { fontFamilyFor, useTheme } from '@/core/theme';
import type { VerticalScale } from './scale';

/**
 * The frame every chart is drawn inside: gridlines, a baseline, and labels.
 *
 * > Coût assumé : axes, graduations et légendes écrits à la main. (D13)
 *
 * This is that cost, paid once. The series themselves are the caller's — it
 * receives the plot's size and renders into a group already translated to the
 * plot's origin, so nothing downstream has to know about the margins.
 *
 * ## NO AXIS LINE ON THE LEFT, AND NO BOX
 *
 * Gridlines carrying their own value at the left edge say everything an axis
 * line would, with one less rule on the page. What is drawn: a faint line per
 * tick, its value at the start of it, and a slightly stronger baseline at zero
 * — because zero is where the bars stand, not just another tick.
 *
 * ## THE LABELS ARE SVG TEXT, SO THEY MISS core/ui/text
 *
 * An SvgText is not a Text: the wrapper that puts Nunito on everything cannot
 * reach inside an Svg. The family is therefore asked for here, the same way
 * the native header title has to ask for it — otherwise the axis would be the
 * one piece of the page still in the system face.
 */
export function ChartFrame({
  height,
  width,
  scale,
  /** One label per slot; empty strings are skipped, which is how thinning works. */
  xLabels,
  children,
}: {
  height: number;
  width: number;
  scale: VerticalScale;
  xLabels: readonly string[];
  children: (plot: { width: number; height: number }) => ReactNode;
}) {
  const theme = useTheme();

  const plotWidth = Math.max(1, width - GUTTER_LEFT);
  const plotHeight = Math.max(1, height - GUTTER_BOTTOM);
  const family = fontFamilyFor('normal', theme.fontsLoaded);
  const slot = plotWidth / Math.max(1, xLabels.length);

  return (
    <View style={styles.frame}>
      <Svg width={width} height={height}>
        <G x={GUTTER_LEFT} y={0}>
          {scale.ticks.map((tick) => (
            <G key={tick}>
              <Line
                x1={0}
                x2={plotWidth}
                y1={scale.y(tick)}
                y2={scale.y(tick)}
                stroke={theme.colors.border}
                strokeWidth={1}
              />
              <SvgText
                x={-6}
                y={scale.y(tick) + 4}
                fill={theme.colors.textFaint}
                fontSize={10}
                fontFamily={family}
                textAnchor="end"
              >
                {String(Math.round(tick))}
              </SvgText>
            </G>
          ))}

          {/* Zero. Where the bars stand, so it is drawn a shade stronger. */}
          <Line
            x1={0}
            x2={plotWidth}
            y1={plotHeight}
            y2={plotHeight}
            stroke={theme.colors.border}
            strokeWidth={1.5}
          />

          {xLabels.map((label, index) =>
            label === '' ? null : (
              <SvgText
                key={`${label}-${index}`}
                x={index * slot + slot / 2}
                y={height - 2}
                fill={theme.colors.textFaint}
                fontSize={10}
                fontFamily={family}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            ),
          )}

          {children({ width: plotWidth, height: plotHeight })}
        </G>
      </Svg>
    </View>
  );
}

/** Room for a four-digit calorie label at the left of every gridline. */
export const GUTTER_LEFT = 34;
/** Room for one line of dates under the baseline. */
export const GUTTER_BOTTOM = 16;
/**
 * Air between the card's text and the plot — and the offset anything drawn
 * OVER the chart has to add.
 *
 * Exported rather than left as a number in a stylesheet because a caller
 * positioning a tooltip in plot coordinates needs the same value, and two 16s
 * meaning two different things is how they come to disagree.
 */
export const FRAME_TOP = 16;

const styles = StyleSheet.create({
  frame: { marginTop: FRAME_TOP },
});
