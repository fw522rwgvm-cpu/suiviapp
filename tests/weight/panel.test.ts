import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate, type LocalDate } from '../../src/core/date';
import { readRateWindow, readWeightSeries } from '../../src/features/weight/data/weight-reads';
import { setWeight } from '../../src/features/weight/data/weight-writes';
import { weightPanel } from '../../src/features/weight/domain/panel';
import { RATE_LOAD_DAYS } from '../../src/features/weight/domain/rate';
import type { WeightGoal } from '../../src/features/weight/domain/weight-goal';
import {
  readRangeFor,
  weightRangeFor,
} from '../../src/features/weight/domain/weight-range';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The weight panel end to end: a real database, the reads, then the one pure
 * function the screen renders (specs 9.2, 9.4).
 */

const TODAY = toLocalDate('2026-03-01');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

/** A steady loss, weighed every day, ending today. */
function seedSteadyLoss(days: number, kgPerDay = 0.1, from = 90): void {
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(TODAY, -(days - 1 - offset));
    setWeight(database.db, date, from - kgPerDay * offset);
  }
}

function panelFor(key: '7' | '30' | '90' | '365', goal: WeightGoal | null = null) {
  const range = weightRangeFor(key, TODAY);

  return weightPanel(
    range,
    // Read over the widened range, exactly as the screen does: the run-up is
    // what keeps the first drawn point from being smoothed against a short
    // window.
    readWeightSeries(database.db, readRangeFor(range)),
    readRateWindow(database.db, TODAY, RATE_LOAD_DAYS),
    goal,
    TODAY,
  );
}

describe('the panel', () => {
  it('reports the real rate in kilograms per week', () => {
    seedSteadyLoss(40);

    const panel = panelFor('90');

    expect(panel.rate.ok).toBe(true);
    if (panel.rate.ok) expect(panel.rate.kgPerWeek).toBeCloseTo(-0.7, 6);
  });

  it('gives the SAME rate whatever range is on screen', () => {
    /**
     * THE PROPERTY THAT KEEPS THE CARD HONEST.
     *
     * Specs 9.2 fixes the regression window at fourteen days. The range control
     * governs what is DRAWN, never what is measured — a rate that moved when
     * someone tapped "1 an" would be reporting the picture rather than the body,
     * and it would be a plausible figure every time.
     *
     * This is why readRateWindow exists at all instead of the panel reusing the
     * chart's series, which on "1 an" is weekly buckets.
     */
    seedSteadyLoss(400);

    const rates = (['7', '30', '90', '365'] as const).map((key) => {
      const rate = panelFor(key).rate;
      return rate.ok ? rate.kgPerWeek : null;
    });

    expect(rates[0]).toBeCloseTo(-0.7, 6);
    for (const rate of rates) expect(rate).toBeCloseTo(rates[0] ?? 0, 10);
  });

  it('takes the current weight from the daily series, never from a weekly bucket', () => {
    /**
     * On the "1 an" range the chart's last bucket is a mean of the week, so a
     * current weight read from there would be an average of the last few days —
     * and every goal figure derived from it would drift as the range changed.
     */
    seedSteadyLoss(400);

    const current = (['7', '30', '90', '365'] as const).map((key) => panelFor(key).currentKg);

    for (const value of current) expect(value).toBeCloseTo(current[0] ?? 0, 10);
  });

  it('refuses a rate under seven measurements and says how many there are', () => {
    // Weighed four times in the last fortnight.
    for (const offset of [0, 3, 6, 9]) {
      setWeight(database.db, addDays(TODAY, -offset), 80 - offset * 0.1);
    }

    const panel = panelFor('90');

    expect(panel.rate.ok).toBe(false);
    if (!panel.rate.ok) {
      expect(panel.rate.points).toBe(4);
      expect(panel.rate.required).toBe(7);
    }
  });

  it('draws the raw series only while the grain is daily', () => {
    seedSteadyLoss(400);

    expect(panelFor('7').showRaw).toBe(true);
    expect(panelFor('30').showRaw).toBe(true);
    expect(panelFor('90').showRaw).toBe(true);
    expect(panelFor('365').showRaw).toBe(false);
  });

  it('holes the smoothed curve on days nobody weighed', () => {
    // Specs 9.2 precision 1, seen through the whole stack rather than on the
    // pure function alone.
    setWeight(database.db, addDays(TODAY, -10), 80);
    setWeight(database.db, TODAY, 79);

    const points = panelFor('30').points;
    const weighed = points.filter((point) => point.smoothed !== null);

    expect(weighed).toHaveLength(2);
    expect(weighed.map((point) => point.date)).toEqual([addDays(TODAY, -10), TODAY]);
  });

  it('has no goal panel when no goal is set', () => {
    seedSteadyLoss(40);
    expect(panelFor('90').goal).toBeNull();
  });
});

describe('the gap to the aimed rate', () => {
  const byRate = (targetKg: number, rateKgPerWeek: number): WeightGoal => ({
    targetKg,
    mode: 'rate',
    targetDate: null,
    rateKgPerWeek,
  });

  it('is the arithmetic difference, signed', () => {
    // Losing 0.7 a week while aiming for 0.5: the gap is -0.2.
    seedSteadyLoss(40);

    const panel = panelFor('90', byRate(70, -0.5));

    expect(panel.goal?.gapKgPerWeek).toBeCloseTo(-0.2, 6);
  });

  it('is null when the rate cannot be given', () => {
    // Four measurements: no rate, so no gap — never a gap computed against a
    // rate the panel just refused to state.
    for (const offset of [0, 3, 6, 9]) {
      setWeight(database.db, addDays(TODAY, -offset), 80 - offset * 0.1);
    }

    expect(panelFor('90', byRate(70, -0.5)).goal?.gapKgPerWeek).toBeNull();
  });

  it('carries the projection and the aimed rate beside it', () => {
    seedSteadyLoss(40);

    const panel = panelFor('90', byRate(80, -0.5));

    expect(panel.goal?.aimed.ok).toBe(true);
    if (panel.goal?.aimed.ok) expect(panel.goal.aimed.kgPerWeek).toBe(-0.5);
    // 86.1 now, 80 wanted, half a kilo a week: about twelve weeks out.
    expect(panel.goal?.projection.ok).toBe(true);
  });

  it('reports a target date goal whose day has passed rather than inventing a rate', () => {
    seedSteadyLoss(40);

    const panel = panelFor('90', {
      targetKg: 80,
      mode: 'target_date',
      targetDate: addDays(TODAY, -1),
      rateKgPerWeek: null,
    });

    expect(panel.goal?.aimed).toEqual({ ok: false, reason: 'date_passed' });
    expect(panel.goal?.gapKgPerWeek).toBeNull();
  });
});
