import type { Macros } from '../domain/macros';

/**
 * A product as this application uses it, normalised from Open Food Facts.
 *
 * THE SHAPE IS OURS, NOT THEIRS, and that is the whole point of this module.
 * What arrives from the API is large, inconsistently typed, and carries fields
 * that must never be read (see off-parse.ts). What leaves here is four
 * nullable numbers, two nullable strings and a barcode — small enough to store
 * in the cache, and closed enough that the rest of the slice never has to ask
 * what Open Food Facts might have meant.
 *
 * MACROS ARE NULLABLE, and their nullability is load-bearing rather than
 * defensive. Specs 8.5:
 *
 * > Product found but incomplete: the absence of a SINGLE ONE of the four —
 * > protein, carbs, fat, kcal — takes you out of the fast path and switches to
 * > creating a personal food, PRE-FILLED with everything Open Food Facts
 * > supplied.
 *
 * So "absent" has to survive all the way from the response to the screen. The
 * one thing that must never happen is absent becoming zero: a product with no
 * declared protein would silently become a product with no protein, which is
 * plausible, wrong, and would send the user down the fast path instead of the
 * form. That is the defect D15 exists to catch, and it is one `Number('')`
 * away at every step.
 */
export interface OffProduct {
  /**
   * The barcode this product was asked for.
   *
   * Not the one the API echoed back: observed on 13/09/2026, a lookup for
   * 0000000000017 answers with code "00000017". The cache is keyed on this,
   * so it has to be the question rather than the answer.
   */
  barcode: string;
  /** `product_name`, which a surprising number of products do not have. */
  name: string | null;
  /** First brand only — see off-parse.ts for why there can be several. */
  brand: string | null;
  /** For 100 g, which is how Open Food Facts publishes everything. */
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  /**
   * `energy-kcal_100g`, kept as given and never derived from the other three
   * (specs 5.1: "the calorie value of a source is kept as it stands").
   *
   * NOT CONVERTED FROM KILOJOULES, even though many products publish only
   * those. Two reasons, and the second is the honest one:
   *
   *  - specs 5.1 says the source value is kept as it stands, and a kJ figure
   *    divided by 4.184 is a value this application computed;
   *  - it is not needed on the path that matters. Observed on 13/09/2026: the
   *    product endpoint supplies energy-kcal_100g even for a product whose
   *    search hit carried only kilojoules, because Open Food Facts computes it
   *    server-side. Search results are not what a food is built from — a
   *    chosen result is looked up by barcode first — so the gap closes itself.
   *
   * If the form nonetheless starts opening too often in real use, converting
   * is one line and this comment is where to argue about it.
   */
  kcal100: number | null;
}

/**
 * A product whose four macros are all present, which is the condition specs
 * 8.5 puts on the fast path.
 *
 * The name is in here too, and that is not an addition to the specs but a
 * reading of them: 8.5 says the form is pre-filled with what was supplied and
 * "only the missing fields are left to complete", and a name is a field. A
 * food with no name cannot be written at all — `food.name` is NOT NULL, and so
 * is `journal_entry.name`.
 */
export function isCompleteProduct(product: OffProduct): product is CompleteOffProduct {
  return (
    product.name !== null &&
    product.protein100 !== null &&
    product.carbs100 !== null &&
    product.fat100 !== null &&
    product.kcal100 !== null
  );
}

/** An OffProduct that has passed isCompleteProduct. */
export interface CompleteOffProduct extends OffProduct {
  name: string;
  protein100: number;
  carbs100: number;
  fat100: number;
  kcal100: number;
}

/**
 * Which of the four are missing, for the message that explains the detour.
 *
 * Returned as the French words because this list is shown, not branched on —
 * the branch is isCompleteProduct. Kept next to it so the two cannot disagree
 * about what "the four" means.
 */
export function missingMacroLabels(product: OffProduct): string[] {
  const missing: string[] = [];
  if (product.protein100 === null) missing.push('protéines');
  if (product.carbs100 === null) missing.push('glucides');
  if (product.fat100 === null) missing.push('lipides');
  if (product.kcal100 === null) missing.push('calories');
  return missing;
}

/** The macros of a complete product, in the shape the rest of the app uses. */
export function macrosOf(product: CompleteOffProduct): Macros {
  return {
    protein: product.protein100,
    carbs: product.carbs100,
    fat: product.fat100,
    kcal: product.kcal100,
  };
}

/**
 * Physically impossible energy, marked rather than refused (specs 8.5).
 *
 * > values that are physically impossible (beyond 900 kcal per 100 g) marked
 * > before validation
 *
 * STRICTLY ABOVE 900. Pure fat is 900 kcal per 100 g exactly, so an oil sits
 * on the boundary and must not be flagged — a warning that fires on olive oil
 * is a warning nobody reads twice.
 *
 * One threshold for both base units, rather than two numbers to justify: the
 * most energy-dense liquid there is stays well under it (oil at a density of
 * 0.92 comes to about 828 kcal per 100 ml, pure ethanol to about 552).
 *
 * It is a WARNING and never a refusal, which is the same refusal slice 3 made
 * when it declined to put a CHECK on the macros: specs 8.5 wants Open Food
 * Facts values marked and editable, never rejected, and the automatic copy
 * must never be blocked by an odd number.
 */
export const IMPOSSIBLE_KCAL_PER_100 = 900;

export function isImpossibleEnergy(kcal100: number | null): boolean {
  return kcal100 !== null && Number.isFinite(kcal100) && kcal100 > IMPOSSIBLE_KCAL_PER_100;
}
