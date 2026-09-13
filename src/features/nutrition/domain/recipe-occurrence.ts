import type { BaseUnit, FoodId, YieldType } from '@/core/db/schema';
import type { Macros } from './macros';
import { consumedFraction, scaleMacros, type RecipeYield } from './recipe-macros';

/**
 * One occasion of eating a recipe (specs 8.6).
 *
 * > 1. Quantité consommée, en portions ou en poids
 * > 2. Écran d'ajustement des ingrédients, éditable pour cette occurrence
 * >    uniquement
 * > 3. La recette enregistrée n'est jamais modifiée
 *
 * Pure: it knows neither the database nor React. It turns a recipe and an
 * amount into the lines that will be written, and the adjustment screen then
 * edits those lines — never the recipe.
 *
 * ## POINT 3 IS STRUCTURAL HERE, NOT A RULE ANYONE HAS TO REMEMBER
 *
 * Nothing in this module can reach a recipe row: it takes values and returns
 * values. An occurrence is built FROM a recipe and then has no way back to it,
 * which is why "la recette enregistrée n'est jamais modifiée" needs no guard
 * at the write boundary — there is nothing there that could modify one.
 */

/**
 * The portion name a recipe's parent row is stored under, when its yield is in
 * portions (specs 6.1 — 'portion' is one of the eight).
 *
 * It lives in the domain rather than in the text module because it is WRITTEN,
 * not merely displayed: addEntries puts it in journal_entry.portion_name, and
 * a data module importing a constant from components would be the dependency
 * running the wrong way. PORTION_NAMES sits in the schema module for the same
 * kind of reason.
 */
export const RECIPE_PORTION_NAME = 'portion';

/**
 * One adjusted ingredient, on its way to becoming a journal row.
 *
 * It carries the macros rather than a food identifier because it is about to
 * be frozen (D5/R1): the capsule is what the user confirmed, and re-reading
 * the food at write time would mean confirming one set of figures and storing
 * another.
 */
export interface OccurrenceLine {
  /**
   * Informative, without a live link — the same status source_food_id has on
   * every other entry. Null for an ingredient the recipe had already frozen.
   */
  sourceFoodId: FoodId | null;
  name: string;
  baseUnit: BaseUnit;
  /** In base units, scaled for this occasion and then freely edited. */
  quantity: number;
  /** For 100 base units, as the ingredient reads right now. */
  reference: Macros;
}

/** What the screen holds between choosing a quantity and confirming. */
export interface RecipeOccurrence {
  name: string;
  yieldType: YieldType;
  /** Portions, or grams, matching yieldType. */
  consumed: number;
  lines: OccurrenceLine[];
}

/**
 * The ingredients of a recipe, scaled to the amount being eaten.
 *
 * Two portions of a four-portion recipe halves every line; 250 g of an 850 g
 * one takes 250/850 of each. ONE multiplication per line, through the fraction
 * both yield types share — see consumedFraction for why the two are not two
 * cases.
 *
 * The result is a starting point, not a commitment: specs 8.6 has the user
 * adjust these before anything is written, and what lands in the journal is
 * what they saw and confirmed.
 */
export function occurrenceLines(
  recipe: {
    yield: RecipeYield;
    ingredients: readonly {
      foodId: FoodId | null;
      name: string;
      unit: BaseUnit;
      quantity: number;
      reference: Macros;
    }[];
  },
  consumed: number,
): OccurrenceLine[] {
  const fraction = consumedFraction(recipe.yield, consumed);

  return recipe.ingredients.map((ingredient) => ({
    sourceFoodId: ingredient.foodId,
    name: ingredient.name,
    baseUnit: ingredient.unit,
    quantity: ingredient.quantity * fraction,
    reference: ingredient.reference,
  }));
}

/** What the occasion comes to. Derived, never stored (D9). */
export function occurrenceTotal(lines: readonly OccurrenceLine[]): Macros {
  return lines.reduce<Macros>(
    (running, line) => {
      const contribution = scaleMacros(line.reference, line.quantity / 100);
      return {
        protein: running.protein + contribution.protein,
        carbs: running.carbs + contribution.carbs,
        fat: running.fat + contribution.fat,
        kcal: running.kcal + contribution.kcal,
      };
    },
    { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  );
}

/**
 * A line whose quantity has been edited for this occasion only.
 *
 * By index rather than by identity, because these lines have none: they are
 * positions in a list the screen built a moment ago, and giving them
 * identifiers would invite something to start referencing them.
 */
export function adjustLine(
  lines: readonly OccurrenceLine[],
  index: number,
  quantity: number,
): OccurrenceLine[] {
  return lines.map((line, at) => (at === index ? { ...line, quantity } : line));
}

/**
 * Whether an occurrence can be written.
 *
 * A line of zero is dropped rather than refused — taking an ingredient out for
 * one occasion is exactly what the adjustment screen is for, and making the
 * user delete the row instead would be a second way to say the same thing. An
 * occurrence with nothing left IS refused: a block with no children is a
 * parent carrying no macros at all, which would log a meal worth nought
 * calories that looks like a measurement.
 */
export function usableLines(lines: readonly OccurrenceLine[]): OccurrenceLine[] {
  return lines.filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
}

/**
 * What a recipe's quantity field opens on, when nothing else says (specs 8.6).
 *
 * One portion for a recipe yielded in portions: the amount a serving IS, which
 * is what the yield exists to express.
 *
 * A hundred grams for one yielded by weight, because there is no analogue of
 * "one serving" there and 100 base units is the canonical quantity of the
 * whole schema — the same figure the ingredient editor opens a new line on.
 */
export const DEFAULT_PORTIONS = 1;
export const DEFAULT_WEIGHT = 100;

/**
 * How much of a recipe the screen opens on (specs 8.4 v2.2, applied to 8.6).
 *
 * > L'écran de quantité s'ouvre pré-rempli avec la dernière quantité consommée.
 *
 * The same lever the foods have had since slice 3, and the same shape: the
 * last amount logged, or a default. It is SHORTER than the foods' four-step
 * chain because the two steps they need in the middle have no counterpart —
 * a recipe has no portions of its own to re-check the size of, and no
 * display_ref_qty. What is left is "last time, else a default", which is the
 * whole of it.
 *
 * A non-positive or non-finite last is treated as absent rather than trusted:
 * consumedFraction throws on it, and a stored zero could only come from an
 * archive repaired by hand.
 */
export function prefillRecipeQuantity(last: number | null, yieldType: YieldType): number {
  if (last !== null && Number.isFinite(last) && last > 0) return last;
  return yieldType === 'portions' ? DEFAULT_PORTIONS : DEFAULT_WEIGHT;
}

/**
 * The same lines, for a different amount of the recipe.
 *
 * ## THIS IS WHAT LETS THE TWO STEPS BECOME ONE
 *
 * They were two screens, and the reason was that the two edits do not commute:
 * adjusting a line and then changing the quantity would have to re-derive from
 * the recipe, silently discarding the adjustment.
 *
 * Scaling removes the objection instead of working around it. An adjustment is
 * kept as a RATIO — halve the cream at two portions, move to four, and it is
 * still half. And in the ordinary case, where nothing has been adjusted yet,
 * scaling and re-deriving are arithmetically the same thing:
 *
 *     q × (c₁ / yield) × (c₂ / c₁)  =  q × (c₂ / yield)
 *
 * So the merged screen behaves exactly as the two did on the common path, and
 * better on the one that used to lose work.
 *
 * A line at zero stays at zero, which is right: it was taken out of this
 * occasion, and changing how much of the dish is eaten does not put it back.
 *
 * `from` at zero cannot be scaled from — the field passes through empty while
 * it is retyped — so the caller re-derives instead. Returning the lines
 * unchanged would silently freeze them at the old amount.
 */
export function rescaleLines(
  lines: readonly OccurrenceLine[],
  from: number,
  to: number,
): OccurrenceLine[] | null {
  if (!Number.isFinite(from) || from <= 0) return null;
  const factor = to / from;
  return lines.map((line) => ({ ...line, quantity: line.quantity * factor }));
}
