import type {
  BaseUnit,
  FoodId,
  RecipeIngredientId,
  RecipeStepId,
  YieldType,
} from '@/core/db/schema';
import type { Macros } from './macros';

/**
 * A recipe being created or edited, and what makes it valid (specs 8.6).
 *
 * Pure: it knows neither the database nor React. The editor holds one of these
 * in state, this module says what is wrong with it, and recipe-writes.ts turns
 * a valid one into rows — the same three-part shape food-draft.ts already has.
 *
 * PROBLEMS ARE VALUES, NEVER EXCEPTIONS (conventions section 4), and every
 * problem is collected rather than stopping at the first: fixing a form one
 * error per attempt is a path you walk once, badly.
 */

/**
 * One ingredient line in the editor.
 *
 * ## WHY A DRAFT LINE CARRIES ITS FROZEN CAPSULE
 *
 * recipe-writes replaces ingredients wholesale — deleted and reinserted, for
 * the reason replacePortions does it: nothing in the schema references an
 * ingredient row, and reconciling row by row buys identifiers nobody reads.
 *
 * But a frozen line has values that exist NOWHERE ELSE. Its food is gone: if
 * the draft did not carry the capsule, opening a recipe and saving it again
 * would delete the only copy of a deleted food's macros, and the recipe's
 * total would change for no reason the user could see. So a frozen line
 * carries its capsule through the editor untouched, and the write puts it
 * back.
 *
 * `foodId` and `frozen` are exclusive, which ck_ingredient_link also enforces
 * in SQL. Exactly one is set.
 */
export interface IngredientDraft {
  /** Null for a line being added. Set for one already stored, and unused. */
  id: RecipeIngredientId | null;
  /** Null once the food has been deleted (D5/R3). */
  foodId: FoodId | null;
  /** The name shown in the editor, live or frozen. Never written as such. */
  name: string;
  /** Always in base units. Never a count of portions. */
  quantity: number;
  unit: BaseUnit;
  /**
   * The capsule, for a line whose food is gone. Null while the link lives.
   *
   * Carried through the editor so that saving cannot destroy it — see above.
   */
  frozen: { baseUnit: BaseUnit; reference: Macros; at: number | null } | null;
}

export interface StepDraft {
  id: RecipeStepId | null;
  text: string;
}

export interface RecipeDraft {
  name: string;
  prepMinutes: number | null;
  yieldType: YieldType;
  yieldValue: number;
  isFavorite: boolean;
  tags: string[];
  steps: StepDraft[];
  ingredients: IngredientDraft[];
}

export type RecipeProblem =
  | { code: 'name_empty' }
  | { code: 'yield_invalid'; found: number }
  | { code: 'prep_minutes_invalid'; found: number }
  | { code: 'no_ingredients' }
  | { code: 'ingredient_quantity_invalid'; index: number; found: number }
  | { code: 'ingredient_unlinked'; index: number }
  | { code: 'tag_empty'; index: number }
  | { code: 'tag_duplicated'; index: number; tag: string }
  | { code: 'step_empty'; index: number };

export function validateRecipeDraft(draft: RecipeDraft): RecipeProblem[] {
  const problems: RecipeProblem[] = [];

  if (draft.name.trim() === '') {
    problems.push({ code: 'name_empty' });
  }

  /**
   * The guard ck_recipe_yield_value carries in SQL, applied here so that the
   * message is a sentence beside the field rather than a failed write citing a
   * constraint. Both exist, and the reason is the one slice 3 settled: the
   * CHECK is the barrier that cannot be forgotten, the validator is the one
   * that can explain itself.
   *
   * Zero is the case that matters. Every derived macro would be Infinity, and
   * an Infinity does not stop at the screen — logging the recipe would freeze
   * it into a column the exporter throws on.
   */
  if (!Number.isFinite(draft.yieldValue) || draft.yieldValue <= 0) {
    problems.push({ code: 'yield_invalid', found: draft.yieldValue });
  }

  // Null is legitimate — schema 2.2 makes prep_minutes nullable, and a recipe
  // with no stated time is a recipe. A negative one is not.
  if (
    draft.prepMinutes !== null &&
    (!Number.isFinite(draft.prepMinutes) || draft.prepMinutes < 0)
  ) {
    problems.push({ code: 'prep_minutes_invalid', found: draft.prepMinutes });
  }

  /**
   * A recipe with no ingredients has no macros, and specs 8.6 says its macros
   * are always computed from its ingredients. Saving one would produce a
   * library row worth nought calories that looks like a measurement rather
   * than an absence — and logging it would write a grouped parent with no
   * children, which is a block that cannot be opened.
   */
  if (draft.ingredients.length === 0) {
    problems.push({ code: 'no_ingredients' });
  }

  draft.ingredients.forEach((ingredient, index) => {
    if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
      problems.push({
        code: 'ingredient_quantity_invalid',
        index,
        found: ingredient.quantity,
      });
    }

    // Neither linked nor frozen: the row ck_ingredient_link refuses. Caught
    // here so the editor can say which line rather than rolling back a save.
    if (ingredient.foodId === null && ingredient.frozen === null) {
      problems.push({ code: 'ingredient_unlinked', index });
    }
  });

  const seen = new Set<string>();
  draft.tags.forEach((tag, index) => {
    const trimmed = tag.trim();
    if (trimmed === '') {
      problems.push({ code: 'tag_empty', index });
      return;
    }
    // The composite primary key refuses a repeat, and it would refuse it with
    // a constraint name from inside a transaction. Said here instead.
    if (seen.has(trimmed)) {
      problems.push({ code: 'tag_duplicated', index, tag: trimmed });
    }
    seen.add(trimmed);
  });

  draft.steps.forEach((step, index) => {
    // recipe_step.text is NOT NULL, and an empty step is not a step — it is a
    // row the user would have to delete to make the list readable.
    if (step.text.trim() === '') {
      problems.push({ code: 'step_empty', index });
    }
  });

  return problems;
}

export function isValidRecipeDraft(draft: RecipeDraft): boolean {
  return validateRecipeDraft(draft).length === 0;
}

/**
 * An empty draft, for the "new recipe" screen.
 *
 * Four portions rather than one: a recipe worth making is a recipe worth
 * making more than one serving of, and a yield of one is the value that makes
 * the portion arithmetic invisible — which is exactly when a wrong default
 * goes unnoticed.
 */
export function emptyRecipeDraft(): RecipeDraft {
  return {
    name: '',
    prepMinutes: null,
    yieldType: 'portions',
    yieldValue: 4,
    isFavorite: false,
    tags: [],
    steps: [],
    ingredients: [],
  };
}
