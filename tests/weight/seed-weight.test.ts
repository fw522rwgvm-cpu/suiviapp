import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import { seedJournal } from '../../src/dev/seed';
import {
  readActiveGoal,
  readRateWindow,
  readWeight,
  readWeightHistory,
  readWeightSeries,
} from '../../src/features/weight/data/weight-reads';
import { setWeight } from '../../src/features/weight/data/weight-writes';
import { weightPanel } from '../../src/features/weight/domain/panel';
import { RATE_LOAD_DAYS } from '../../src/features/weight/domain/rate';
import {
  readRangeFor,
  weightRangeFor,
} from '../../src/features/weight/domain/weight-range';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * What the demo generator owes slice 8 (D15).
 *
 * Slice 7 learned this the hard way with the day templates: without seeded
 * goals the banner stayed silent and the adherence rate had an empty
 * denominator, so half the slice was invisible on the device. The weight panel
 * has the same failure mode, and more of it — curves, real rate, gap, crossed
 * chart, all empty.
 */

const TODAY = toLocalDate('2026-03-01');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('the generated weight history', () => {
  it('writes measurements over the generated span', () => {
    const report = seedJournal(database.db, { endDate: TODAY, days: 120, seed: 7 });

    expect(report.weights).toBeGreaterThan(0);
    expect(readWeightHistory(database.db).length).toBe(report.weights);
  });

  it('leaves holes, because precision 1 exists for them', () => {
    // A history weighed every single day would never exercise the rule that a
    // smoothed point exists only for a date actually weighed.
    seedJournal(database.db, { endDate: TODAY, days: 120, seed: 7 });

    const range = weightRangeFor('90', TODAY);
    const series = readWeightSeries(database.db, range);

    expect(series.some((row) => row.raw === null)).toBe(true);
    expect(series.some((row) => row.raw !== null)).toBe(true);
  });

  it('produces a rate the panel can actually state', () => {
    /**
     * THE ASSERTION THE SEED EXISTS FOR.
     *
     * Specs 9.2 precision 2 needs seven measurements in the last fourteen days
     * before it will give a figure at all. A generator whose coverage fell below
     * that would leave the card saying "données insuffisantes" on a freshly
     * seeded device — which looks exactly like a broken calculation.
     */
    seedJournal(database.db, { endDate: TODAY, days: 120, seed: 7 });

    const range = weightRangeFor('90', TODAY);
    const panel = weightPanel(
      range,
      readWeightSeries(database.db, readRangeFor(range)),
      readRateWindow(database.db, TODAY, RATE_LOAD_DAYS),
      readActiveGoal(database.db),
      TODAY,
    );

    expect(panel.rate.ok, 'the seeded history must support a rate').toBe(true);
    if (panel.rate.ok) {
      // Downward drift, so the sign is exercised rather than left at zero.
      expect(panel.rate.kgPerWeek).toBeLessThan(0);
    }
  });

  it('gives the goal a NON-ZERO gap to the real rate', () => {
    /**
     * A goal matching the drift exactly would display a gap of zero — the one
     * value that looks the same whether the calculation works or not. The seeded
     * aim is deliberately steeper than the seeded drift.
     */
    seedJournal(database.db, { endDate: TODAY, days: 120, seed: 7 });

    const range = weightRangeFor('90', TODAY);
    const panel = weightPanel(
      range,
      readWeightSeries(database.db, readRangeFor(range)),
      readRateWindow(database.db, TODAY, RATE_LOAD_DAYS),
      readActiveGoal(database.db),
      TODAY,
    );

    expect(panel.goal).not.toBeNull();
    expect(panel.goal?.gapKgPerWeek).not.toBeNull();
    expect(Math.abs(panel.goal?.gapKgPerWeek ?? 0)).toBeGreaterThan(0.05);
  });

  it('rounds to a tenth, the way a domestic scale reads', () => {
    seedJournal(database.db, { endDate: TODAY, days: 60, seed: 7 });

    for (const row of readWeightHistory(database.db)) {
      expect(Math.round(row.valueKg * 10) / 10).toBe(row.valueKg);
    }
  });
});

describe('pressing the button twice', () => {
  it('never overwrites a weighing that was already there', () => {
    /**
     * THE DEFECT THIS TEST EXISTS TO PREVENT, and it is not hypothetical — the
     * first version of seedWeights had it.
     *
     * The Settings button promises nothing is erased. The journal half honours
     * that for free because it ADDS entries; setWeight is an upsert on a primary
     * key, so a second press would silently replace every real weighing in the
     * span with an invented one. There is no undo, and the export is the only
     * net.
     */
    const realDate = addDays(TODAY, -5);
    setWeight(database.db, realDate, 99.9);

    seedJournal(database.db, { endDate: TODAY, days: 60, seed: 7 });
    seedJournal(database.db, { endDate: TODAY, days: 60, seed: 11 });

    expect(readWeight(database.db, realDate)).toBe(99.9);
  });

  it('reports no new weighings on a span already covered', () => {
    seedJournal(database.db, { endDate: TODAY, days: 60, seed: 7 });
    const before = readWeightHistory(database.db).length;

    // Same span, different draw: every date it wants is either already weighed
    // or skipped, so what it adds is only what the first pass happened to miss.
    const second = seedJournal(database.db, { endDate: TODAY, days: 60, seed: 11 });

    expect(readWeightHistory(database.db).length).toBe(before + second.weights);
  });

  it('keeps the goal the user set rather than replacing it', () => {
    // Same rule seedTemplate follows: only when there is none.
    seedJournal(database.db, { endDate: TODAY, days: 30, seed: 7 });
    const first = readActiveGoal(database.db);

    seedJournal(database.db, { endDate: TODAY, days: 30, seed: 11 });

    expect(readActiveGoal(database.db)?.id).toBe(first?.id);
    expect(
      database.raw.prepare('SELECT COUNT(*) AS n FROM weight_goal').get(),
    ).toEqual({ n: 1 });
  });
});
