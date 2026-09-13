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
