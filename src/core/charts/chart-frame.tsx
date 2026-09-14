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
  rightScale,
  rightTint,
  /** One label per slot; empty strings are skipped, which is how thinning works. */
  xLabels,
  children,
}: {
  height: number;
  width: number;
  scale: VerticalScale;
  /**
   * A SECOND axis, on the right, for a series of another nature.
   *
   * > Trois écrans clés superposent des séries de natures différentes sur des
   * > axes différents — exactement là où les bibliothèques génériques se
   * > battent contre vous. (D13)
   *
   * This is the first of them. Grams and kilocalories differ by an order of
   * magnitude, so one axis would flatten the three macro lines into the floor
   * to make room for a calorie line — which is not a compromise, it is losing
   * the subject to keep the context.
   *
   * IT DRAWS NO GRIDLINES OF ITS OWN. Two sets of horizontal rules at two sets
   * of heights is the noise that gives dual axes their bad name; the left scale
   * owns the lines, and this one only labels its own ticks beside them.
   */
  rightScale?: VerticalScale;
  /** Tints the right labels, so it is never a guess which axis serves which. */
  rightTint?: string;
  xLabels: readonly string[];
  children: (plot: { width: number; height: number }) => ReactNode;
}) {
  const theme = useTheme();

  const plotWidth = plotWidthFor(width, rightScale !== undefined);
  const plotHeight = Math.max(1, height - GUTTER_BOTTOM);
  const family = fontFamilyFor('normal', theme.fontsLoaded);
  const slot = plotWidth / Math.max(1, xLabels.length);

  // Which positions actually carry a label: the caller thins them, and the two
  // survivors at the ends are the ones that need a different anchor.
  const labelled = xLabels.flatMap((label, index) => (label === '' ? [] : [index]));
  const firstLabelled = labelled[0];
  const lastLabelled = labelled[labelled.length - 1];

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

          {rightScale === undefined
            ? null
            : rightScale.ticks.map((tick) => (
                <SvgText
                  key={`right-${tick}`}
                  x={plotWidth + 6}
                  y={rightScale.y(tick) + 4}
                  fill={rightTint ?? theme.colors.textFaint}
                  fontSize={10}
                  fontFamily={family}
                  textAnchor="start"
                >
                  {String(Math.round(tick))}
                </SvgText>
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

          {xLabels.map((label, index) => {
            if (label === '') return null;

            /**
             * THE TWO END LABELS HUG THE PLOT, THE REST ARE CENTRED.
             *
             * Centring every one of them is what clipped the last: half of it
             * sits beyond the final band's centre, which at ninety days is
             * within two points of the plot's right edge — and past that edge
             * is past the canvas, where the SVG viewport simply cuts it off.
             *
             * Anchoring the outermost to the plot's own edges costs nothing and
             * needs no measurement, which is the point: a clamp computed from a
             * guessed text width would be the same mistake the tooltip's height
             * already was.
             */
            const last = index === lastLabelled;
            const first = index === firstLabelled;

            return (
              <SvgText
                key={`${label}-${index}`}
                x={last ? plotWidth : first ? 0 : index * slot + slot / 2}
                y={height - 2}
                fill={theme.colors.textFaint}
                fontSize={10}
                fontFamily={family}
                textAnchor={last ? 'end' : first ? 'start' : 'middle'}
              >
                {label}
              </SvgText>
            );
          })}

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
 * Room ABOVE the highest gridline, for its own label.
 *
 * Ten points against a ten-point font: the label is centred on its line, so it
 * reaches some three points above it, and the rest is air the tallest bar is
 * better for. Passed to verticalScale by the caller, which is what actually
 * reserves it — this constant only says how much.
 */
export const GUTTER_TOP = 10;
/**
 * Air between the card's text and the plot — and the offset anything drawn
 * OVER the chart has to add.
 *
 * Exported rather than left as a number in a stylesheet because a caller
 * positioning a tooltip in plot coordinates needs the same value, and two 16s
 * meaning two different things is how they come to disagree.
 */
export const FRAME_TOP = 16;
/** Room for a four-digit label to the right of the plot, when a second axis asks. */
export const GUTTER_RIGHT = 30;

/**
 * The drawable width, given the whole width and whether a second axis is in
 * play.
 *
 * Exported because the CALLER needs the same number — to lay out its bands, to
 * clamp a tooltip — and a formula written in two places is a formula free to
 * disagree the day a gutter changes.
 */
export function plotWidthFor(width: number, rightAxis = false): number {
  return Math.max(1, width - GUTTER_LEFT - (rightAxis ? GUTTER_RIGHT : 0));
}

const styles = StyleSheet.create({
  frame: { marginTop: FRAME_TOP },
});
