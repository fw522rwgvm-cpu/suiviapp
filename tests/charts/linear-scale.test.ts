import { describe, expect, it } from 'vitest';
import { linearScale, verticalScale } from '../../src/core/charts/scale';

/**
 * The scale a weight curve needs (D13, specs 9.2).
 *
 * Only the arithmetic is tested, as everywhere in core/charts: a line in the
 * wrong place looks exactly like a line in the right place, so the drawing
 * itself is the device's business.
 */

describe('a scale over the values themselves', () => {
  it('does NOT reach down to zero', () => {
    /**
     * THE WHOLE REASON THIS EXISTS BESIDE verticalScale.
     *
     * A line encodes change by SLOPE, not by length from a baseline. On a
     * domain of 0 to 80, a three-kilo loss over a quarter — the entire subject —
     * occupies four per cent of the plot and reads as a flat line.
     */
    const scale = linearScale([78, 77.5, 77, 76.5], 100);

    expect(scale.ticks.every((tick) => tick > 50)).toBe(true);
    // And the contrast with its sibling, so the difference is a tested fact
    // rather than two functions that happen to differ today.
    expect(verticalScale([78, 77.5, 77, 76.5], 100).ticks.some((tick) => tick < 50)).toBe(
      true,
    );
  });

  it('gives a small spread most of the plot', () => {
    /**
     * A kilo of spread across a hundred points. The line has to move visibly,
     * which is what makes the curve worth drawing at all.
     *
     * Exactly half, and the half is `.nice()` rather than a shortfall: padded
     * to [76.9, 78.1] and rounded out to [76.5, 78.5], so one kilo of data sits
     * in two kilos of domain. Pinned at the measured value rather than at a
     * comfortable threshold, so that a change in the padding or the tick count
     * shows up here instead of passing quietly.
     */
    const scale = linearScale([78, 77.5, 77], 100);

    expect(scale.y(78)).toBe(25);
    expect(scale.y(77)).toBe(75);
    // And the same figure stated as the property that matters.
    expect(scale.y(77) - scale.y(78)).toBeGreaterThanOrEqual(50);
  });

  it('leaves air above and below, as a share of the spread', () => {
    // Not a fixed number of units: kilograms here, kilocalories in a crossed
    // chart, and a padding of 2 would be generous on one and invisible on the
    // other.
    const narrow = linearScale([78, 77], 100);
    const wide = linearScale([98, 78], 100);

    // Neither extreme sits exactly on an edge of the plot.
    expect(narrow.y(78)).toBeGreaterThan(0);
    expect(narrow.y(77)).toBeLessThan(100);
    expect(wide.y(98)).toBeGreaterThan(0);
    expect(wide.y(78)).toBeLessThan(100);
  });

  it('survives a series where every value is the same', () => {
    /**
     * One measurement, or a week of identical ones. The domain would be a
     * point, d3 would map every value to NaN, and react-native-svg draws NaN as
     * nothing at all rather than as an error — an empty chart with no
     * explanation.
     */
    const scale = linearScale([78, 78, 78], 100);

    expect(Number.isFinite(scale.y(78))).toBe(true);
    expect(scale.ticks.length).toBeGreaterThan(0);
    expect(scale.ticks.every((tick) => Number.isFinite(tick))).toBe(true);
  });

  it('survives a single measurement', () => {
    const scale = linearScale([78], 100);

    expect(Number.isFinite(scale.y(78))).toBe(true);
  });

  it('survives having nothing at all', () => {
    // Every position a hole — a range nobody weighed in. It must still produce
    // finite coordinates for whatever is drawn over it.
    const scale = linearScale([null, null], 100);

    expect(Number.isFinite(scale.y(0))).toBe(true);
    expect(scale.ticks.every((tick) => Number.isFinite(tick))).toBe(true);
  });

  it('ignores the holes rather than reading them as zero', () => {
    // A null among real weights must not drag the domain down to zero, which
    // would flatten the curve exactly as a zero baseline does.
    const scale = linearScale([78, null, 77.5, null, 77], 100);

    expect(scale.ticks.every((tick) => tick > 50)).toBe(true);
  });

  it('keeps every tick, where verticalScale drops the one at zero', () => {
    // verticalScale drops it because its axis draws that line itself. Here zero
    // is not on the axis at all, so a tick dropped for being zero would leave a
    // gap for no reason.
    const scale = linearScale([-1, 0, 1], 100);

    expect(scale.ticks).toContain(0);
  });

  it('respects the top inset, for the label of the highest gridline', () => {
    // The same reservation verticalScale needed: .nice() puts the top tick
    // exactly at the top of the range, and a label centred there has its
    // ascenders clipped by the viewport.
    const scale = linearScale([78, 77], 100, 4, 10);

    const highest = Math.max(...scale.ticks);
    expect(scale.y(highest)).toBeGreaterThanOrEqual(10);
  });
});
