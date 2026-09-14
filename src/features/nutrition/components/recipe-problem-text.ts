import type { RecipeDraft, RecipeProblem } from '../domain/recipe-draft';

/**
 * French wording for what is wrong with a recipe being edited (D10: no
 * internationalisation library).
 *
 * Kept apart from the domain for the reason food-problem-text.ts is: the rule
 * is a value, the sentence is presentation, and the rule has to be testable
 * without any of these words.
 *
 * Every message names the field rather than the code, and says what to do
 * rather than what happened — the reader is looking at the form, not at a log.
 */
export function recipeProblemText(problem: RecipeProblem, draft: RecipeDraft): string {
  switch (problem.code) {
    case 'name_empty':
      return 'Donnez un nom à cette recette.';

    case 'yield_invalid':
      return draft.yieldType === 'portions'
        ? 'Indiquez combien de portions cette recette donne.'
        : 'Indiquez le poids fini de cette recette, en grammes.';

    case 'prep_minutes_invalid':
      return 'Le temps de préparation ne peut pas être négatif.';

    case 'no_ingredients':
      return 'Ajoutez au moins un ingrédient : les macros d’une recette se calculent depuis eux.';

    case 'ingredient_quantity_invalid':
      return `Indiquez la quantité de ${draft.ingredients[problem.index]?.name ?? 'cet ingrédient'}.`;

    case 'ingredient_unlinked':
      return `${draft.ingredients[problem.index]?.name ?? 'Un ingrédient'} n’a plus ni aliment ni valeurs figées : retirez cette ligne.`;

    case 'tag_empty':
      return 'Un tag vide ne sert à rien : donnez-lui un mot ou retirez-le.';

    case 'tag_duplicated':
      return `Il y a deux fois « ${problem.tag} » : un tag ne se répète pas sur une recette.`;

    case 'step_empty':
      return `L’étape ${problem.index + 1} est vide : écrivez-la ou retirez-la.`;
  }
}
