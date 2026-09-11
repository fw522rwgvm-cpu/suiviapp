import { PORTION_NAMES, type PortionName } from '@/core/db/schema';

/**
 * Named portions and the arithmetic around them (specs 6.1 v2.2).
 *
 * > Each portion compulsorily carries a quantity in base units (one slice =
 * > 25 g). Without it, a portion is not calculable.
 *
 * THE INVARIANT THIS MODULE EXISTS TO PROTECT: a stored quantity is ALWAYS in
 * base units, never a count of portions.
 *
 * It is not a preference. readDayTotals sums `quantity * protein_100 / 100.0`
 * with no clause and no special case, which is what makes free entry, foods
 * and recipe lines aggregate through one expression. If `quantity` could ever
 * hold "2" meaning two slices, every total in the application would be wrong
 * for that row — plausibly wrong, which is the worst kind.
 *
 * So a portion is an INPUT METHOD. The count the user typed is converted here
 * and the base quantity is what travels on; the portion's name and size ride
 * along beside it so the entry can be re-opened and re-edited in the terms it
 * was entered in. Exactly the status display_ref_qty has on a food.
 */

export { PORTION_NAMES, type PortionName };

/** A portion as it is defined on a food. */
export interface Portion {
  name: string;
  /** In base units. Always > 0: the schema's CHECK refuses anything else. */
  quantity: number;
}

/**
 * A quantity, with the way it was expressed kept alongside it.
 *
 * `baseQuantity` is the only field any calculation ever reads. `portion` is
 * what the screen needs to reopen the entry showing "2 tranches" rather than
 * "50 g", and what gets frozen into journal_entry.portion_name /
 * portion_quantity.
 */
export interface QuantityChoice {
  /** In base units. What every aggregation multiplies. */
  baseQuantity: number;
  /** Null when the user typed base units directly. */
  portion: { name: string; quantity: number; count: number } | null;
}

export function baseQuantity(value: number): QuantityChoice {
  return { baseQuantity: value, portion: null };
}

/** `count` portions of `portion`, resolved to base units here and nowhere else. */
export function portionQuantity(portion: Portion, count: number): QuantityChoice {
  return {
    baseQuantity: portion.quantity * count,
    portion: { name: portion.name, quantity: portion.quantity, count },
  };
}

/**
 * How many portions a base quantity amounts to.
 *
 * Not rounded: 60 g of a 25 g slice is 2.4 slices, and the screen decides how
 * to show that. Rounding here would feed a rounded value back into the
 * conversion that reconstructs the base quantity, and the entry would drift by
 * a few grams every time it was opened.
 */
export function countOf(portion: Portion, base: number): number {
  return base / portion.quantity;
}

/**
 * Rebuilds the choice behind a stored entry, for the screen that reopens it.
 *
 * THE RULE THAT MATTERS IS THE FALLBACK, not the happy path.
 *
 * An entry froze the portion's name AND its size at the time (D5/R1). If the
 * food's portion of that name has since been redefined — a slice that was
 * 25 g is now 30 g — the count is NOT recomputed against the new size. Doing
 * so would turn "2 slices" into 60 g when 50 g is what was eaten, silently
 * rewriting history that specs 5.2 freezes.
 *
 * So the frozen size wins, always. The current definition is consulted for one
 * thing only: whether to offer portion mode at all, which is the caller's
 * business, not this function's.
 */
export function choiceOf(
  base: number,
  frozen: { name: string; quantity: number } | null,
): QuantityChoice {
  if (frozen === null || frozen.quantity <= 0) return baseQuantity(base);
  return {
    baseQuantity: base,
    portion: { name: frozen.name, quantity: frozen.quantity, count: base / frozen.quantity },
  };
}

/**
 * The names still available on a food, in the order specs 6.1 lists them.
 *
 * A name is unique per food (specs 6.1 v2.2, and ux_portion_food_name), so the
 * picker must not offer one that is taken — otherwise the only feedback is a
 * failed write, and the schema's unique index is the last thing that should be
 * doing the talking.
 */
export function availableNames(taken: readonly string[]): PortionName[] {
  const used = new Set(taken);
  return PORTION_NAMES.filter((name) => !used.has(name));
}

export function isPortionName(value: string): value is PortionName {
  return (PORTION_NAMES as readonly string[]).includes(value);
}
