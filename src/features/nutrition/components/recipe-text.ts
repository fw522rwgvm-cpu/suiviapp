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
