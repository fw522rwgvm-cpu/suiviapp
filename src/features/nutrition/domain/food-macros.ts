import type { Macros } from './macros';

/**
 * The conversion around display_ref_qty, and the fence that keeps it harmless
 * (D9).
 *
 * Macros are stored canonically, for 100 base units (specs 6.1 v2.2). The
 * reference quantity the user thinks in — 30, for a food whose label reads
 * "per 30 g" — is kept as a display preference with no normative value.
 *
 * WHY THAT IS NOT A BREACH OF D9, AND WHAT WOULD BE.
 *
 * display_ref_qty is not derivable: it is an input captured at an instant, and
 * D9 says in as many words that such a value is legitimately stored. The
 * danger runs the other way — that something starts deriving FROM it, at which
 * point the canonical macros stop being the single source and two numbers
 * describe the same food.
 *
 * The fence is these two functions being the only place it is ever multiplied,
 * and both of them living at the presentation boundary:
 *
 *  - toCanonical runs ONCE, on the way in, in the food editor;
 *  - fromCanonical runs ONCE, on the way out, in the same editor;
 *  - food-reads.ts returns macros for 100 and nothing else;
 *  - nothing in macros.ts — totalOf, sumMacros, remainingMacros, the kcal
 *    check — takes a reference quantity, so no total can depend on one.
 *
 * The test that makes this falsifiable rather than merely intended: change a
 * food's display_ref_qty and assert every journal total is identical.
 */

/**
 * A reference quantity has to be usable as a divisor, so zero and negatives
 * are refused rather than producing an Infinity that would sail through every
 * later multiplication and land in the database.
 */
export function isUsableRefQty(refQty: number): boolean {
  return Number.isFinite(refQty) && refQty > 0;
}

/** The canonical form: what the user typed for refQty units, restated per 100. */
export function toCanonical(typed: Macros, refQty: number): Macros {
  const factor = 100 / refQty;
  return {
    protein: typed.protein * factor,
    carbs: typed.carbs * factor,
    fat: typed.fat * factor,
    kcal: typed.kcal * factor,
  };
}

/** The inverse: stored macros restated for the quantity the user thinks in. */
export function fromCanonical(canonical: Macros, refQty: number): Macros {
  const factor = refQty / 100;
  return {
    protein: canonical.protein * factor,
    carbs: canonical.carbs * factor,
    fat: canonical.fat * factor,
    kcal: canonical.kcal * factor,
  };
}
