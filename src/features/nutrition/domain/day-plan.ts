import type { LocalDate } from '@/core/date';
import type { DayTemplateId } from '@/core/db/schema/planning';
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
 * SLICE 5 LANDED AND THIS SURVIVED, exactly as written: "no template applies"
 * now means "the planning designates nothing", which is a fresh database and
 * is also every database whose last template has just been deleted. Seeding a
 * template in 0004 would not have removed this path — only added a second
 * source of meal names beside it.
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
 * What a date's planning prescribes: a template, and the meals it carries.
 *
 * ONE SHAPE FOR TWO USES, and that is the point. It renders a virtual day, and
 * it feeds the snapshot taken when that day is materialised — so what the user
 * saw is what they get, and the two cannot drift apart. The identifier and the
 * name travel with the meals because day.template_id_snapshot and
 * template_name_snapshot are written from the same resolution, in the same
 * transaction.
 */
export interface DayPlan {
  /** Null when the planning designates nothing at all. */
  templateId: DayTemplateId | null;
  templateName: string | null;
  meals: PlannedMeal[];
}

/**
 * The plan when the planning answers nothing (specs 8.1 assumes it always
 * does; see DEFAULT_MEAL_NAMES for why that assumption needed an answer).
 *
 * The snapshot columns stay NULL, which is the truthful record: no template
 * applied, so naming one would invent a fact.
 */
export function fallbackDayPlan(): DayPlan {
  return { templateId: null, templateName: null, meals: defaultDayMeals() };
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
  /**
   * The template this day SHOWS, which is two different facts under one name.
   *
   * On a materialised day it is template_name_snapshot: the template as it was
   * called on the day this one was frozen, and possibly a template that no
   * longer exists. On a virtual day it is the template the planning resolves
   * to right now.
   *
   * That is not a conflation, it is the same question answered in the two
   * regimes specs 8.2 defines — "where do these meals come from" — and the
   * screen needs exactly one answer to show. Null when neither applies.
   */
  templateName: string | null;
  meals: DayMealView[];
}

/**
 * The day as it reads before anyone has acted on it. No rows, no writes.
 *
 * The plan is passed in rather than fetched, because this module knows no
 * database — and because the caller has already resolved it to decide whether
 * the day is virtual at all. A template holding no meal yields a day holding
 * no meal, which is legitimate: specs 8.3 already lets a materialised day be
 * emptied of every one of its meals.
 */
export function virtualDay(date: LocalDate, plan: DayPlan = fallbackDayPlan()): DayView {
  return {
    date,
    materialized: false,
    templateName: plan.templateName,
    meals: plan.meals.map((meal) => ({ id: null, ...meal })),
  };
}

/**
 * The day's targets are the sum of its meals' and are never stored
 * (specs 8.1, D9).
 *
 * Null when no meal carries one — which was the whole of slice 1, and is now
 * the state of a day the planning answers nothing for, and of every day
 * materialised before 0004. The banner then shows what was eaten rather than
 * what is left, and says so.
 *
 * Meals carrying a target and meals carrying none can coexist: a "Collation"
 * with no goal is legitimate, and the sum is over those that have one. That is
 * specs 8.1 read literally — the day's targets are the sum of its meals'.
 */
export function dayTargets(meals: readonly Pick<DayMealView, 'targets'>[]): Macros | null {
  const present = meals
    .map((meal) => meal.targets)
    .filter((targets): targets is Macros => targets !== null);
  return present.length === 0 ? null : present.reduce(addMacros, ZERO_MACROS);
}
