import type { BaseUnit, FoodPortionId, FoodSource } from '@/core/db/schema';
import { isUsableRefQty, toCanonical } from './food-macros';
import type { Macros } from './macros';
import { isPortionName } from './portions';

/**
 * A food being created or edited, and what makes it valid (specs 8.5).
 *
 * Pure: it knows neither the database nor React. The editor screen holds one
 * of these in state, this module says what is wrong with it, and food-writes.ts
 * turns a valid one into rows. No calculation lives in the component (D9).
 *
 * PROBLEMS ARE VALUES, NEVER EXCEPTIONS (conventions section 4): an invalid
 * draft is an expected state of a form, not a programming error. And every
 * problem is collected rather than stopping at the first, for the same reason
 * the import validator collects its own — fixing a form one error per attempt
 * is a path you walk once, badly.
 *
 * WHAT IS DELIBERATELY NOT A PROBLEM: the 10% kcal discrepancy of specs 5.1.
 * It is a non-blocking warning by specification, so it must never be able to
 * stop a save. It lives in macros.ts, is computed alongside, and is displayed
 * beside the field rather than gating the button.
 */

export interface PortionDraft {
  /** Null for a portion being added. Set for one already stored. */
  id: FoodPortionId | null;
  name: string;
  /** In base units. */
  quantity: number;
}

export interface FoodDraft {
  name: string;
  brand: string | null;
  /**
   * The product's barcode, when it has one (slice 4).
   *
   * Set by the pre-filled form specs 8.5 diverts to when an Open Food Facts
   * product is missing one of the four macros, so that the food created there
   * deduplicates against the search afterwards exactly as a copied one does.
   * Null for a food typed in from scratch, which is most of them.
   *
   * NOT VALIDATED as a barcode. There is no closed set to check against and no
   * format worth refusing: a barcode is whatever the scanner read. The one
   * constraint is uniqueness, which the database owns (ux_food_barcode).
   */
  barcode: string | null;
  source: FoodSource;
  baseUnit: BaseUnit;
  /**
   * The macros AS TYPED — that is, for `refQty` base units, not for 100.
   *
   * The draft holds what the user sees; the canonical form is produced once,
   * by canonicalMacrosOf, on the way to the database.
   */
  macros: Macros;
  /**
   * The reference quantity the user typed the macros against. A display
   * preference with no normative value (specs 6.1, schema 2.2).
   */
  refQty: number;
  isFavorite: boolean;
  portions: PortionDraft[];
}

export type FoodProblem =
  | { code: 'name_empty' }
  | { code: 'ref_qty_invalid'; found: number }
  | { code: 'macro_negative'; macro: keyof Macros }
  | { code: 'portion_name_unknown'; index: number; name: string }
  | { code: 'portion_name_duplicated'; index: number; name: string }
  | { code: 'portion_quantity_invalid'; index: number; found: number };

const MACRO_KEYS: readonly (keyof Macros)[] = ['protein', 'carbs', 'fat', 'kcal'];

export function validateFoodDraft(draft: FoodDraft): FoodProblem[] {
  const problems: FoodProblem[] = [];

  if (draft.name.trim() === '') {
    problems.push({ code: 'name_empty' });
  }

  // Zero would make the canonical conversion divide by zero and produce an
  // Infinity that sails through every later multiplication and lands in the
  // database looking like a number.
  if (!isUsableRefQty(draft.refQty)) {
    problems.push({ code: 'ref_qty_invalid', found: draft.refQty });
  }

  for (const macro of MACRO_KEYS) {
    const value = draft.macros[macro];
    if (!Number.isFinite(value) || value < 0) {
      problems.push({ code: 'macro_negative', macro });
    }
  }

  // Checked here rather than by a CHECK constraint, deliberately: widening the
  // portion vocabulary breaks no invariant, and SQLite cannot widen a CHECK
  // without rebuilding the table. See the note on food_portion in the schema.
  const seen = new Set<string>();
  draft.portions.forEach((portion, index) => {
    if (!isPortionName(portion.name)) {
      problems.push({ code: 'portion_name_unknown', index, name: portion.name });
    }
    if (seen.has(portion.name)) {
      // Unique per food (specs 6.1 v2.2). Caught here so the feedback is a
      // message next to the row rather than a failed write citing an index.
      problems.push({ code: 'portion_name_duplicated', index, name: portion.name });
    }
    seen.add(portion.name);

    if (!Number.isFinite(portion.quantity) || portion.quantity <= 0) {
      problems.push({
        code: 'portion_quantity_invalid',
        index,
        found: portion.quantity,
      });
    }
  });

  return problems;
}

export function isValidFoodDraft(draft: FoodDraft): boolean {
  return validateFoodDraft(draft).length === 0;
}

/**
 * The macros as they are stored: for 100 base units (specs 6.1 v2.2).
 *
 * THE ONLY PLACE refQty IS EVER APPLIED ON THE WAY IN. Call it once, at the
 * boundary; never feed its result back through it.
 */
export function canonicalMacrosOf(draft: FoodDraft): Macros {
  return toCanonical(draft.macros, draft.refQty);
}

/** An empty draft, for the "new food" screen. Grams, personal, 100 g. */
export function emptyFoodDraft(): FoodDraft {
  return {
    name: '',
    brand: null,
    barcode: null,
    source: 'perso',
    baseUnit: 'g',
    macros: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    refQty: 100,
    isFavorite: false,
    portions: [],
  };
}
