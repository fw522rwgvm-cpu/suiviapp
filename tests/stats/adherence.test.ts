import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { Macros } from '../../src/features/nutrition/domain/macros';
import {
  adherenceOf,
  isDayWithin,
  isMacroWithin,
  type DayFigure,
} from '../../src/features/stats/domain/adherence';

/**
 * The adherence rate (specs 8.7).
 *
 * D15's criterion applies about as directly as it ever does: every decision in
 * this module produces a plausible percentage either way. A rate that counts
 * unrecorded days as failures, or today as a failure at nine in the morning, or
 * a day whose goal covers one meal, looks exactly like a rate that does not.
 */

const TODAY = toLocalDate('2026-09-14');

function macros(protein: number, carbs: number, fat: number, kcal: number): Macros {
  return { protein, carbs, fat, kcal };
}

const GOAL = macros(150, 250, 70, 2200);

function day(date: string, consumed: Macros | null, target: Macros | null): DayFigure {
  return { date: toLocalDate(date), consumed, target };
}

describe('isMacroWithin', () => {
  it('accepts either side of the goal', () => {
    expect(isMacroWithin(90, 100, 10)).toBe(true);
    expect(isMacroWithin(110, 100, 10)).toBe(true);
  });

  it('is a band, not a ceiling — half the goal is not on target', () => {
    // The reading that matters: a one-sided rule would call this a success,
    // which is the wrong answer for the macro the application exists to hit.
    expect(isMacroWithin(50, 100, 10)).toBe(false);
  });

  it('includes its own bounds', () => {
    expect(isMacroWithin(89.9, 100, 10)).toBe(false);
    expect(isMacroWithin(90, 100, 10)).toBe(true);
    expect(isMacroWithin(110, 100, 10)).toBe(true);
    expect(isMacroWithin(110.1, 100, 10)).toBe(false);
  });

  it('allows nothing against a goal of zero, and meets it with zero', () => {
    expect(isMacroWithin(0, 0, 10)).toBe(true);
    expect(isMacroWithin(1, 0, 10)).toBe(false);
    expect(isMacroWithin(1, 0, 100)).toBe(false);
  });
});

describe('isDayWithin', () => {
  it('needs all four, not three', () => {
    expect(isDayWithin(GOAL, GOAL, 10)).toBe(true);
    // Fat alone is out; the other three are exactly on target.
    expect(isDayWithin(macros(150, 250, 100, 2200), GOAL, 10)).toBe(false);
    expect(isDayWithin(macros(150, 250, 100, 2200), GOAL, 50)).toBe(true);
  });

  it('fails on calories even when the three macros are held', () => {
    // Which is possible: specs 5.1 keeps a source's own calories as given, so
    // they are not a function of the other three.
    expect(isDayWithin(macros(150, 250, 70, 3000), GOAL, 10)).toBe(false);
  });
});

describe('adherenceOf', () => {
  it('is null over nothing, never zero per cent', () => {
    const result = adherenceOf([], 10, TODAY);
    expect(result.rate).toBeNull();
    expect(result.judged).toBe(0);
  });

  it('excludes a day with no entry from the denominator', () => {
    const result = adherenceOf(
      [
        day('2026-09-12', GOAL, GOAL),
        // Nothing written down. Not a failure: an absence of measurement
        // (specs 8.7 no 1).
        day('2026-09-13', null, GOAL),
      ],
      10,
      TODAY,
    );

    expect(result.recorded).toBe(1);
    expect(result.judged).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('excludes a recorded day that has no goal, and says how many', () => {
    // Every day materialised before migration 0004 is in this case, for good.
    const result = adherenceOf(
      [day('2026-09-12', GOAL, GOAL), day('2026-09-13', GOAL, null)],
      10,
      TODAY,
    );

    expect(result.recorded).toBe(2);
    expect(result.judged).toBe(1);
    expect(result.recorded - result.judged).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('excludes today, which is a day still being lived', () => {
    // The decisive case. A morning's eating against a whole day's goal is a
    // partial measurement, and counting it would make the rate fall every
    // morning and recover every evening for no dietary reason.
    const result = adherenceOf(
      [
        day('2026-09-13', GOAL, GOAL),
        day('2026-09-14', macros(20, 30, 5, 250), GOAL),
      ],
      10,
      TODAY,
    );

    expect(result.span).toBe(1);
    expect(result.judged).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('excludes a future day too', () => {
    // Specs 8.2 allows logging future dates without limit, so they turn up in
    // a range that ends today only if the clock moved — but "strictly before
    // today" answers both without a second rule.
    const result = adherenceOf(
      [day('2026-09-13', GOAL, GOAL), day('2026-09-20', macros(0, 0, 0, 0), GOAL)],
      10,
      TODAY,
    );

    expect(result.judged).toBe(1);
  });

  it('counts the proportion of judged days, not of the range', () => {
    const result = adherenceOf(
      [
        day('2026-09-10', GOAL, GOAL),
        day('2026-09-11', GOAL, GOAL),
        day('2026-09-12', macros(10, 10, 10, 100), GOAL),
        day('2026-09-13', null, GOAL),
      ],
      10,
      TODAY,
    );

    expect(result.span).toBe(4);
    expect(result.recorded).toBe(3);
    expect(result.judged).toBe(3);
    expect(result.within).toBe(2);
    expect(result.rate).toBeCloseTo(2 / 3);
  });

  it('widens with the tolerance, which is what makes it a setting', () => {
    const days = [day('2026-09-13', macros(165, 275, 77, 2420), GOAL)];

    expect(adherenceOf(days, 5, TODAY).rate).toBe(0);
    // Exactly ten per cent over on all four.
    expect(adherenceOf(days, 10, TODAY).rate).toBe(1);
  });
});

describe('a rate per macro', () => {
  it('is null for each when nothing could be judged', () => {
    const { byMacro } = adherenceOf([day('2026-09-13', null, null)], 10, TODAY);
    expect(byMacro).toEqual({ protein: null, carbs: null, fat: null, kcal: null });
  });

  it('names WHICH macro is costing the days', () => {
    // The whole reason they exist. One figure at 0 % says the month went badly
    // and hides that three of the four were held all along.
    const over = macros(150, 400, 70, 2200);
    const result = adherenceOf(
      [day('2026-09-12', over, GOAL), day('2026-09-13', over, GOAL)],
      10,
      TODAY,
    );

    expect(result.rate).toBe(0);
    expect(result.byMacro.protein).toBe(1);
    expect(result.byMacro.fat).toBe(1);
    expect(result.byMacro.kcal).toBe(1);
    expect(result.byMacro.carbs).toBe(0);
  });

  it('never lets the overall rate exceed the weakest of the four', () => {
    // The invariant that makes the five figures readable side by side: a day
    // counts overall only if it counted on every one of them.
    const days = [
      day('2026-09-08', GOAL, GOAL),
      day('2026-09-09', macros(150, 400, 70, 2200), GOAL),
      day('2026-09-10', macros(10, 250, 70, 2200), GOAL),
      day('2026-09-11', macros(150, 250, 200, 2200), GOAL),
      day('2026-09-12', macros(150, 250, 70, 900), GOAL),
      day('2026-09-13', null, GOAL),
    ];

    for (const tolerance of [1, 10, 25, 100]) {
      const result = adherenceOf(days, tolerance, TODAY);
      const weakest = Math.min(
        result.byMacro.protein ?? 0,
        result.byMacro.carbs ?? 0,
        result.byMacro.fat ?? 0,
        result.byMacro.kcal ?? 0,
      );
      expect(result.rate ?? 0).toBeLessThanOrEqual(weakest);
    }
  });

  it('shares the denominator with the headline, so the five compare', () => {
    const result = adherenceOf(
      [
        day('2026-09-11', GOAL, GOAL),
        // Excluded from every one of the five, not from some of them.
        day('2026-09-12', null, GOAL),
        day('2026-09-13', GOAL, null),
      ],
      10,
      TODAY,
    );

    expect(result.judged).toBe(1);
    expect(result.byMacro.protein).toBe(1);
    expect(result.rate).toBe(1);
  });
});
