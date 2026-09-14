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
): VerticalScale {
  const finite = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const peak = finite.length === 0 ? 0 : Math.max(...finite, 0);

  const scale = scaleLinear()
    .domain([0, peak <= 0 ? 1 : peak])
    .range([height, 0])
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
