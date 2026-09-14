import { describe, expect, it } from 'vitest';
import {
  bandGeometry,
  labelledIndices,
  MIN_LABEL_SPACING,
  verticalScale,
} from '../../src/core/charts/scale';

/**
 * The arithmetic that decides where a bar goes (D13).
 *
 * Worth testing for the reason D15 gives: a bar in the wrong place looks
 * exactly like a bar in the right place. Nothing about a chart can be checked
 * by reading it — which is also why the drawing itself is not tested, and is
 * said so rather than implied.
 */

describe('verticalScale', () => {
  it('puts zero at the bottom and the maximum at the top', () => {
    const scale = verticalScale([0, 100], 200);
    expect(scale.y(0)).toBe(200);
    expect(scale.y(scale.max)).toBe(0);
  });

  it('always starts at zero, so bar lengths stay proportional', () => {
    // The decisive property. An axis starting at 1 800 would make 2 000 look
    // four times 1 900 — a lie, and a flattering one.
    const scale = verticalScale([1900, 2000], 100);
    expect(scale.y(0)).toBe(100);
  });

  it('rounds the top out to somewhere a gridline can sit', () => {
    const scale = verticalScale([1837], 100);
    expect(scale.max).toBeGreaterThanOrEqual(1837);
    // Every tick is a round number, which is the whole reason d3-scale is here.
    for (const tick of scale.ticks) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('never draws a gridline on the baseline, which the axis already is', () => {
    expect(verticalScale([0, 100], 200).ticks).not.toContain(0);
  });

  it('survives an empty series rather than putting every bar at NaN', () => {
    const scale = verticalScale([], 100);
    expect(Number.isFinite(scale.y(0))).toBe(true);
    expect(Number.isFinite(scale.max)).toBe(true);
  });

  it('survives a series that is entirely gaps or zeroes', () => {
    for (const values of [[null, null], [0, 0]]) {
      const scale = verticalScale(values, 100);
      expect(Number.isFinite(scale.y(0))).toBe(true);
      expect(scale.max).toBeGreaterThan(0);
    }
  });

  it('keeps the top gridline off the very first pixel, when asked', () => {
    // THE DEFECT THIS EXISTS FOR. `.nice()` rounds the domain out so the top
    // tick lands EXACTLY on the maximum, which maps to y = 0 — and a label
    // centred on that line has its ascenders at a negative y, clipped away by
    // the SVG viewport. Only the top figure loses its head, which reads as a
    // rendering fault rather than as a missing inset.
    const flush = verticalScale([2000], 100);
    expect(flush.y(flush.max)).toBe(0);

    const inset = verticalScale([2000], 100, 4, 10);
    expect(inset.y(inset.max)).toBe(10);
    // The baseline does not move: bars still stand on the bottom of the plot.
    expect(inset.y(0)).toBe(100);
  });

  it('scales into the reduced range, not just offset by it', () => {
    const inset = verticalScale([100], 100, 4, 10);
    // Half the domain sits half way down the REMAINING height, not half way
    // down the canvas: an inset that only shifted would put every bar 10 points
    // short of where its value says.
    expect(inset.y(inset.max / 2)).toBeCloseTo(55, 6);
  });

  it('ignores gaps when choosing the top', () => {
    expect(verticalScale([null, 100, null], 100).max).toBe(
      verticalScale([100], 100).max,
    );
  });
});

describe('bandGeometry', () => {
  it('fills the width, whatever the count', () => {
    for (const count of [7, 30, 90]) {
      const band = bandGeometry(count, 350);
      expect(band.centre(0)).toBeGreaterThan(0);
      expect(band.centre(count - 1)).toBeLessThan(350);
      expect(band.left(count - 1) + band.barWidth).toBeLessThanOrEqual(350);
    }
  });

  it('thins the bars rather than overflowing at ninety days', () => {
    // Under four points per day. A fixed gap would have gone negative
    // somewhere between seven days and ninety.
    const wide = bandGeometry(7, 350);
    const narrow = bandGeometry(90, 350);
    expect(narrow.barWidth).toBeLessThan(wide.barWidth);
    expect(narrow.barWidth).toBeGreaterThanOrEqual(1);
  });

  it('never rounds a bar away to nothing', () => {
    // A bar of zero width draws nothing, so a day that WAS logged would simply
    // be missing from the chart.
    expect(bandGeometry(400, 100).barWidth).toBeGreaterThanOrEqual(1);
  });

  it('maps a touch back to the slot under it', () => {
    const band = bandGeometry(10, 300);
    expect(band.indexAt(0)).toBe(0);
    expect(band.indexAt(35)).toBe(1);
    expect(band.indexAt(299)).toBe(9);
  });

  it('clamps a touch outside the plot to the nearest end', () => {
    const band = bandGeometry(10, 300);
    expect(band.indexAt(-20)).toBe(0);
    expect(band.indexAt(9999)).toBe(9);
  });

  it('does not divide by zero on an empty series', () => {
    const band = bandGeometry(0, 300);
    expect(Number.isFinite(band.centre(0))).toBe(true);
    expect(band.indexAt(150)).toBe(0);
  });
});

describe('labelledIndices', () => {
  /** What the three ranges of specs 8.7 actually look like on a phone. */
  const PLOT = 292;

  it('always labels the last position, whatever the step divides into', () => {
    // The decisive property. On a date axis ending today, that is the one date
    // the reader is surest of and the anchor for every other — and counting
    // forward from zero leaves it unlabelled on most ranges.
    for (const count of [7, 30, 90, 11, 13]) {
      expect(labelledIndices(count, PLOT / count).at(-1)).toBe(count - 1);
    }
  });

  it('never puts two labels closer than the minimum', () => {
    for (const count of [7, 30, 90]) {
      const slot = PLOT / count;
      const indices = labelledIndices(count, slot);

      for (let at = 1; at < indices.length; at += 1) {
        const gap = ((indices[at] ?? 0) - (indices[at - 1] ?? 0)) * slot;
        expect(gap).toBeGreaterThanOrEqual(MIN_LABEL_SPACING);
      }
    }
  });

  it('gives more than the two ends on every range specs 8.7 offers', () => {
    // The complaint this answers: two dates and ninety bars is not a scale.
    for (const count of [7, 30, 90]) {
      expect(labelledIndices(count, PLOT / count).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('labels every position when they are wide enough to deserve it', () => {
    expect(labelledIndices(4, 100)).toEqual([0, 1, 2, 3]);
  });

  it('falls back to one label rather than none when nothing fits', () => {
    const indices = labelledIndices(90, 0.2);
    expect(indices).toEqual([89]);
  });

  it('answers nothing for an empty series, rather than [-1]', () => {
    expect(labelledIndices(0, 50)).toEqual([]);
  });
});
