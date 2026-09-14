import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import {
  DEFAULT_WEIGHT_RANGE,
  grainFor,
  MONTHLY_BEYOND_DAYS,
  WEEKLY_BEYOND_DAYS,
  WEIGHT_RANGE_KEYS,
  weightRangeFor,
  weightRangeLabel,
} from '../../src/features/weight/domain/weight-range';

/**
 * The ranges of specs 9.2 and the aggregation rule of D9.
 *
 * > Graphique d'évolution ... sur 30 jours / 90 jours / 1 an / tout.
 * > Regroupement par semaine au-delà de 90 jours, par mois au-delà d'un an.
 *
 * This is the first slice where the second sentence has a customer: slice 7's
 * longest range was exactly 90, and "beyond 90" does not include 90.
 */

const TODAY = toLocalDate('2026-03-01');

describe('the four ranges specs 9.2 offers', () => {
  it('offers exactly those four, and no others', () => {
    expect(WEIGHT_RANGE_KEYS).toEqual(['30', '90', '365', 'all']);
    expect(WEIGHT_RANGE_KEYS.map(weightRangeLabel)).toEqual([
      '30 jours',
      '90 jours',
      '1 an',
      'Tout',
    ]);
  });

  it('defaults to a range that shows the raw curve', () => {
    const range = weightRangeFor(DEFAULT_WEIGHT_RANGE, TODAY, toLocalDate('2020-01-01'));
    expect(range.showRaw).toBe(true);
  });

  it('counts both ends, the way the nutrition panel does', () => {
    const range = weightRangeFor('30', TODAY, null);

    expect(range.days).toBe(30);
    expect(range.to).toBe(TODAY);
    expect(range.from).toBe(addDays(TODAY, -29));
  });
});

describe('the grain D9 prescribes', () => {
  it('reads "beyond" strictly at BOTH boundaries', () => {
    /**
     * Ninety and 365 are both ranges specs 9.2 offers BY NAME, and each sits
     * exactly on a boundary. Reading either as inclusive would move a range the
     * user picked from the list onto the wrong grain.
     */
    expect(grainFor(WEEKLY_BEYOND_DAYS)).toBe('day');
    expect(grainFor(WEEKLY_BEYOND_DAYS + 1)).toBe('week');
    expect(grainFor(MONTHLY_BEYOND_DAYS)).toBe('week');
    expect(grainFor(MONTHLY_BEYOND_DAYS + 1)).toBe('month');
  });

  it('keeps 30 and 90 daily, and puts a year on weeks', () => {
    const history = toLocalDate('2015-01-01');

    expect(weightRangeFor('30', TODAY, history).grain).toBe('day');
    expect(weightRangeFor('90', TODAY, history).grain).toBe('day');
    expect(weightRangeFor('365', TODAY, history).grain).toBe('week');
  });

  it('drops the raw curve exactly when it starts aggregating', () => {
    /**
     * Specs 9.2 precision 3 and D9 share ONE threshold, and that is what makes
     * the sentence true: "agrégées par semaine ou par mois, série brute et
     * série lissée se confondent visuellement". Once a point is a weekly mean,
     * the two series ARE the same line drawn twice.
     */
    const history = toLocalDate('2015-01-01');

    for (const key of WEIGHT_RANGE_KEYS) {
      const range = weightRangeFor(key, TODAY, history);
      expect(range.showRaw, `${key}: raw must follow the grain`).toBe(range.grain === 'day');
    }
  });
});

describe('"tout" has no fixed grain', () => {
  it('is daily on a young history and monthly on an old one', () => {
    // The grain follows the span, not the label. Which also means "tout" and
    // "90 jours" look alike on a three-month history — and that is honest, there
    // being nothing older to show.
    expect(weightRangeFor('all', TODAY, addDays(TODAY, -60)).grain).toBe('day');
    expect(weightRangeFor('all', TODAY, addDays(TODAY, -200)).grain).toBe('week');
    expect(weightRangeFor('all', TODAY, addDays(TODAY, -1000)).grain).toBe('month');
  });

  it('starts at the first measurement', () => {
    const first = toLocalDate('2024-06-15');
    const range = weightRangeFor('all', TODAY, first);

    expect(range.from).toBe(first);
    expect(range.to).toBe(TODAY);
  });

  it('collapses to today when nothing was ever weighed', () => {
    // Rather than reaching back to an arbitrary date and drawing a long flat
    // nothing.
    const range = weightRangeFor('all', TODAY, null);

    expect(range.from).toBe(TODAY);
    expect(range.days).toBe(1);
    expect(range.grain).toBe('day');
  });

  it('is not dragged forward by a measurement dated in the future', () => {
    /**
     * Specs 9.1 allows weighing on any date, "passée comme future, sans
     * limite". So the earliest measurement can legitimately be AFTER today —
     * on a database where the only entry is a future one — and taking it as the
     * start would produce a backwards range that hides every day before it.
     */
    const range = weightRangeFor('all', TODAY, addDays(TODAY, 30));

    expect(range.from).toBe(TODAY);
    expect(range.days).toBe(1);
  });
});
