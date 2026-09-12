import type { BaseUnit, FoodId } from '@/core/db/schema';
import { formatQuantity } from '@/core/format';
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

/** What this line will contribute. Derived, never stored (D9). */
export function pendingEntryKcal(entry: PendingEntry): number {
  return entry.kind === 'free'
    ? entry.macros.kcal
    : totalOf(entry.reference, entry.quantity.baseQuantity).kcal;
}

/**
 * How the line reads under its name: "2 tranches · 50 g", or the macros of a
 * free entry — which has no quantity anyone typed, so showing one would be
 * showing the storage form.
 */
export function describePendingEntry(entry: PendingEntry): string {
  if (entry.kind === 'free') {
    const { protein, carbs, fat } = entry.macros;
    return `P ${round(protein)} · G ${round(carbs)} · L ${round(fat)}`;
  }

  const { baseQuantity, portion } = entry.quantity;
  const amount = formatQuantity(baseQuantity, entry.baseUnit);
  return portion === null
    ? amount
    : `${formatPortionCount(portion.count, portion.name)} · ${amount}`;
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}
