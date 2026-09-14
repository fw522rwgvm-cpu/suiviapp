import { scaleLinear } from 'd3-scale';

/**
 * Scales and geometry for the hand-made charts (D13).
 *
 * > Composants maison sur react-native-svg, échelles et tracés calculés avec
 * > d3-scale et d3-shape.
 *
 * Pure: nothing here imports React or renders anything, so the arithmetic that
 * decides where a bar goes is testable in Node — which matters, because a bar
 * in the wrong place looks exactly like a bar in the right place.
 *
 * ## WHAT d3-scale IS ACTUALLY BOUGHT FOR
 *
 * Not the linear mapping, which is one multiplication. It is `nice()` and
 * `ticks()`: choosing round numbers for an axis is a small, fiddly, well-solved
 * problem, and the version anyone writes by hand produces gridlines at 1 837
 * and 3 674. That is the whole reason the dependency is in section 5.
 */

export interface VerticalScale {
  /** A value from the domain, as a y coordinate inside the plot. */
  y: (value: number) => number;
  /** Round values to draw gridlines at, inside the domain. */
  ticks: number[];
  /** The top of the domain after rounding out. */
  max: number;
}

/**
 * A vertical scale from zero to a rounded-up maximum.
 *
 * ## IT ALWAYS STARTS AT ZERO, AND THAT IS NOT LAZINESS
 *
 * A bar chart whose axis starts at 1 800 makes a 2 000 kcal day look four
 * times a 1 900 kcal one. The bars encode quantity by LENGTH, so the baseline
 * has to be the zero of the quantity or the picture lies — and it lies
 * flatteringly, which is the direction that matters.
 *
 * An empty or all-zero series gets a domain of [0, 1] rather than [0, 0]: a
 * degenerate scale divides by zero and puts every bar at NaN, which react-
 * native-svg renders as nothing at all rather than as an error.
 */
export function verticalScale(
  values: readonly (number | null)[],
  height: number,
  tickCount = 4,
  /**
   * Blank kept ABOVE the highest gridline.
   *
   * Not decoration. `.nice()` rounds the domain out so that the top tick sits
   * EXACTLY at the maximum — which maps to y = 0, the first pixel of the
   * canvas. A label centred on that line then has its ascenders at a negative
   * y and is clipped away by the SVG viewport: the top figure of the axis
   * loses its head, and only that one, which reads as a rendering fault rather
   * than as a missing inset.
   *
   * Zero by default, so a caller drawing without axis labels pays nothing.
   */
  topInset = 0,
): VerticalScale {
  const finite = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const peak = finite.length === 0 ? 0 : Math.max(...finite, 0);

  const scale = scaleLinear()
    .domain([0, peak <= 0 ? 1 : peak])
    .range([height, topInset])
    .nice(tickCount);

  const [, max = 1] = scale.domain();

  return {
    y: (value) => scale(value),
    // The zero line is drawn by the axis itself, so it is not a gridline too.
    ticks: scale.ticks(tickCount).filter((tick) => tick > 0),
    max,
  };
}

export interface BandGeometry {
  /** Left edge of the slot at `index`. */
  left: (index: number) => number;
  /** Centre of the slot at `index` — where a point or a line vertex sits. */
  centre: (index: number) => number;
  /** How wide a bar is drawn, once the gap between slots is taken out. */
  barWidth: number;
  /** Which slot a horizontal position falls in, clamped to the series. */
  indexAt: (x: number) => number;
}

/**
 * Equal slots across the plot, one per day.
 *
 * ## THE BARS THIN INSTEAD OF THE CHART SCROLLING
 *
 * Ninety days across three hundred and fifty points is under four points a
 * day. So the gap is a SHARE of the slot rather than a fixed number of points:
 * at seven days the bars are broad with air between them, at ninety they are
 * hairlines, and neither needs a special case. A fixed gap would have gone
 * negative somewhere between the two.
 *
 * A floor of one point, because a bar rounded to zero width draws nothing and
 * a day that was logged would simply be missing.
 */
export function bandGeometry(
  count: number,
  width: number,
  gapShare = 0.25,
): BandGeometry {
  const slots = Math.max(1, count);
  const slot = width / slots;
  const barWidth = Math.max(1, slot * (1 - gapShare));
  const inset = (slot - barWidth) / 2;

  return {
    left: (index) => index * slot + inset,
    centre: (index) => index * slot + slot / 2,
    barWidth,
    indexAt: (x) => Math.min(slots - 1, Math.max(0, Math.floor(x / slot))),
  };
}

/**
 * Points between two labels on a date axis.
 *
 * "15/09" is about thirty points at ten-point type, so sixty leaves as much
 * air between two labels as a label takes. Below that they read as one string
 * of digits rather than as a scale.
 */
export const MIN_LABEL_SPACING = 60;

/**
 * Which positions of a dense series carry a label.
 *
 * ## THE STEP COMES FROM THE PLOT, NOT FROM A CHOSEN NUMBER
 *
 * How many labels fit is a question about points, not about days: the same
 * four dates are comfortable on a large phone and touching on a small one. So
 * the step is derived — the fewest positions whose slots add up to the minimum
 * spacing — and the ranges fall out of it rather than being special-cased.
 *
 * ## COUNTED BACK FROM THE END, WHICH IS THE SIDE THE READER KNOWS
 *
 * The LAST position is always labelled, whatever the step divides into.
 * Counting forward from zero would leave the right-hand end unlabelled on most
 * ranges — on a date axis ending today, that is the one date the reader is
 * surest of and the anchor for every other.
 */
export function labelledIndices(
  count: number,
  slotWidth: number,
  minSpacing = MIN_LABEL_SPACING,
): number[] {
  if (count <= 0) return [];
  // A slot of zero or less has no geometry to reason from; one label is the
  // honest answer, and it is the end one for the reason above.
  if (slotWidth <= 0) return [count - 1];

  /**
   * The true slot width, NOT floored at one point.
   *
   * Flooring it read as harmless — it was there to keep the division safe —
   * and it quietly broke the only guarantee this function makes: below a point
   * per slot the step stopped growing, so two labels could still land closer
   * than the minimum. The zero case is handled above, where it belongs, so
   * nothing here has to defend against it.
   */
  const step = Math.max(1, Math.ceil(minSpacing / slotWidth));

  const indices: number[] = [];
  for (let index = count - 1; index >= 0; index -= step) {
    indices.push(index);
  }
  return indices.reverse();
}

/**
 * A bar as a path, so only its TOP corners are rounded.
 *
 * ## WHY NOT A Rect
 *
 * SVG's `rx` rounds all four corners, which is fine for a bar standing alone
 * and wrong for a bar made of two stacked segments: the upper one's rounded
 * BOTTOM corners let the lower one show through, and the joint reads as one
 * block pasted onto another rather than as one bar in two colours.
 *
 * The overlap that produces has a second cost, and it is the one that actually
 * bites: two shapes drawn over each other cannot be dimmed. Fading a bar to
 * make its neighbour stand out blends the two colours through each other and
 * invents a third.
 *
 * So the segments are drawn edge to edge, never overlapping, and the rounding
 * is asked for only where a cap belongs — the very top of the bar.
 */
export function barPath(
  x: number,
  width: number,
  top: number,
  bottom: number,
  radius: number,
): string {
  // Never more than half the width, or the two corners cross and the curve
  // turns inside out; never more than the height, for the same reason on a bar
  // barely taller than its own cap.
  const r = Math.max(0, Math.min(radius, width / 2, Math.abs(bottom - top)));
  const right = x + width;

  if (r === 0) {
    return `M${x},${bottom} L${x},${top} L${right},${top} L${right},${bottom} Z`;
  }

  return (
    `M${x},${bottom}` +
    ` L${x},${top + r}` +
    ` Q${x},${top} ${x + r},${top}` +
    ` L${right - r},${top}` +
    ` Q${right},${top} ${right},${top + r}` +
    ` L${right},${bottom} Z`
  );
}
