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
 * The quantity, as the line shows it beside the name. Null for a free entry.
 *
 * WHEN A PORTION WAS USED, ONLY THE PORTION IS SHOWN. "2 tranches" is what was
 * decided; "50 g" is what it came to, and the two together are the same fact
 * said twice in a place that has room for one. The grams stay where they are
 * needed — the journal row, where an entry has to be readable against a total.
 *
 * A free entry has no quantity anyone typed: it is stored as 100 units of a
 * virtual food (D5/R2), and showing "100 g" would be showing the storage form.
 * Null rather than an empty string, so the caller leaves the slot out entirely
 * rather than rendering a gap.
 */
export function describePendingEntryQuantity(entry: PendingEntry): string | null {
  if (entry.kind === 'free') return null;

  const { baseQuantity, portion } = entry.quantity;
  return portion === null
    ? formatQuantity(baseQuantity, entry.baseUnit)
    : formatPortionCount(portion.count, portion.name);
}

/**
 * The three macros, as the line shows them under the name.
 *
 * These are what the line CONTRIBUTES, not what the food is worth for 100 — a
 * basket is a decision about a meal, and the only figures worth showing before
 * a decision are the ones about to be committed. Showing the per-100 values
 * would be plausible, wrong, and invisible.
 */
export function describePendingEntryMacros(entry: PendingEntry): string {
  const { protein, carbs, fat } = pendingEntryMacros(entry);
  return `P ${formatMacro(protein)} · G ${formatMacro(carbs)} · L ${formatMacro(fat)}`;
}

/**
 * Did the platform have to cut the name to fit it on its line?
 *
 * Asked because the row drops the quantity rather than let either of the two be
 * ellipsised: half a food name identifies nothing, and "2 tra..." is worse than
 * silence. It is answered from the line the text actually laid out, since any
 * count of characters is a guess about a font.
 *
 * IT FAILS OPEN, AND THAT IS THE POINT. What iOS puts in a truncated line's
 * text is not something this project can verify without the device: it may be
 * the visible prefix, that prefix plus an ellipsis, or -- on some platforms --
 * the whole string regardless. So the only answer of "yes" is the one that is
 * unambiguous: what was shown is a SHORTER PREFIX of the name. Anything else
 * unrecognised leaves the quantity in place, which is the behaviour of the day
 * this was written. A rule that hid the quantity whenever it was unsure would
 * hide it always, on every row, the first time a platform reported differently.
 */
export function wasNameTruncated(shownLine: string, name: string): boolean {
  // The ellipsis the platform appends is not part of what fitted. Only the one
  // character is stripped: a name may legitimately end in a full stop, and
  // eating it would turn every such name into a false positive.
  const shown = shownLine.trim().replace(/\u2026+$/u, '');
  const full = name.trim();
  return shown.length < full.length && full.startsWith(shown);
}
