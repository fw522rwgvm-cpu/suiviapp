import { formatQuantity } from '@/core/format';
import { formatPortionCount } from './portion-text';
import type { RecipeYield } from '../domain/recipe-macros';
import { RECIPE_PORTION_NAME } from '../domain/recipe-occurrence';

/**
 * How recipes are worded on screen.
 *
 * A text module rather than strings inlined in a component, on the precedent
 * portion-text.ts and food-problem-text.ts set: wording that has a rule in it
 * is a pure function, so it can be tested and so two screens cannot word the
 * same fact two ways.
 */

/** How many names the warning spells out before it gives up and counts. */
const NAMES_SHOWN = 3;

/**
 * What deleting a food costs the recipes that use it (specs 5.3).
 *
 * Null when it costs nothing, so the caller leaves the sentence out entirely
 * rather than rendering "0 recette".
 *
 * ## WHAT THIS SENTENCE IS AND IS NOT ALLOWED TO SAY
 *
 * It must not say anything is lost, because nothing is: D5/R3 freezes every
 * ingredient line in the same transaction as the deletion, so the recipes keep
 * every figure they had and their totals do not move by a bit.
 *
 * What it says instead is that the LINK goes. Specs 5.3 makes a recipe follow
 * a food's edits — "une recette est un objet vivant, pas de l'historique" — and
 * after this deletion those ingredients stop following. Correcting the food
 * later, which specs 8.5 calls the main way to compensate for Open Food Facts'
 * uneven quality, will no longer reach them.
 *
 * That is a fact worth one sentence and never a refusal, which is the shape
 * specs 5.3 v2.2 sets for the exercise warning and slice 5 reused for
 * templates.
 *
 * The names are spelled out while there are few enough to read. Past that the
 * count is the honest summary: a wall of twelve names is not more informative
 * than "12 recettes", it is just longer to dismiss.
 */
export function describeRecipeUses(
  uses: { count: number; names: readonly string[] } | undefined,
): string | null {
  // Undefined is "not read yet", never "none". The query is enabled only for a
  // saved food, and a confirmation that silently claimed no recipe used it
  // would be wrong in the reassuring direction — the one direction this
  // project never allows.
  if (uses === undefined || uses.count === 0) return null;

  const subject =
    uses.names.length > 0 && uses.names.length <= NAMES_SHOWN
      ? uses.names.map((name) => `« ${name} »`).join(', ')
      : `${uses.count} ${uses.count === 1 ? 'recette' : 'recettes'}`;

  return uses.count === 1
    ? `${subject} garde ses chiffres, mais ne suivra plus vos corrections de cet aliment.`
    : `${subject} gardent leurs chiffres, mais ne suivront plus vos corrections de cet aliment.`;
}

/**
 * What a recipe makes: "4 portions" or "850 g".
 *
 * A weight yield is always grams — the note on YIELD_TYPES in the schema says
 * why — so there is no unit to carry alongside and none to get wrong.
 *
 * THE PLURAL IS NOT SPELLED HERE. It goes through formatPortionCount, which
 * the journal row and the basket already use, because a second pluralisation
 * rule is a second answer to one question: the first draft of this function
 * had one ("more than 1") beside portion-text's ("2 or more"), and they
 * disagree on exactly the values a half-portion produces.
 */
export function describeYield(recipeYield: RecipeYield): string {
  return recipeYield.type === 'weight'
    ? formatQuantity(recipeYield.value, 'g')
    : formatPortionCount(recipeYield.value, RECIPE_PORTION_NAME);
}

/**
 * What a grouped block's parent row says it was: "2 portions" or "250 g".
 *
 * Read back from the STORED columns rather than from the recipe, because a
 * journal entry is a closed capsule (D5/R1) and the recipe it came from is a
 * living object that may since have changed its yield — or been deleted.
 *
 * The two shapes are the two yields, as addEntries writes them: a weight yield
 * lands in base_unit and quantity, a portions yield in portion_name and
 * quantity. Null when the row is not a block, so the caller leaves the slot
 * out rather than rendering a gap.
 */
export function describeBlockQuantity(
  quantity: number | null,
  baseUnit: string | null,
  portionName: string | null,
): string | null {
  if (quantity === null) return null;
  if (baseUnit !== null) return formatQuantity(quantity, baseUnit);
  if (portionName !== null) return formatPortionCount(quantity, portionName);
  return null;
}

/**
 * What the figures beside a recipe are stated against: "par portion" or
 * "pour 100 g".
 *
 * The counterpart of the food library's "kcal / 100 g", and it exists for the
 * same reason: a calorie figure with no denominator beside it cannot be
 * compared with the row above, and a list that cannot be compared is not doing
 * the one thing a list is for.
 */
export function describeYieldUnit(recipeYield: RecipeYield): string {
  return recipeYield.type === 'portions' ? 'par portion' : 'pour 100 g';
}

/**
 * How much of a recipe is being eaten: "2 portions" or "250 g".
 *
 * Deliberately the same shape as describeYield, because the two are read
 * against each other — "2 portions" under a recipe that makes "4 portions" is
 * a fraction anyone can see, where two wordings of one unit would have to be
 * decoded instead.
 */
export function describeConsumed(recipeYield: RecipeYield, consumed: number): string {
  return describeYield({ type: recipeYield.type, value: consumed });
}
