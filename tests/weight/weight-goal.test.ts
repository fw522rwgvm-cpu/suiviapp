import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  projectedDate,
  targetRate,
  validateGoalDraft,
  type WeightGoal,
} from '../../src/features/weight/domain/weight-goal';

/**
 * The two modes of specs 6.2, and the figure each derives.
 *
 * > Défini au choix par DATE CIBLE (le rythme en kg/semaine est calculé) ou par
 * > RYTHME VISÉ (la date d'atteinte est estimée).
 */

const TODAY = toLocalDate('2026-03-01');

function byDate(targetKg: number, date: string): WeightGoal {
  return {
    targetKg,
    mode: 'target_date',
    targetDate: toLocalDate(date),
    rateKgPerWeek: null,
  };
}

function byRate(targetKg: number, rateKgPerWeek: number): WeightGoal {
  return { targetKg, mode: 'rate', targetDate: null, rateKgPerWeek };
}

describe('the rate a target date implies', () => {
  it('spreads the distance left over the weeks left', () => {
    // 80 now, 76 wanted, ten weeks away: 0.4 kg a week, losing.
    const rate = targetRate(byDate(76, '2026-05-10'), 80, TODAY);

    expect(rate.ok).toBe(true);
    if (rate.ok) expect(rate.kgPerWeek).toBeCloseTo(-0.4, 10);
  });

  it('moves every day, because both the distance and the time move', () => {
    /**
     * EASY TO MISTAKE FOR A BUG, so it is pinned.
     *
     * The target rate is what you would NOW have to hold. It is derived rather
     * than frozen at the moment the goal was set — which is D9, and also the
     * only reading that stays true as the weeks pass.
     */
    const goal = byDate(76, '2026-05-10');

    const onTrack = targetRate(goal, 80, TODAY);
    const behind = targetRate(goal, 81, TODAY);

    expect(onTrack.ok && behind.ok).toBe(true);
    if (!onTrack.ok || !behind.ok) return;
    // A kilo further away over the same weeks: a steeper rate is required.
    expect(Math.abs(behind.kgPerWeek)).toBeGreaterThan(Math.abs(onTrack.kgPerWeek));
  });

  it('says the date has passed rather than dividing by a span of zero', () => {
    // Today itself, and a date behind. Neither is an error to hide: a goal
    // whose day has come is exactly what someone needs to be told about.
    expect(targetRate(byDate(76, '2026-03-01'), 80, TODAY)).toEqual({
      ok: false,
      reason: 'date_passed',
    });
    expect(targetRate(byDate(76, '2026-02-01'), 80, TODAY)).toEqual({
      ok: false,
      reason: 'date_passed',
    });
  });

  it('says so when there is no weight to measure the distance from', () => {
    expect(targetRate(byDate(76, '2026-05-10'), null, TODAY)).toEqual({
      ok: false,
      reason: 'no_weight',
    });
  });

  it('hands back the rate unchanged in rate mode', () => {
    // Nothing to derive: the user gave this one directly.
    const rate = targetRate(byRate(76, -0.35), 80, TODAY);

    expect(rate.ok).toBe(true);
    if (rate.ok) expect(rate.kgPerWeek).toBe(-0.35);
  });
});

describe('the date a rate implies', () => {
  it('projects forward at the rate given', () => {
    // 80 now, 76 wanted, half a kilo a week: eight weeks, so 56 days.
    const projection = projectedDate(byRate(76, -0.5), 80, TODAY);

    expect(projection.ok).toBe(true);
    if (projection.ok) {
      expect(projection.weeks).toBeCloseTo(8, 10);
      expect(projection.date).toBe(toLocalDate('2026-04-26'));
    }
  });

  it('projects a gain as readily as a loss', () => {
    const projection = projectedDate(byRate(84, 0.5), 80, TODAY);

    expect(projection.ok).toBe(true);
    if (projection.ok) expect(projection.weeks).toBeCloseTo(8, 10);
  });

  it('calls a rate of zero maintenance, not an error', () => {
    /**
     * The reason no CHECK bounds the rate. "Je veux rester à 75 kg" is a
     * legitimate goal that reaches nothing new, so there is no date — and
     * saying "maintaining" is a different sentence from saying "impossible".
     */
    expect(projectedDate(byRate(76, 0), 80, TODAY)).toEqual({
      ok: false,
      reason: 'maintaining',
    });
  });

  it('refuses to project a rate pointing away from the target', () => {
    // Gaining while aiming lower. The honest answer is that this never
    // arrives — never a date in the past dressed up as a projection.
    expect(projectedDate(byRate(76, 0.5), 80, TODAY)).toEqual({
      ok: false,
      reason: 'wrong_way',
    });
    expect(projectedDate(byRate(84, -0.5), 80, TODAY)).toEqual({
      ok: false,
      reason: 'wrong_way',
    });
  });

  it('calls a target already met met, within a tenth of a kilo', () => {
    /**
     * Without the tolerance this would be an exact equality of two floating
     * point numbers, which never happens — so the screen would forever say a
     * few grams remain. A hundred grams is one notch on a domestic scale.
     */
    expect(projectedDate(byRate(76, -0.5), 76, TODAY)).toEqual({ ok: false, reason: 'reached' });
    expect(projectedDate(byRate(76, -0.5), 76.05, TODAY)).toEqual({
      ok: false,
      reason: 'reached',
    });
    // And just outside it, the projection resumes.
    expect(projectedDate(byRate(76, -0.5), 76.5, TODAY).ok).toBe(true);
  });

  it('hands back the date unchanged in target_date mode', () => {
    const projection = projectedDate(byDate(76, '2026-05-10'), 80, TODAY);

    expect(projection.ok).toBe(true);
    if (projection.ok) expect(projection.date).toBe(toLocalDate('2026-05-10'));
  });

  it('says so when there is no weight at all', () => {
    expect(projectedDate(byRate(76, -0.5), null, TODAY)).toEqual({
      ok: false,
      reason: 'no_weight',
    });
  });
});

describe('what the write boundary refuses', () => {
  it('accepts a well-formed goal in each mode', () => {
    expect(
      validateGoalDraft(
        { targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: -0.35 },
        TODAY,
      ),
    ).toEqual([]);
    expect(
      validateGoalDraft(
        {
          targetKg: 76,
          mode: 'target_date',
          targetDate: toLocalDate('2026-05-10'),
          rateKgPerWeek: null,
        },
        TODAY,
      ),
    ).toEqual([]);
  });

  it('refuses a target weight that is not a positive number', () => {
    for (const targetKg of [null, 0, -5, Number.NaN]) {
      expect(
        validateGoalDraft({ targetKg, mode: 'rate', targetDate: null, rateKgPerWeek: -0.35 }, TODAY),
      ).toContain('target_not_positive');
    }
  });

  it('accepts a rate of ZERO, because maintenance is a goal', () => {
    // Only absence is a problem. This is the case a naive falsy check breaks.
    expect(
      validateGoalDraft({ targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: 0 }, TODAY),
    ).toEqual([]);
  });

  it('refuses a missing term for the mode chosen', () => {
    expect(
      validateGoalDraft({ targetKg: 76, mode: 'rate', targetDate: null, rateKgPerWeek: null }, TODAY),
    ).toEqual(['rate_missing']);
    expect(
      validateGoalDraft(
        { targetKg: 76, mode: 'target_date', targetDate: null, rateKgPerWeek: null },
        TODAY,
      ),
    ).toEqual(['target_date_missing']);
  });

  it('refuses a target date that is not in the future — the rule NO CHECK could carry', () => {
    /**
     * "In the future" is not a property of the row, it is a relation between
     * the row and the clock, and it changes on its own overnight. A CHECK is
     * evaluated at write time and would then be silently false for every goal
     * that ages past its date — which is not corruption, it is a goal whose day
     * has come.
     *
     * So it lives at the write boundary, where it can be a message, and the row
     * stays perfectly legal once the date passes.
     */
    expect(
      validateGoalDraft(
        { targetKg: 76, mode: 'target_date', targetDate: TODAY, rateKgPerWeek: null },
        TODAY,
      ),
    ).toEqual(['target_date_not_future']);
    expect(
      validateGoalDraft(
        {
          targetKg: 76,
          mode: 'target_date',
          targetDate: toLocalDate('2026-02-28'),
          rateKgPerWeek: null,
        },
        TODAY,
      ),
    ).toEqual(['target_date_not_future']);
  });

  it('ignores the term the chosen mode does not use', () => {
    // A form that kept both fields on screen must not report the idle one.
    expect(
      validateGoalDraft(
        { targetKg: 76, mode: 'rate', targetDate: toLocalDate('2020-01-01'), rateKgPerWeek: -0.35 },
        TODAY,
      ),
    ).toEqual([]);
  });
});
