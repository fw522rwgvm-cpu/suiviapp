import type { BaseUnit, FoodId } from '@/core/db/schema';
import { formatMacro, formatQuantity } from '@/core/format';
import { formatPortionCount } from '../components/portion-text';
import { totalOf, type Macros } from './macros';
import type { QuantityChoice } from './portions';

/**
 * A line chosen but not yet written (specs 8.4).
 *
 * The add screen collects these and commits the lot in one transaction, so
 * that a meal assembled in one visit lands whole or not at all — the
 * application can be killed at any moment, and half a meal is worse than none.
 *
 * WHY IT CARRIES A COPY RATHER THAN A REFERENCE. The basket has to show what
 * it holds — a name, a quantity, a calorie figure — and doing that from an
 * identifier would mean a query per line, each of which could answer
 * differently a second later. Carrying the reference macros makes the basket
 * show exactly what is about to be written, which is the only figure worth
 * showing before a decision.
 *
 * It is NOT the frozen capsule: the entry is built from the food again, inside
 * the transaction, at the moment of the write (D5/R1). This is presentation.
 */
export type PendingEntry =
  | {
      kind: 'food';
      foodId: FoodId;
      name: string;
      brand: string | null;
      baseUnit: BaseUnit;
      /** For 100 base units, as the food stores them. */
      reference: Macros;
      quantity: QuantityChoice;
    }
  | { kind: 'free'; name: string; macros: Macros };

/**
 * What this line will actually contribute. Derived, never stored (D9).
 *
 * A free entry is 100 units of a virtual food whose macros for 100 are the
 * values typed in, so its contribution IS those values — the same expression
 * as everything else, with no special case (D5/R2).
 */
export function pendingEntryMacros(entry: PendingEntry): Macros {
  return entry.kind === 'free'
    ? entry.macros
    : totalOf(entry.reference, entry.quantity.baseQuantity);
}

export function pendingEntryKcal(entry: PendingEntry): number {
  return pendingEntryMacros(entry).kcal;
}

/**
 * How the line reads under its name: the quantity when there is one, then the
 * three macros.
 *
 * The figures are what this line CONTRIBUTES, not what the food is worth for
 * 100 — a basket is a decision about a meal, and the only numbers worth
 * showing before a decision are the ones about to be committed.
 *
 * A free entry has no quantity anyone typed: it is stored as 100 units of a
 * virtual food (D5/R2), and showing "100 g" would be showing the storage form.
 * So it starts straight at the macros. The one presentational special case
 * free entry costs, as slice 1 already found.
 */
export function describePendingEntry(entry: PendingEntry): string {
  const { protein, carbs, fat } = pendingEntryMacros(entry);
  const macros = `P ${formatMacro(protein)} · G ${formatMacro(carbs)} · L ${formatMacro(fat)}`;

  if (entry.kind === 'free') return macros;

  const { baseQuantity, portion } = entry.quantity;
  const amount = formatQuantity(baseQuantity, entry.baseUnit);
  const quantity =
    portion === null
      ? amount
      : `${formatPortionCount(portion.count, portion.name)} · ${amount}`;

  return `${quantity} · ${macros}`;
}
