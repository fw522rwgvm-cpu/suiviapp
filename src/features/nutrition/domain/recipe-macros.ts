import type { BaseUnit, YieldType } from '@/core/db/schema';
import { ZERO_MACROS, type Macros } from './macros';

/**
 * Recipe arithmetic (D9, specs 8.6).
 *
 * > Macros toujours calculées depuis les ingrédients.
 *
 * Pure functions, knowing neither the database nor React. Nothing here is ever
 * stored: a recipe holds no macro column at all, which is what makes specs 5.3
 * true without a line of code — "une recette est un objet vivant" is a
 * property of NOT STORING, so correcting a food moves every recipe that uses
 * it and moves nothing already eaten.
 *
 * ## THE DIVISION OF LABOUR WITH SQL, AND WHY IT IS NOT ARBITRARY
 *
 * D9 allows two levels and nothing between them. Both are used, but never for
 * the same question:
 *
 *   SQL      sums the ingredients into a TOTAL, in one grouped query for the
 *            whole library. A read per recipe was affordable while only twenty
 *            recents carried one; it is not affordable over a whole library on
 *            a path D16 budgets at 0.3 s. Slice 4 already learned this exact
 *            lesson extending the quantity to favourites and search.
 *   here     DIVIDES that total, and only divides it.
 *
 * So there is ONE multiplication path and ONE division path. Two sums of the
 * same ingredients — one in SQL for the list, one here for the editor — would
 * agree almost always, and the day they disagreed a recipe would state one
 * figure in the library and another in its own screen, both plausible. A test
 * holds the two implementations to each other rather than trusting care, the
 * way readLastEntryForFood and the window function are already held.
 */

export interface RecipeYield {
  type: YieldType;
  value: number;
}

/**
 * Scales macros by a plain factor.
 *
 * Distinct from totalOf, which divides by 100 because it takes a quantity
 * against a canonical reference. A factor here is a factor: passing one to the
 * other is the kind of mistake that produces a number a hundred times wrong,
 * which is at least visible — and one a hundredth wrong, which is not.
 */
export function scaleMacros(macros: Macros, factor: number): Macros {
  return {
    protein: macros.protein * factor,
    carbs: macros.carbs * factor,
    fat: macros.fat * factor,
    kcal: macros.kcal * factor,
  };
}

/**
 * A yield of zero or less is impossible in the database and would be
 * contagious if it were not: every derived macro becomes Infinity, and an
 * Infinity reaches journal_entry.quantity the moment the recipe is logged —
 * a column the exporter throws on.
 *
 * ck_recipe_yield_value makes it unreachable for a stored recipe, so arriving
 * here with one is a programming error rather than a state of the domain.
 * Conventions section 4 reserves return values for expected failures; this is
 * not one, and returning zero would be worse than throwing — an ingredient
 * that silently contributes nothing is exactly the plausible-and-wrong class
 * the whole slice is built to avoid.
 *
 * The editor guards its own draft separately, before there is anything to
 * store (see validateRecipeDraft).
 */
function requireYield(recipeYield: RecipeYield): number {
  const { value } = recipeYield;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`A recipe yield must be a positive number, got ${value}`);
  }
  return value;
}

/**
 * What fraction of the whole recipe a consumed amount is.
 *
 * ## THE TWO YIELD TYPES ARE THE SAME FORMULA, AND THAT IS THE FINDING
 *
 * Two portions of a four-portion recipe is 2/4. Two hundred and fifty grams of
 * an 850 g recipe is 250/850. Both are `consumed / yieldValue`, and the yield
 * type changes nothing here at all — it changes only the UNIT WRITTEN ON THE
 * WHEEL the user turns, which is presentation.
 *
 * It is worth saying out loud because the obvious implementation is a switch
 * on yield type with two branches that happen to be identical, and the second
 * branch is where a difference would eventually be introduced by someone
 * "fixing" one case.
 */
export function consumedFraction(recipeYield: RecipeYield, consumed: number): number {
  return consumed / requireYield(recipeYield);
}

/**
 * The macros of ONE yield unit: one portion, or 100 g of the finished dish.
 *
 * This is the one place the two yield types genuinely differ, and they differ
 * only in what "one unit" means. A portion is a whole unit of the yield; a
 * weight yield is stated per 100 g, because 100 base units is the canonical
 * form everywhere else in this schema and "per gram" is not a figure anyone
 * reads.
 */
export function macrosPerYieldUnit(total: Macros, recipeYield: RecipeYield): Macros {
  const value = requireYield(recipeYield);
  return scaleMacros(total, recipeYield.type === 'portions' ? 1 / value : 100 / value);
}

/**
 * One ingredient line as the domain sees it, live link or frozen capsule.
 *
 * The two cases are collapsed HERE rather than at every call site, because
 * every reader of a recipe has to handle both and none of them should have to
 * know which is which. Null when the row carries neither, which
 * ck_ingredient_link makes impossible in the database and which a hand-built
 * object could still reach.
 */
export interface IngredientSource {
  foodId: string | null;
  quantity: number;
  unit: BaseUnit;
  liveName: string | null;
  liveBaseUnit: BaseUnit | null;
  liveReference: Macros | null;
  frozenName: string | null;
  frozenBaseUnit: BaseUnit | null;
  frozenReference: Macros | null;
}

export interface IngredientView {
  name: string;
  /** Whether the link to the food is gone (specs 5.3). */
  frozen: boolean;
  quantity: number;
  unit: BaseUnit;
  /** For 100 base units, live or frozen. */
  reference: Macros;
  /** What this line contributes. Derived, never stored (D9). */
  total: Macros;
}

/**
 * The live values, or the frozen ones — in that order, always.
 *
 * Live wins whenever the link is intact, which is the whole of specs 5.3's
 * "modifier un aliment met bien à jour les recettes qui l'utilisent". The
 * frozen columns are not a cache of the live ones: they are empty for the
 * whole normal life of a row and filled only by the deletion that broke the
 * link (D5/R3), so there is never a moment when both are set and the order
 * could matter.
 */
export function ingredientView(source: IngredientSource): IngredientView | null {
  const live =
    source.foodId !== null &&
    source.liveName !== null &&
    source.liveBaseUnit !== null &&
    source.liveReference !== null
      ? { name: source.liveName, baseUnit: source.liveBaseUnit, reference: source.liveReference }
      : null;

  const frozen =
    source.frozenName !== null && source.frozenReference !== null
      ? {
          name: source.frozenName,
          // The unit the food had. Falls back to the line's own, which the
          // write boundary keeps equal to it.
          baseUnit: source.frozenBaseUnit ?? source.unit,
          reference: source.frozenReference,
        }
      : null;

  const resolved = live ?? frozen;
  if (resolved === null) return null;

  return {
    name: resolved.name,
    frozen: live === null,
    quantity: source.quantity,
    unit: source.unit,
    reference: resolved.reference,
    total: scaleMacros(resolved.reference, source.quantity / 100),
  };
}

/**
 * The whole recipe, summed from its ingredients.
 *
 * THE TYPESCRIPT HALF OF THE PAIR. The library reads the same figure out of
 * SQL, and a test holds the two to each other over generated recipes — which
 * is the only thing that keeps them honest, since they would agree on every
 * example anyone thought to write by hand.
 *
 * A line that resolves to neither a link nor a capsule is skipped rather than
 * counted as zero, and that distinction is why ingredientView returns null:
 * SUM would silently ignore it too, so the two implementations agree on the
 * impossible case as well as the possible ones.
 */
export function recipeTotal(ingredients: readonly IngredientView[]): Macros {
  return ingredients.reduce(
    (running, ingredient) => ({
      protein: running.protein + ingredient.total.protein,
      carbs: running.carbs + ingredient.total.carbs,
      fat: running.fat + ingredient.total.fat,
      kcal: running.kcal + ingredient.total.kcal,
    }),
    ZERO_MACROS,
  );
}
