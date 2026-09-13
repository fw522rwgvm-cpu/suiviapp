/**
 * The closed list of meal names (specs 8.1, 8.3).
 *
 * Declared ONCE, as data, with the type derived from it — the shape
 * PORTION_NAMES already established, and for the same reason: a union cannot
 * be walked at runtime, so a type written beside a runtime array has to be kept
 * in step by hand, and the place it drifts is always a validator.
 *
 * French because these are stored verbatim and displayed verbatim. Freezing one
 * into a day is then a copy rather than a translation. The convention reserving
 * French for displayed strings governs how code is NAMED; day_meal.name has
 * held 'Petit-déjeuner' since slice 1.
 *
 * ## NO CHECK CONSTRAINT, AND THAT IS THE SETTLED POSITION RATHER THAN A GAP
 *
 * Two reasons, either of which would be enough.
 *
 * `day_meal` has been frozen since 0001 and SQLite has no ALTER TABLE ADD
 * CONSTRAINT, so a CHECK here would mean rebuilding the table that every
 * journal entry hangs off.
 *
 * And it would be the WEAKER barrier anyway, which is the argument slice 3
 * settled for food_portion.name: widening a display vocabulary breaks no
 * invariant — unlike journal_entry.kind, whose closed set is what makes the
 * clause-free macro SUM correct. So the rule lives where it can name the thing
 * it refused, at the write boundary, instead of citing a constraint.
 *
 * ## EXISTING ROWS MAY HOLD ANYTHING, AND THEY KEEP IT
 *
 * Until now addMeal took free text. A database in use can therefore hold a
 * meal called whatever its owner typed, and an imported archive certainly can.
 * Nothing here rewrites those: the rule applies to what is WRITTEN from now on,
 * and an unknown name is displayed as it stands. Renumbering somebody's old day
 * would be rewriting history to satisfy a rule that did not exist when it was
 * made (specs 5.2).
 */

export const MEAL_KINDS = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation'] as const;

export type MealKind = (typeof MEAL_KINDS)[number];

/**
 * The one kind a day may hold more than once.
 *
 * Breakfast, lunch and dinner are singular by definition — a day has one of
 * each or none. Snacks are the opposite: their whole nature is that there can
 * be several, which is why they are the only ones that ever need numbering.
 */
export const SNACK_KIND: MealKind = 'Collation';

export function isMealKind(value: string): value is MealKind {
  return (MEAL_KINDS as readonly string[]).includes(value);
}

/** True for the kinds a day may hold at most one of. */
export function isSingularKind(kind: MealKind): boolean {
  return kind !== SNACK_KIND;
}

/**
 * The kinds that may still be added to a day already holding `existing`.
 *
 * Snacks are always offered. A name outside the list — a legacy row — blocks
 * nothing: it is not one of the four, so it cannot be the singular occurrence
 * of one.
 */
export function availableKinds(existing: readonly string[]): MealKind[] {
  const taken = new Set(existing);
  return MEAL_KINDS.filter((kind) => !isSingularKind(kind) || !taken.has(kind));
}

/**
 * True when `kind` may be given to the meal at `index` of `names`.
 *
 * Index-aware so it serves renaming as well as adding: a meal keeping its own
 * kind is not in conflict with itself. Pass names.length as the index to ask
 * about a meal that does not exist yet.
 */
export function canUseKind(
  names: readonly string[],
  index: number,
  kind: MealKind,
): boolean {
  if (!isSingularKind(kind)) return true;
  return !names.some((name, at) => at !== index && name === kind);
}

/**
 * How each meal of a day is LABELLED, which is not what is stored.
 *
 * > If there are several snacks in the same day, add a number after Collation.
 *
 * The number is DERIVED, every time, from the day's own list — never written to
 * the database. D9 says in as many words that nothing derivable is stored, and
 * this is the case that shows why it matters rather than merely being tidy:
 * stored, "Collation 2" would survive the deletion of "Collation 1" and sit
 * there naming a position that no longer exists. Derived, the survivor simply
 * becomes "Collation" again.
 *
 * One snack is not numbered. The number exists to tell several apart, and a
 * lone "Collation 1" would be answering a question nobody asked.
 *
 * Names outside the closed list pass through untouched — see the note at the
 * top of this file on rows written before the rule existed.
 */
export function mealLabels(names: readonly string[]): string[] {
  const snackCount = names.filter((name) => name === SNACK_KIND).length;
  if (snackCount < 2) return [...names];

  let seen = 0;
  return names.map((name) => {
    if (name !== SNACK_KIND) return name;
    seen += 1;
    return `${SNACK_KIND} ${seen}`;
  });
}

/** The label of one meal, given the day it belongs to. */
export function mealLabelAt(names: readonly string[], index: number): string {
  return mealLabels(names)[index] ?? (names[index] ?? '');
}
