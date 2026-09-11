import type { LocalDate } from '@/core/date';
import type { DayMealId } from '@/core/db/schema/nutrition';
import { addMacros, ZERO_MACROS, type Macros } from './macros';

/**
 * What a day is made of, materialised or not (specs 8.2).
 *
 * > A day is materialised at the user's first action concerning it. Until
 * > then it is virtual: browsing three months of history creates nothing.
 *
 * The same shape describes both, on purpose. One function builds the meal
 * list, and it serves twice: to render a virtual day, and to feed the snapshot
 * taken when that day is finally materialised. The user therefore sees exactly
 * what they will get, and the two cannot drift apart.
 */

/**
 * Meals used when no template applies.
 *
 * Specs 8.2 assumes a template always exists, and none does before slice 5:
 * day templates, the weekly planning and the default template all arrive
 * there. This list is the missing source, and it is not stored derived data
 * (D9) — the day_meal rows it produces are a snapshot, and D9 says in as many
 * words that frozen is not derived.
 *
 * When slice 5 lands, "no template applies" becomes "the planning designates
 * nothing", and this survives as the "no default template configured" path.
 */
export const DEFAULT_MEAL_NAMES = [
  'Petit-déjeuner',
  'Déjeuner',
  'Dîner',
  'Collation',
] as const;

/** A meal as the plan describes it, before it exists in the database. */
export interface PlannedMeal {
  position: number;
  name: string;
  /** Per-meal targets (specs 8.1). NULL until templates exist, in slice 5. */
  targets: Macros | null;
}

export function defaultDayMeals(): PlannedMeal[] {
  return DEFAULT_MEAL_NAMES.map((name, position) => ({ position, name, targets: null }));
}

/**
 * A meal as a screen renders it. The identifier is null while the day is
 * virtual, which is why writes address a meal by position and not by id: on a
 * virtual day there is no id to address it with, and tapping "add" on the
 * second meal has to land in the second meal.
 */
export interface DayMealView {
  id: DayMealId | null;
  position: number;
  name: string;
  targets: Macros | null;
}

export interface DayView {
  date: LocalDate;
  /** False while nothing has been written for this date. */
  materialized: boolean;
  meals: DayMealView[];
}

/** The day as it reads before anyone has acted on it. No rows, no writes. */
export function virtualDay(date: LocalDate): DayView {
  return {
    date,
    materialized: false,
    meals: defaultDayMeals().map((meal) => ({ id: null, ...meal })),
  };
}

/**
 * The day's targets are the sum of its meals' and are never stored
 * (specs 8.1, D9).
 *
 * Null when no meal carries one, which is the whole of slice 1: without
 * templates there is no target, so the banner shows what was eaten rather than
 * what is left. Section 7 says as much — the remaining banner becomes
 * meaningful in slice 5.
 */
export function dayTargets(meals: readonly Pick<DayMealView, 'targets'>[]): Macros | null {
  const present = meals
    .map((meal) => meal.targets)
    .filter((targets): targets is Macros => targets !== null);
  return present.length === 0 ? null : present.reduce(addMacros, ZERO_MACROS);
}
