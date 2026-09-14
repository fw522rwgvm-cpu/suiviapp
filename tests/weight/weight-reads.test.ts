import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, startOfWeek, toLocalDate, type LocalDate } from '../../src/core/date';
import { bucketOf } from '../../src/core/db/date-bucket';
import {
  bucketsOf,
  readActiveGoal,
  readFirstWeightDate,
  readWeight,
  readWeightHistory,
  readWeights,
} from '../../src/features/weight/data/weight-reads';
import {
  deactivateGoal,
  deleteGoal,
  deleteWeight,
  reactivateGoal,
  setActiveGoal,
  setWeight,
} from '../../src/features/weight/data/weight-writes';
import { weightRangeFor } from '../../src/features/weight/domain/weight-range';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The weight access layer, against a real SQLite file (D15).
 *
 * Nothing is mocked: the CHECKs, the primary key and the partial unique index
 * exercised here are the ones the iPhone will enforce.
 */

const TODAY = toLocalDate('2026-03-01');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function seedRun(from: LocalDate, values: readonly (number | null)[]): void {
  values.forEach((value, index) => {
    if (value !== null) setWeight(database.db, addDays(from, index), value);
  });
}

describe('recording a weight', () => {
  it('replaces the measurement already on that date', () => {
    setWeight(database.db, TODAY, 80.4);
    setWeight(database.db, TODAY, 79.9);

    expect(readWeight(database.db, TODAY)).toBe(79.9);
    expect(readWeightHistory(database.db)).toHaveLength(1);
  });

  it('keeps created_at across an overwrite and moves updated_at', () => {
    // Correcting this morning's weight does not make it a new measurement — it
    // is the same weighing, typed better.
    setWeight(database.db, TODAY, 80.4, 1_000);
    setWeight(database.db, TODAY, 79.9, 2_000);

    const row = database.raw
      .prepare('SELECT created_at AS c, updated_at AS u FROM weight_measure WHERE date = ?')
      .get(TODAY);

    expect(row).toEqual({ c: 1_000, u: 2_000 });
  });

  it('refuses a weight the CHECK calls impossible', () => {
    expect(() => setWeight(database.db, TODAY, 0)).toThrow(/ck_weight_value/);
  });

  it('removes a measurement without touching its neighbours', () => {
    seedRun(TODAY, [80, 79.8, 79.6]);
    deleteWeight(database.db, addDays(TODAY, 1));

    expect(readWeightHistory(database.db).map((row) => row.valueKg)).toEqual([79.6, 80]);
  });

  it('lists the history newest first', () => {
    // The list exists to correct a recent mistake, so the day before yesterday
    // belongs at the top.
    seedRun(TODAY, [80, 79.8, 79.6]);

    expect(readWeightHistory(database.db).map((row) => row.date)).toEqual([
      addDays(TODAY, 2),
      addDays(TODAY, 1),
      TODAY,
    ]);
  });
});

describe('the SQL bucket and the TypeScript bucket agree', () => {
  it('on the Monday of the week, for every date across four years', () => {
    /**
     * THE TEST THIS MODULE EXISTS TO BE HELD BY.
     *
     * `date(d, 'weekday 0', '-6 days')` in SQL and startOfWeek in core/date are
     * two implementations of one question, and two implementations of one
     * question is exactly what this project keeps finding inside its own bugs —
     * the window function of slice 4 is held to readLastEntryForFood by the same
     * shape of test, and for the same reason.
     *
     * Compared date by date rather than on a handful of examples: the cases
     * that would break are year boundaries and the Sunday that must NOT walk
     * forward a week, and neither is something anyone thinks to write by hand.
     */
    const rows = database.raw.prepare(
      "SELECT date(?, 'weekday 0', '-6 days') AS monday",
    );

    let checked = 0;
    for (let offset = -800; offset <= 800; offset += 1) {
      const date = addDays(TODAY, offset);
      const fromSql = (rows.get(date) as { monday: string }).monday;

      expect(fromSql, `SQL vs core/date on ${date}`).toBe(startOfWeek(date));
      // And the module's own helper, which is what bucketsOf lays the axis out
      // with: a third spelling would be a third chance to disagree.
      expect(bucketOf(date, 'week'), `bucketOf on ${date}`).toBe(startOfWeek(date));
      checked += 1;
    }

    expect(checked).toBe(1601);
  });

  it('on the first of the month', () => {
    for (const date of ['2026-01-31', '2026-02-01', '2026-12-31', '2024-02-29']) {
      const local = toLocalDate(date);
      const fromSql = (
        database.raw
          .prepare("SELECT substr(?, 1, 7) || '-01' AS first")
          .get(date) as { first: string }
      ).first;

      expect(fromSql).toBe(bucketOf(local, 'month'));
    }
  });
});

describe('reading a series at each grain', () => {
  it('returns one row per day, sparse, at the daily grain', () => {
    seedRun(addDays(TODAY, -6), [80, null, 79.8, null, null, 79.4, 79.2]);
    const range = weightRangeFor('30', TODAY, addDays(TODAY, -6));

    const rows = readWeights(database.db, range);

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.valueKg)).toEqual([80, 79.8, 79.4, 79.2]);
  });

  it('averages the week at the weekly grain, which IS the smoothing there', () => {
    /**
     * Specs 9.2 precision 3: aggregated, the raw and smoothed series "se
     * confondent visuellement". A weekly mean of daily weights is already a
     * seven-day average — which is why smoothing it again in TypeScript, on
     * every daily row, is not merely wasteful but the thing D13 forbids.
     */
    const monday = toLocalDate('2026-03-02');
    setWeight(database.db, monday, 80);
    setWeight(database.db, addDays(monday, 1), 79);
    setWeight(database.db, addDays(monday, 2), 78);
    // The following Monday: a different bucket, not a fourth value in this one.
    setWeight(database.db, addDays(monday, 7), 70);

    const later = addDays(monday, 200);
    const range = weightRangeFor('365', later, monday);
    const rows = readWeights(database.db, range);

    expect(range.grain).toBe('week');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: monday, valueKg: 79 });
    expect(rows[1]).toEqual({ date: addDays(monday, 7), valueKg: 70 });
  });

  it('averages the month at the monthly grain', () => {
    setWeight(database.db, toLocalDate('2024-01-05'), 82);
    setWeight(database.db, toLocalDate('2024-01-25'), 80);
    setWeight(database.db, toLocalDate('2024-02-10'), 78);

    const range = weightRangeFor('all', toLocalDate('2026-03-01'), toLocalDate('2024-01-05'));
    const rows = readWeights(database.db, range);

    expect(range.grain).toBe('month');
    expect(rows).toEqual([
      { date: toLocalDate('2024-01-01'), valueKg: 81 },
      { date: toLocalDate('2024-02-01'), valueKg: 78 },
    ]);
  });

  it('keeps every point under two hundred, whatever the history — which is D13', () => {
    /**
     * > Aucun graphique ne dépasse alors deux cents points, et le choix de la
     * > bibliothèque cesse d'être une question de performance. (D13)
     *
     * Four years of daily weighing is fourteen hundred rows. Asserted rather
     * than reasoned about, because the whole claim of this module is that the
     * aggregation happens in SQL and the caller never sees the difference.
     */
    const start = toLocalDate('2022-03-01');
    const rows: { date: string; value: number }[] = [];
    for (let offset = 0; offset < 1_400; offset += 1) {
      rows.push({ date: addDays(start, offset), value: 80 - offset * 0.001 });
    }
    const insert = database.raw.prepare(
      'INSERT INTO weight_measure (date, value_kg) VALUES (?, ?)',
    );
    database.raw.transaction(() => {
      for (const row of rows) insert.run(row.date, row.value);
    })();

    for (const key of ['30', '90', '365', 'all'] as const) {
      const range = weightRangeFor(key, TODAY, start);
      expect(
        readWeights(database.db, range).length,
        `${key}: too many points for D13`,
      ).toBeLessThanOrEqual(200);
    }
  });
});

describe('the dense axis', () => {
  it('starts at the bucket containing the range start, not at the range start', () => {
    /**
     * A range rarely begins on a Monday, and the bucket its first day belongs to
     * starts BEFORE it. An axis starting at the range's own first date would
     * never draw the date SQL grouped that measurement into, so the first point
     * of the range would silently vanish.
     */
    const from = toLocalDate('2026-03-05'); // a Thursday
    const range = { ...weightRangeFor('365', addDays(from, 200), from), from, grain: 'week' as const };

    const buckets = bucketsOf(range);

    expect(buckets[0]).toBe(startOfWeek(from));
    expect(buckets[0]).toBe(toLocalDate('2026-03-02'));
  });

  it('walks a month at a time across a year boundary', () => {
    const range = {
      from: toLocalDate('2025-11-15'),
      to: toLocalDate('2026-02-03'),
      days: 81,
      grain: 'month' as const,
      showRaw: false,
    };

    expect(bucketsOf(range)).toEqual([
      toLocalDate('2025-11-01'),
      toLocalDate('2025-12-01'),
      toLocalDate('2026-01-01'),
      toLocalDate('2026-02-01'),
    ]);
  });

  it('gives every SQL row a position on the axis, at every grain', () => {
    /**
     * The property that actually matters, and the one a hand-written axis gets
     * wrong: a row SQL produced must land on a bucket the axis drew. Otherwise
     * a measurement is read, aggregated, and then dropped by the join.
     */
    const start = toLocalDate('2023-01-04');
    for (let offset = 0; offset < 900; offset += 3) {
      setWeight(database.db, addDays(start, offset), 80 - offset * 0.002);
    }

    for (const key of ['30', '90', '365', 'all'] as const) {
      const range = weightRangeFor(key, TODAY, start);
      const axis = new Set(bucketsOf(range));

      for (const row of readWeights(database.db, range)) {
        expect(axis.has(row.date), `${key}: ${row.date} is not on the axis`).toBe(true);
      }
    }
  });
});

describe('the first measurement ever', () => {
  it('is null on an empty database', () => {
    expect(readFirstWeightDate(database.db)).toBeNull();
  });

  it('is the earliest date, not the earliest written', () => {
    setWeight(database.db, TODAY, 80);
    setWeight(database.db, addDays(TODAY, -100), 82);
    setWeight(database.db, addDays(TODAY, -50), 81);

    expect(readFirstWeightDate(database.db)).toBe(addDays(TODAY, -100));
  });
});

describe('the goal', () => {
  it('is null until one is set', () => {
    expect(readActiveGoal(database.db)).toBeNull();
  });

  it('retires the previous one rather than deleting it', () => {
    // Specs 6.2 lists modifiable, désactivable and supprimable as three
    // different actions, so they leave three different traces.
    setActiveGoal(
      database.db,
      { targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: -0.35 },
      1_000,
    );
    setActiveGoal(
      database.db,
      { targetKg: 74, mode: 'rate', targetDate: null, rateKgPerWeek: -0.25 },
      2_000,
    );

    const active = readActiveGoal(database.db);
    expect(active?.targetKg).toBe(74);
    expect(
      database.raw.prepare('SELECT COUNT(*) AS n FROM weight_goal').get(),
    ).toEqual({ n: 2 });
  });

  it('never leaves two active, whatever the order of operations', () => {
    setActiveGoal(
      database.db,
      { targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: -0.35 },
    );
    const second = setActiveGoal(
      database.db,
      { targetKg: 74, mode: 'target_date', targetDate: toLocalDate('2026-12-31'), rateKgPerWeek: null },
    );
    reactivateGoal(database.db, second);

    expect(
      database.raw.prepare('SELECT COUNT(*) AS n FROM weight_goal WHERE is_active = 1').get(),
    ).toEqual({ n: 1 });
  });

  it('stores only the term its mode uses, which is D9 in the schema', () => {
    setActiveGoal(database.db, {
      targetKg: 76,
      mode: 'rate',
      // A date supplied in rate mode is dropped rather than written: the derived
      // half is never stored, and ck_weight_goal_terms would refuse it anyway.
      targetDate: toLocalDate('2026-12-31'),
      rateKgPerWeek: -0.35,
    });

    const goal = readActiveGoal(database.db);
    expect(goal?.targetDate).toBeNull();
    expect(goal?.rateKgPerWeek).toBe(-0.35);
  });

  it('can be switched off and back on without losing its terms', () => {
    const id = setActiveGoal(database.db, {
      targetKg: 76,
      mode: 'target_date',
      targetDate: toLocalDate('2026-12-31'),
      rateKgPerWeek: null,
    });

    deactivateGoal(database.db);
    expect(readActiveGoal(database.db)).toBeNull();

    reactivateGoal(database.db, id);
    const back = readActiveGoal(database.db);
    expect(back?.targetDate).toBe(toLocalDate('2026-12-31'));
    expect(back?.targetKg).toBe(76);
  });

  it('deletes outright when asked, costing the history nothing', () => {
    const id = setActiveGoal(
      database.db,
      { targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: -0.35 },
    );
    setWeight(database.db, TODAY, 80);

    deleteGoal(database.db, id);

    expect(readActiveGoal(database.db)).toBeNull();
    // Nothing references a goal, so no measurement moves.
    expect(readWeight(database.db, TODAY)).toBe(80);
  });
});
