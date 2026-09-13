import type { BaseUnit, DayMealId, FoodId, RecipeId, YieldType } from '@/core/db/schema';
import { formatChoiceQuantity } from '../components/portion-text';
import { describeConsumed } from '../components/recipe-text';
import { macrosOf, type CompleteOffProduct } from '../off/off-product';
import { describeMacros, totalOf, type Macros } from './macros';
import type { QuantityChoice } from './portions';
import { occurrenceTotal, type OccurrenceLine } from './recipe-occurrence';

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
  | { kind: 'free'; name: string; macros: Macros }
  /**
   * A product chosen from Open Food Facts that is NOT in the library yet.
   *
   * IT CARRIES NO FoodId BECAUSE THERE IS NONE. Nothing has been written: the
   * copy of specs 8.5 happens at "Confirmer", inside the transaction that
   * writes the entries, so that a product chosen and then abandoned leaves
   * nothing behind. That is the cost of the decision, and this third case is
   * most of it.
   *
   * The display fields are derived from the product rather than copied beside
   * it — one statement of the name, not two that can drift.
   */
  | { kind: 'off'; product: CompleteOffProduct; quantity: QuantityChoice }
  /**
   * A recipe scaled and adjusted for this occasion (specs 8.6).
   *
   * It carries the LINES, not a recipe identifier, for the reason NewEntry
   * does: the adjustment exists only on the screen that made it, and a basket
   * that held an identifier would have to re-derive the occurrence to show
   * what it holds — discarding exactly the edit the user came here to make.
   *
   * The shape is NewEntry's, deliberately, so confirming is a copy rather than
   * a translation.
   */
  | {
      kind: 'recipe';
      recipeId: RecipeId;
      name: string;
      yieldType: YieldType;
      consumed: number;
      lines: readonly OccurrenceLine[];
    }
  /**
   * A whole past meal, waiting to be replayed (specs 8.4a).
   *
   * IT CARRIES AN IDENTIFIER WHERE A RECIPE CARRIES ITS LINES, and the
   * asymmetry is the point: a recipe was ADJUSTED on screen, so what the user
   * confirmed exists only there, while a recent meal was not touched at all.
   * Re-reading it at write time is therefore strictly better — specs 14.6 n° 6
   * wants the macros of the foods as they read TODAY, and a copy taken when
   * the basket was filled would be a few seconds older for no benefit.
   *
   * The display fields are a snapshot, and that is fine: they say what the
   * line will bring, and the basket is emptied with the screen.
   */
  | {
      kind: 'meal';
      sourceMealId: DayMealId;
      name: string;
      /** Top-level lines, for the row to name what it holds. */
      entryNames: readonly string[];
      kcal: number;
    };

/**
 * What this line will actually contribute. Derived, never stored (D9).
 *
 * A free entry is 100 units of a virtual food whose macros for 100 are the
 * values typed in, so its contribution IS those values — the same expression
 * as everything else, with no special case (D5/R2).
 */
export function pendingEntryMacros(entry: PendingEntry): Macros {
  if (entry.kind === 'free') return entry.macros;
  /**
   * A MEAL KNOWS ONLY ITS CALORIES, and says so rather than guessing.
   *
   * The recents query sums kcal and nothing else — three more sums for a row
   * that shows one figure would be three more sums on every keystroke. So the
   * three macros come back as zero, which the basket row must not print: it
   * shows the calories and the names, and no P / G / L line.
   *
   * The journal gets all four, from the rows the replay writes; this is the
   * one place that is short, and it is short where nothing reads it.
   */
  if (entry.kind === 'meal') {
    return { protein: 0, carbs: 0, fat: 0, kcal: entry.kcal };
  }
  // A block is the sum of its own lines, which is what its parent row will
  // show once written: the parent carries no macros of its own (D5/R2).
  if (entry.kind === 'recipe') return occurrenceTotal(entry.lines);

  return totalOf(referenceOf(entry), entry.quantity.baseQuantity);
}

/** The macros for 100, whichever side of the library the line comes from. */
function referenceOf(entry: PendingEntry & { kind: 'food' | 'off' }): Macros {
  return entry.kind === 'food' ? entry.reference : macrosOf(entry.product);
}

/**
 * What the line calls itself.
 *
 * Derived for a remote product rather than stored alongside it, so the basket
 * and the row that will be written cannot disagree about the name.
 */
export function pendingEntryName(entry: PendingEntry): string {
  return entry.kind === 'off' ? entry.product.name : entry.name;
}

/** How many rows this line is about to write, when it is more than one. */
export function pendingEntryLineCount(entry: PendingEntry): number | null {
  if (entry.kind === 'recipe') return entry.lines.length;
  if (entry.kind === 'meal') return entry.entryNames.length;
  return null;
}

/**
 * Whether the line can state its three macros.
 *
 * False for a meal alone: the recents query sums calories and nothing else,
 * and printing "P 0 · G 0 · L 0" beside a real calorie figure would be four
 * numbers of which three are false.
 */
export function hasPendingEntryMacros(entry: PendingEntry): boolean {
  return entry.kind !== 'meal';
}

export function pendingEntryBrand(entry: PendingEntry): string | null {
  if (entry.kind === 'free') return null;
  // Neither a recipe nor a meal has a brand, and neither ever will.
  if (entry.kind === 'recipe' || entry.kind === 'meal') return null;
  return entry.kind === 'off' ? entry.product.brand : entry.brand;
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

  // A meal says WHAT IS IN IT where the others say how much of one thing —
  // the same line the recents row shows, for the same reason: a count says
  // the size and never the identity.
  if (entry.kind === 'meal') {
    return entry.entryNames.length === 0 ? null : entry.entryNames.join(', ');
  }

  // A recipe says how much of ITSELF, in the terms its yield is stated in —
  // the same wording the library row and the journal row use, so the three
  // cannot disagree about what "2 portions" means.
  if (entry.kind === 'recipe') {
    return describeConsumed({ type: entry.yieldType, value: entry.consumed }, entry.consumed);
  }

  // Grams for a remote product, always: Open Food Facts publishes per 100 g
  // for everything it holds, and reading that as millilitres would be a
  // density of 1 where specs 5.1 allows none.
  const unit: BaseUnit = entry.kind === 'off' ? 'g' : entry.baseUnit;

  return formatChoiceQuantity(entry.quantity, unit);
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
  return describeMacros(pendingEntryMacros(entry));
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
