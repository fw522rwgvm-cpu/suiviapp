import type { FoodDraft, FoodProblem } from '../domain/food-draft';

/**
 * French wording for what is wrong with a food being edited (D10: no
 * internationalisation library).
 *
 * Kept apart from the domain for the same reason the backup feature keeps
 * problem-text.ts apart from its validator: the rule is a value, the sentence
 * is presentation, and the rule has to be testable without any of these words.
 *
 * Every message names the field rather than the code, and says what to do
 * rather than what happened — the reader is looking at the form, not at a log.
 */
export function foodProblemText(problem: FoodProblem, draft: FoodDraft): string {
  switch (problem.code) {
    case 'name_empty':
      return 'Donnez un nom à cet aliment.';

    case 'ref_qty_invalid':
      return `La quantité de référence doit être supérieure à zéro (${draft.baseUnit}).`;

    case 'macro_negative':
      return `${macroLabel(problem.macro)} ne peut pas être négatif.`;

    case 'portion_name_unknown':
      return `« ${problem.name} » n’est pas un nom de portion connu.`;

    case 'portion_name_duplicated':
      return `Il y a deux fois « ${problem.name} » : un nom de portion est unique par aliment.`;

    case 'portion_quantity_invalid':
      return `Indiquez combien de ${draft.baseUnit} fait une ${draft.portions[problem.index]?.name ?? 'portion'}.`;
  }
}

function macroLabel(macro: 'protein' | 'carbs' | 'fat' | 'kcal'): string {
  switch (macro) {
    case 'protein':
      return 'Les protéines';
    case 'carbs':
      return 'Les glucides';
    case 'fat':
      return 'Les lipides';
    case 'kcal':
      return 'Les calories';
  }
}
