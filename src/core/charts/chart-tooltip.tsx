import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { FRAME_TOP, GUTTER_BOTTOM } from './chart-frame';

/**
 * The readout of a touched point, ABOVE what it describes.
 *
 * It was a line under the chart, and that is the worst place there is: a finger
 * reaching a point comes from below, so the hand covers the answer to the
 * question it is asking. Above, the figure sits in the one region of a chart a
 * reading hand is never over.
 *
 * Here rather than in a chart at its second real user — the calories chart and
 * the macro chart place it identically and only differ in what they put inside,
 * which is exactly what `children` is for.
 *
 * ## ANCHORED BY ITS BOTTOM, SO ITS OWN HEIGHT NEVER ENTERS THE SUM
 *
 * It was anchored by its top against a height written down as a constant, and
 * the constant was a guess — the bubble is three lines on one chart and four on
 * another. Whatever number was chosen was wrong for one of them, which is how
 * it came to sit across the top of a bar instead of above it.
 *
 * With `bottom` there is nothing to guess: the lower edge is placed a fixed gap
 * above the point and the bubble grows upwards from there, at any number of
 * lines. Its positioning parent must therefore be the chart box — a view whose
 * lower edge is a known point of the drawing.
 *
 * ## THREE CLAMPS, AND EACH ONE IS A REAL CASE
 *
 * The first and last positions would push it off the sides — at ninety days
 * those are a point wide and the bubble is a hundred and thirty. A point near
 * the top of the scale would push it off the top, which is the commonest case
 * of all: the highest day of the range. So it is held inside the plot
 * horizontally, and pinned to the top of the plot when there is no room above.
 */
export function ChartTooltip({
  x,
  anchorY,
  plotHeight,
  plotLeft,
  plotRight,
  children,
}: {
  /** Centre of the point, in chart coordinates. */
  x: number;
  /** What the bubble sits above, in plot coordinates: 0 is the canvas top. */
  anchorY: number;
  plotHeight: number;
  plotLeft: number;
  plotRight: number;
  children: ReactNode;
}) {
  const theme = useTheme();

  const half = TOOLTIP_WIDTH / 2;
  const left = Math.min(Math.max(x - half, plotLeft), plotRight - TOOLTIP_WIDTH);
  const bottom = plotHeight + GUTTER_BOTTOM - anchorY + GAP;

  /**
   * The flip, and it is the ONLY thing the height is still needed for.
   *
   * Measured rather than assumed — one frame on an estimate, then exact and
   * stable. A stale height can now only make the bubble flip a frame late; it
   * can no longer place it wrongly.
   */
  const [height, setHeight] = useState(ESTIMATED_HEIGHT);
  const fitsAbove = anchorY - GAP - height >= 0;

  return (
    <View
      pointerEvents="none"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[
        styles.tooltip,
        fitsAbove ? { bottom } : { top: FRAME_TOP },
        {
          left,
          width: TOOLTIP_WIDTH,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
        theme.shadow,
      ]}
    >
      {children}
    </View>
  );
}

const TOOLTIP_WIDTH = 132;
/** Air between the bubble's lower edge and the point it names. */
const GAP = 6;
/**
 * First-frame guess, and nothing more: onLayout replaces it immediately and it
 * only ever decides whether to flip, never where to sit.
 */
const ESTIMATED_HEIGHT = 62;

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
  },
});
