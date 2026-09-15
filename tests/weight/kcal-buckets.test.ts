import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import { readKcalBuckets } from '../../src/features/stats/data/stats-reads';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Calories bucketed for the crossed chart of specs 9.4.
 *
 * Written as raw SQL with the Drizzle objects interpolated — the inner grouping
 * is a subquery the query builder cannot express with these types — so it is
 * EXECUTED here rather than read. A statement that never runs in a test is a
 * statement nobody has checked parses.
 */

const TODAY = toLocalDate('2026-03-01');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

/** One free entry whose macros for 100 are the day's whole intake. */
function log(date: string, kcal: number): void {
  addFreeEntry(database.db, {
    date: toLocalDate(date),
    mealPosition: 0,
    name: 'Repas',
    macros: { protein: 0, carbs: 0, fat: 0, kcal },
  });
}

describe('calories per bucket', () => {
  it('sums a day and hands it back whole at the daily grain', () => {
    log('2026-03-01', 600);
    log('2026-03-01', 900);

    const buckets = readKcalBuckets(database.db, addDays(TODAY, -30), TODAY, 'day');

    expect(buckets.get(TODAY)).toBeCloseTo(1500, 6);
  });

  it('averages the DAYS of a week, never the entries', () => {
    /**
     * THE DISTINCTION THIS QUERY IS SHAPED AROUND.
     *
     * Monday is one entry of 2 000; Tuesday is four entries of 500. Both days
     * are 2 000 kcal, so the week's mean is 2 000. Averaging the five ENTRIES
     * would give 800 — the mean of a mouthful, a figure nobody eats and which
     * no target can be read against.
     */
    const monday = '2026-03-02';
    log(monday, 2000);
    for (const _ of [0, 1, 2, 3]) log('2026-03-03', 500);

    const buckets = readKcalBuckets(
      database.db,
      toLocalDate('2026-01-01'),
      toLocalDate('2026-12-31'),
      'week',
    );

    expect(buckets.get(toLocalDate(monday))).toBeCloseTo(2000, 6);
  });

  it('averages rather than sums, which is D9', () => {
    // Three days at 2 000 in one week is 2 000 a day, never 6 000 — a week of
    // calories summed is a number nobody eats.
    log('2026-03-02', 2000);
    log('2026-03-03', 2000);
    log('2026-03-04', 2000);

    const buckets = readKcalBuckets(
      database.db,
      toLocalDate('2026-01-01'),
      toLocalDate('2026-12-31'),
      'week',
    );

    expect(buckets.get(toLocalDate('2026-03-02'))).toBeCloseTo(2000, 6);
  });

  it('lets a day with nothing logged contribute nothing, not a zero', () => {
    /**
     * Two days logged at 2 000 in a week of seven. The mean is 2 000, not
     * 2 000 × 2 ÷ 7 — an absence of measurement is not a zero, which is the
     * rule the whole of specs 8.7 rests on and the one specs 9.2 writes out for
     * weight.
     */
    log('2026-03-02', 2000);
    log('2026-03-05', 2000);

    const buckets = readKcalBuckets(
      database.db,
      toLocalDate('2026-01-01'),
      toLocalDate('2026-12-31'),
      'week',
    );

    expect(buckets.get(toLocalDate('2026-03-02'))).toBeCloseTo(2000, 6);
  });

  it('groups by month, across a year boundary', () => {
    log('2025-12-20', 1800);
    log('2025-12-28', 2200);
    log('2026-01-04', 1600);

    const buckets = readKcalBuckets(
      database.db,
      toLocalDate('2025-01-01'),
      toLocalDate('2026-12-31'),
      'month',
    );

    expect(buckets.get(toLocalDate('2025-12-01'))).toBeCloseTo(2000, 6);
    expect(buckets.get(toLocalDate('2026-01-01'))).toBeCloseTo(1600, 6);
  });

  it('respects the range, at both ends', () => {
    log('2026-02-28', 1000);
    log('2026-03-01', 2000);
    log('2026-03-02', 3000);

    const buckets = readKcalBuckets(
      database.db,
      toLocalDate('2026-03-01'),
      toLocalDate('2026-03-01'),
      'day',
    );

    expect(buckets.size).toBe(1);
    expect(buckets.get(toLocalDate('2026-03-01'))).toBeCloseTo(2000, 6);
  });

  it('answers an empty range with an empty map', () => {
    const buckets = readKcalBuckets(database.db, addDays(TODAY, -30), TODAY, 'day');
    expect(buckets.size).toBe(0);
  });
});
