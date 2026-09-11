import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import { seedJournal } from '../../src/dev/seed';
import { createRandom } from '../../src/dev/seed/random';
import { readDay, readDayTotals } from '../../src/features/nutrition/data/day-reads';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The demo data generator (D15).
 *
 * It exists to be trusted by three other things — migration replay on a
 * populated database, performance checks on long histories, and bug
 * reproduction — so what is worth testing is that it produces the same
 * database twice, and one shaped like a real one.
 */

const END = toLocalDate('2026-09-11');

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

describe('createRandom', () => {
  it('replays the same sequence from the same seed', () => {
    const first = createRandom(42);
    const second = createRandom(42);
    const draws = Array.from({ length: 20 }, () => first.next());
    expect(draws).toEqual(Array.from({ length: 20 }, () => second.next()));
  });

  it('draws a different sequence from a different seed', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('stays inside its bounds', () => {
    const random = createRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = random.between(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });
});

describe('seedJournal', () => {
  it('produces the same history twice over', () => {
    // Without this, "reproduce a bug without exposing real data" is a promise
    // the generator cannot keep.
    const other = openTestDatabase();
    try {
      seedJournal(fixture.db, { endDate: END, days: 40, seed: 99 });
      seedJournal(other.db, { endDate: END, days: 40, seed: 99 });

      const dump = (target: TestDatabase): unknown[] =>
        target.raw
          .prepare(
            'SELECT date, kind, name, quantity, protein_100, carbs_100, fat_100, kcal_100 FROM journal_entry ORDER BY date, position, name',
          )
          .all();

      expect(dump(fixture)).toEqual(dump(other));
      expect(countRows(fixture.raw, 'journal_entry')).toBeGreaterThan(0);
    } finally {
      other.close();
    }
  });

  it('leaves some days unwritten, as a real history does', () => {
    // Specs 8.7 excludes days that were never filled in from the adherence
    // rate. A generator that filled every single day would hide that case from
    // the statistics of slice 7.
    const report = seedJournal(fixture.db, { endDate: END, days: 120, seed: 3 });
    expect(report.days).toBeLessThan(120);
    expect(report.days).toBeGreaterThan(60);
    expect(countRows(fixture.raw, 'day')).toBe(report.days);
  });

  it('materialises only the days it wrote to', () => {
    seedJournal(fixture.db, { endDate: END, days: 30, seed: 5 });

    // Every materialised day must hold at least one entry: the generator goes
    // through the ordinary writes, so a bare day would mean materialisation
    // leaked outside an action.
    const empty = fixture.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM day
          WHERE NOT EXISTS (SELECT 1 FROM journal_entry WHERE journal_entry.date = day.date)`,
      )
      .get() as { n: number };
    expect(empty.n).toBe(0);
  });

  it('writes days that read back exactly as the application stores them', () => {
    seedJournal(fixture.db, { endDate: END, days: 10, seed: 11 });

    const dates = (
      fixture.raw.prepare('SELECT date FROM day ORDER BY date').all() as { date: string }[]
    ).map((row) => toLocalDate(row.date));

    for (const date of dates) {
      const day = readDay(fixture.db, date);
      expect(day.materialized).toBe(true);
      expect(day.meals.length).toBeGreaterThan(0);

      const totals = readDayTotals(fixture.db, date);
      expect(totals.kcal).toBeGreaterThan(0);
    }
  });

  it('stays within the range it was given', () => {
    const report = seedJournal(fixture.db, { endDate: END, days: 30, seed: 13 });
    expect(report.firstDate).toBe(addDays(END, -29));

    const bounds = fixture.raw
      .prepare('SELECT MIN(date) AS first, MAX(date) AS last FROM journal_entry')
      .get() as { first: string; last: string };

    expect(bounds.first >= addDays(END, -29)).toBe(true);
    expect(bounds.last <= END).toBe(true);
  });

  it('carries a long history without choking', () => {
    // Three years, which is what D15 means by checking performance on long
    // histories. One transaction for the lot.
    const report = seedJournal(fixture.db, { endDate: END, days: 1095, seed: 17 });
    expect(report.entries).toBeGreaterThan(1000);
    expect(readDayTotals(fixture.db, END).kcal).toBeGreaterThanOrEqual(0);
  });
});
