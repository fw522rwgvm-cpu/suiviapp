import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  macroSplits,
  meanOf,
  rollingMean,
  WEEKLY_WINDOW_DAYS,
} from '../../src/features/stats/domain/series';
import {
  datesOf,
  rangeEndingOn,
  STAT_RANGE_DAYS,
} from '../../src/features/stats/domain/stat-range';

/**
 * Aggregation of daily values (specs 8.7 no 3, D9).
 *
 * The one thing worth testing here is that a GAP IS NOT A ZERO. Both readings
 * produce a perfectly plausible average; only one of them measures eating
 * rather than diligence.
 */

describe('meanOf', () => {
  it('ignores gaps rather than reading them as zero', () => {
    // The decisive case: 2000 and 2000 with a blank day between them is a
    // 2000 average, not 1333.
    expect(meanOf([2000, null, 2000])).toBe(2000);
  });

  it('is null over nothing, so a screen can say so', () => {
    expect(meanOf([])).toBeNull();
    expect(meanOf([null, null])).toBeNull();
  });

  it('refuses a non-finite value the way a missing one is refused', () => {
    expect(meanOf([Number.NaN, 100])).toBe(100);
  });
});

describe('rollingMean', () => {
  it('gives one value per position, so it lines up with the date axis', () => {
    expect(rollingMean([1, 2, 3, 4], 2)).toHaveLength(4);
  });

  it('trails rather than centres, so no point is drawn from the future', () => {
    // Position 0 sees only itself; position 1 sees both.
    expect(rollingMean([10, 20], 2)).toEqual([10, 15]);
  });

  it('counts the window in DAYS, not in measurements', () => {
    // Four positions, two of them blank, window of three. The last position
    // sees positions 1..3, of which only 40 is a measurement — so 40, not the
    // mean of the last three RECORDED values, which would reach back a week.
    expect(rollingMean([10, null, null, 40], 3)).toEqual([10, 10, 10, 40]);
  });

  it('is null where its whole window is empty, which draws as a break', () => {
    expect(rollingMean([null, null, 30], 2)).toEqual([null, null, 30]);
  });

  it('smooths a week, which is what specs 8.7 asks for', () => {
    expect(WEEKLY_WINDOW_DAYS).toBe(7);
    const flat = Array.from({ length: 10 }, () => 2000);
    expect(rollingMean(flat, WEEKLY_WINDOW_DAYS).at(-1)).toBe(2000);
  });
});

describe('macroSplits', () => {
  it('sums to one, which is what makes it a split', () => {
    const splits = macroSplits({ protein: 150, carbs: 250, fat: 70, kcal: 2200 });
    const total = splits.protein.share + splits.carbs.share + splits.fat.share;
    expect(total).toBeCloseTo(1, 10);
  });

  it('divides by the theoretical calories, not the recorded ones', () => {
    // 150 x 4 + 250 x 4 + 70 x 9 = 2230, while the recorded figure says 2200.
    // Specs 5.1 lets a source's own calories differ by up to ten per cent, so
    // dividing by them would make the three shares miss a hundred per cent
    // with nothing honest to label the remainder.
    const splits = macroSplits({ protein: 150, carbs: 250, fat: 70, kcal: 2200 });
    expect(splits.protein.share).toBeCloseTo((150 * 4) / 2230, 10);
  });

  it('keeps the grams as they are, alongside the share', () => {
    const splits = macroSplits({ protein: 150, carbs: 250, fat: 70, kcal: 2200 });
    expect(splits.protein.grams).toBe(150);
    expect(splits.fat.grams).toBe(70);
  });

  it('answers zero shares rather than NaN on an empty day', () => {
    const splits = macroSplits({ protein: 0, carbs: 0, fat: 0, kcal: 0 });
    expect(splits.protein.share).toBe(0);
    expect(splits.carbs.share).toBe(0);
    expect(splits.fat.share).toBe(0);
  });
});

describe('stat ranges', () => {
  it('offers exactly the three specs 8.7 names', () => {
    expect([...STAT_RANGE_DAYS]).toEqual([7, 30, 90]);
  });

  it('ends on today and includes it', () => {
    const range = rangeEndingOn(toLocalDate('2026-09-14'), 7);
    expect(range.to).toBe('2026-09-14');
    expect(range.from).toBe('2026-09-08');
    expect(datesOf(range)).toHaveLength(7);
  });

  it('never produces more points than D13 caps a chart at', () => {
    for (const days of STAT_RANGE_DAYS) {
      const range = rangeEndingOn(toLocalDate('2026-09-14'), days);
      expect(datesOf(range).length).toBeLessThanOrEqual(200);
    }
  });

  it('walks the civil calendar across a month and a leap day', () => {
    expect(rangeEndingOn(toLocalDate('2026-03-01'), 2).from).toBe('2026-02-28');
    expect(rangeEndingOn(toLocalDate('2028-03-01'), 2).from).toBe('2028-02-29');
  });
});
