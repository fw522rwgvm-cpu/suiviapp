import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  DEFAULT_MEAL_NAMES,
  dayTargets,
  defaultDayMeals,
  virtualDay,
} from '../../src/features/nutrition/domain/day-plan';

const DATE = toLocalDate('2026-09-11');

describe('the plan of a day without any template', () => {
  it('numbers the default meals from zero, in order', () => {
    const meals = defaultDayMeals();
    expect(meals.map((meal) => meal.name)).toEqual([...DEFAULT_MEAL_NAMES]);
    expect(meals.map((meal) => meal.position)).toEqual([0, 1, 2, 3]);
  });

  it('carries no target before templates exist', () => {
    expect(defaultDayMeals().every((meal) => meal.targets === null)).toBe(true);
  });
});

describe('virtualDay', () => {
  it('reads like a materialised day, minus the identifiers', () => {
    const day = virtualDay(DATE);
    expect(day.date).toBe(DATE);
    expect(day.materialized).toBe(false);
    expect(day.meals.every((meal) => meal.id === null)).toBe(true);
    expect(day.meals).toHaveLength(DEFAULT_MEAL_NAMES.length);
  });

  it('gives every call the same plan, so nothing drifts between renders', () => {
    expect(virtualDay(DATE)).toEqual(virtualDay(DATE));
  });
});

describe('dayTargets', () => {
  it('is null when no meal carries a target, which is the whole of slice 1', () => {
    // Without a target the banner shows what was eaten, not what is left.
    // Section 7 puts it plainly: the remaining banner becomes meaningful in
    // slice 5.
    expect(dayTargets(virtualDay(DATE).meals)).toBeNull();
  });

  it('sums the meals that do carry one', () => {
    expect(
      dayTargets([
        { targets: { protein: 30, carbs: 40, fat: 10, kcal: 400 } },
        { targets: { protein: 50, carbs: 60, fat: 20, kcal: 700 } },
        { targets: null },
      ]),
    ).toEqual({ protein: 80, carbs: 100, fat: 30, kcal: 1100 });
  });
});
