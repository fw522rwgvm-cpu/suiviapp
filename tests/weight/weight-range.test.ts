import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import {
  DEFAULT_WEIGHT_RANGE,
  grainFor,
  MONTHLY_BEYOND_DAYS,
  readRangeFor,
  smoothingLead,
  WEEKLY_BEYOND_DAYS,
  WEIGHT_RANGE_KEYS,
  weightRangeFor,
  weightRangeLabel,
} from '../../src/features/weight/domain/weight-range';
import { SMOOTHING_WINDOW_DAYS } from '../../src/features/weight/domain/smoothing';

/**
 * The ranges of the weight panel and the aggregation rule of D9.
 *
 * Specs 9.2 offered "30 jours / 90 jours / 1 an / tout"; this offers a week,
 * thirty, ninety and a year. Requested, and amended rather than diverged from
 * (specs 14.17).
 */

const TODAY = toLocalDate('2026-03-01');

describe('the four ranges the panel offers', () => {
  it('offers exactly those four, shortest first', () => {
    expect(WEIGHT_RANGE_KEYS).toEqual(['7', '30', '90', '365']);
    expect(WEIGHT_RANGE_KEYS.map(weightRangeLabel)).toEqual([
      '7 jours',
      '30 jours',
      '90 jours',
      '1 an',
    ]);
  });

  it('no longer offers "tout"', () => {
    // Pinned rather than left to the absence of a case: "tout" was the only
    // range whose start depended on the history, and the only caller of
    // readFirstWeightDate. Its removal is a decision, not an oversight.
    expect(WEIGHT_RANGE_KEYS).not.toContain('all');
  });

  it('defaults to a range that shows the raw curve', () => {
    expect(weightRangeFor(DEFAULT_WEIGHT_RANGE, TODAY).showRaw).toBe(true);
  });

  it('opens on a week, which only the smoothing lead makes honest', () => {
    /**
     * Requested (specs 14.24). The value is pinned here rather than left to the
     * screen because of what it depends on: a seven-day range READ as seven
     * days computes six of its seven smoothed points from short windows, which
     * is the 22 % bias measured elsewhere in slice 8. What makes this default
     * safe is that the read is wider than the drawing.
     */
    expect(DEFAULT_WEIGHT_RANGE).toBe('7');

    const drawn = weightRangeFor(DEFAULT_WEIGHT_RANGE, TODAY);
    const read = readRangeFor(drawn);

    expect(read.days).toBeGreaterThan(drawn.days);
    expect(read.days - drawn.days).toBe(SMOOTHING_WINDOW_DAYS - 1);
  });

  it('counts both ends, the way the nutrition panel does', () => {
    expect(weightRangeFor('7', TODAY)).toMatchObject({
      from: addDays(TODAY, -6),
      to: TODAY,
      days: 7,
    });
    expect(weightRangeFor('30', TODAY).days).toBe(30);
    expect(weightRangeFor('365', TODAY).days).toBe(365);
  });
});

describe('the grain D9 prescribes', () => {
  it('reads "beyond" strictly at BOTH boundaries', () => {
    /**
     * Ninety and 365 are both ranges the panel offers BY NAME, and each sits
     * exactly on a boundary. Reading either as inclusive would move a range the
     * user picked from the list onto the wrong grain.
     */
    expect(grainFor(WEEKLY_BEYOND_DAYS)).toBe('day');
    expect(grainFor(WEEKLY_BEYOND_DAYS + 1)).toBe('week');
    expect(grainFor(MONTHLY_BEYOND_DAYS)).toBe('week');
    expect(grainFor(MONTHLY_BEYOND_DAYS + 1)).toBe('month');
  });

  it('keeps 7, 30 and 90 daily, and puts a year on weeks', () => {
    expect(weightRangeFor('7', TODAY).grain).toBe('day');
    expect(weightRangeFor('30', TODAY).grain).toBe('day');
    expect(weightRangeFor('90', TODAY).grain).toBe('day');
    expect(weightRangeFor('365', TODAY).grain).toBe('week');
  });

  it('leaves the monthly grain with no range that reaches it', () => {
    /**
     * A FACT ABOUT THE CURRENT SET, WRITTEN DOWN RATHER THAN DISCOVERED.
     *
     * "Tout" was the only range that could exceed a year, so nothing the panel
     * offers now groups by month. grainFor keeps the branch because D9 is
     * normative — "par mois au-delà d'un an" — and because the day a longer
     * range returns it must already be right. But no screen reaches it today,
     * and a reader should not have to work that out.
     */
    const longest = Math.max(...WEIGHT_RANGE_KEYS.map((key) => Number(key)));

    expect(grainFor(longest)).not.toBe('month');
    expect(grainFor(MONTHLY_BEYOND_DAYS + 1)).toBe('month');
  });

  it('drops the raw curve exactly when it starts aggregating', () => {
    /**
     * Specs 9.2 precision 3 and D9 share ONE threshold, and that is what makes
     * the sentence true: "agrégées par semaine ou par mois, série brute et
     * série lissée se confondent visuellement".
     */
    for (const key of WEIGHT_RANGE_KEYS) {
      const range = weightRangeFor(key, TODAY);
      expect(range.showRaw, `${key}: raw must follow the grain`).toBe(range.grain === 'day');
    }
  });
});

describe('the smoothing run-up', () => {
  it('is six days, one short of the window', () => {
    // A smoothed point is a seven-day trailing mean, so the first point of a
    // range needs the six days before it to have a full window.
    expect(smoothingLead('day')).toBe(SMOOTHING_WINDOW_DAYS - 1);
  });

  it('is nothing above the daily grain', () => {
    // A weekly bucket is already a mean of its days; there is no trailing
    // window to fill (specs 9.2 precision 3).
    expect(smoothingLead('week')).toBe(0);
    expect(smoothingLead('month')).toBe(0);
  });

  it('widens the READ range backwards and leaves the displayed one alone', () => {
    const shown = weightRangeFor('7', TODAY);
    const read = readRangeFor(shown);

    expect(read.from).toBe(addDays(shown.from, -6));
    expect(read.to).toBe(shown.to);
    expect(read.days).toBe(shown.days + 6);
    // The displayed range is untouched — the extra days must never reach an axis.
    expect(shown.from).toBe(addDays(TODAY, -6));
    expect(shown.days).toBe(7);
  });

  it('matters MOST on the shortest range, which is why the week needed it', () => {
    /**
     * On ninety days the run-up rescues six points out of ninety and is easy to
     * miss. On seven it rescues six out of SEVEN — so without it, six sevenths
     * of the week's curve would be computed from short windows and pulled
     * towards the start of the range.
     */
    const week = weightRangeFor('7', TODAY);
    const quarter = weightRangeFor('90', TODAY);

    expect(smoothingLead(week.grain) / week.days).toBeCloseTo(6 / 7, 6);
    expect(smoothingLead(quarter.grain) / quarter.days).toBeCloseTo(6 / 90, 6);
  });

  it('leaves a weekly range unwidened', () => {
    const year = weightRangeFor('365', TODAY);
    expect(readRangeFor(year)).toEqual(year);
  });
});
