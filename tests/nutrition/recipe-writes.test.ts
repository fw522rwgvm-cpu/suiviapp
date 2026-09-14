import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FoodId, RecipeId } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import { createFood, deleteFood } from '../../src/features/nutrition/data/food-writes';
import {
  listRecipeTags,
  listRecipes,
  readRecipe,
  readRecipeDraft,
} from '../../src/features/nutrition/data/recipe-reads';
import {
  createRecipe,
  deleteRecipe,
  setRecipeFavorite,
  updateRecipe,
} from '../../src/features/nutrition/data/recipe-writes';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import {
  emptyRecipeDraft,
  validateRecipeDraft,
  type IngredientDraft,
  type RecipeDraft,
} from '../../src/features/nutrition/domain/recipe-draft';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The recipe write layer, against a real SQLite file (D15).
 *
 * The invariants worth the file are the ones no type can hold: that editing a
 * recipe cannot destroy a frozen capsule, that a unit can never disagree with
 * its food's, and that tags and steps survive being rewritten wholesale.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function foodDraft(overrides: Partial<FoodDraft> = {}): FoodDraft {
  return {
    ...emptyFoodDraft(),
    name: 'Pois chiches',
    baseUnit: 'g',
    refQty: 100,
    macros: { protein: 8.25, carbs: 47.5, fat: 3.125, kcal: 265.5 },
    ...overrides,
  };
}

function ingredient(foodId: FoodId, quantity = 180): IngredientDraft {
  return { id: null, foodId, name: 'Pois chiches', quantity, unit: 'g', frozen: null };
}

function draftWith(foodId: FoodId, overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    ...emptyRecipeDraft(),
    name: 'Curry de pois chiches',
    prepMinutes: 45,
    ingredients: [ingredient(foodId)],
    ...overrides,
  };
}

describe('creating a recipe', () => {
  it('stores no macro column at all', () => {
    // Specs 8.6: "macros toujours calculées depuis les ingrédients". The
    // strongest form of D9 in this schema — there is no column to drift.
    const foodId = createFood(database.db, foodDraft());
    createRecipe(database.db, draftWith(foodId));

    const columns = database.raw.prepare('PRAGMA table_info(recipe)').all() as {
      name: string;
    }[];

    expect(columns.map((column) => column.name)).not.toContain('protein_100');
    expect(columns.map((column) => column.name)).not.toContain('kcal_100');
  });

  it('keeps the ingredients in the order the editor listed them', () => {
    // Position comes from the order of the list, never from the draft: the
    // editor reorders by moving rows, and a position carried on the line would
    // be a second source for the same fact.
    const first = createFood(database.db, foodDraft({ name: 'A' }));
    const second = createFood(database.db, foodDraft({ name: 'B' }));

    const recipeId = createRecipe(
      database.db,
      draftWith(first, { ingredients: [ingredient(second), ingredient(first)] }),
    );

    expect(readRecipe(database.db, recipeId)?.ingredients.map((line) => line.name)).toEqual([
      'B',
      'A',
    ]);
  });

  it('refuses a draft the validator rejects', () => {
    const foodId = createFood(database.db, foodDraft());

    expect(() =>
      createRecipe(database.db, draftWith(foodId, { name: '   ' })),
    ).toThrow();
    expect(() =>
      createRecipe(database.db, draftWith(foodId, { yieldValue: 0 })),
    ).toThrow();
    expect(() => createRecipe(database.db, draftWith(foodId, { ingredients: [] }))).toThrow();
    expect(countRows(database.raw, 'recipe')).toBe(0);
  });

  it('refuses an ingredient whose unit disagrees with its food', () => {
    // THE RULE NO CONSTRAINT CAN CARRY. ck_ingredient_unit keeps the column to
    // g and ml; it cannot see the food. Millilitres against per-100-gram
    // macros is a number that is wrong and entirely plausible.
    const foodId = createFood(database.db, foodDraft({ baseUnit: 'g' }));

    expect(() =>
      createRecipe(database.db, {
        ...draftWith(foodId),
        ingredients: [{ ...ingredient(foodId), unit: 'ml' }],
      }),
    ).toThrow();
    // Rolled back whole: no half-written recipe left behind.
    expect(countRows(database.raw, 'recipe')).toBe(0);
    expect(countRows(database.raw, 'recipe_ingredient')).toBe(0);
  });

  it('writes tags and steps, and lists the tags once each', () => {
    const foodId = createFood(database.db, foodDraft());
    createRecipe(
      database.db,
      draftWith(foodId, {
        tags: ['végétarien', 'batch cooking'],
        steps: [{ id: null, text: 'Faire revenir.' }, { id: null, text: 'Mijoter.' }],
      }),
    );
    createRecipe(
      database.db,
      draftWith(foodId, { name: 'Autre', tags: ['végétarien'] }),
    );

    expect(listRecipeTags(database.db)).toEqual(['batch cooking', 'végétarien']);
    expect(countRows(database.raw, 'recipe_step')).toBe(2);
  });
});

describe('editing a recipe', () => {
  it('does not destroy a frozen capsule', () => {
    // THE ASSERTION THE WHOLE DRAFT SHAPE EXISTS FOR.
    //
    // Ingredients are replaced wholesale on save. A frozen line's values exist
    // nowhere else — its food is gone — so if the draft did not carry the
    // capsule, opening a recipe and saving it unchanged would delete the only
    // copy of a deleted food's macros and move the recipe's total for no
    // reason the user could see.
    const keptId = createFood(database.db, foodDraft({ name: 'Gardé' }));
    const doomedId = createFood(
      database.db,
      foodDraft({ name: 'Crème de coco', macros: { protein: 2, carbs: 3, fat: 20, kcal: 200 } }),
    );

    const recipeId = createRecipe(
      database.db,
      draftWith(keptId, { ingredients: [ingredient(keptId), ingredient(doomedId, 100)] }),
    );
    deleteFood(database.db, doomedId);

    const before = readRecipe(database.db, recipeId)?.total.kcal;
    const draft = readRecipeDraft(database.db, recipeId);
    expect(draft).not.toBeNull();
    if (draft === null) return;

    // Saved back UNCHANGED, which is the case that would silently lose data.
    updateRecipe(database.db, recipeId, draft);

    const after = readRecipe(database.db, recipeId);
    expect(after?.total.kcal).toBe(before);
    expect(after?.ingredients[1]?.name).toBe('Crème de coco');
    expect(after?.ingredients[1]?.frozen).toBe(true);
    expect(after?.ingredients[1]?.reference.kcal).toBe(200);
  });

  it('keeps frozen_at as the moment of the freeze, not of the save', () => {
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(database.db, draftWith(foodId));
    deleteFood(database.db, foodId);

    const frozenAt = (
      database.raw.prepare('SELECT frozen_at FROM recipe_ingredient').get() as {
        frozen_at: number;
      }
    ).frozen_at;

    const draft = readRecipeDraft(database.db, recipeId);
    if (draft === null) throw new Error('no draft');
    updateRecipe(database.db, recipeId, draft);

    const after = (
      database.raw.prepare('SELECT frozen_at FROM recipe_ingredient').get() as {
        frozen_at: number;
      }
    ).frozen_at;

    expect(after).toBe(frozenAt);
  });

  it('swaps two tags in one edit without colliding', () => {
    // The primary key IS (recipe_id, tag), so a row-by-row rename collides on
    // whichever it writes first — the trap ux_portion_food_name set for
    // portions, one table along. Wholesale replacement removes the case.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(
      database.db,
      draftWith(foodId, { tags: ['rapide', 'végétarien'] }),
    );

    const draft = readRecipeDraft(database.db, recipeId);
    if (draft === null) throw new Error('no draft');

    expect(() =>
      updateRecipe(database.db, recipeId, { ...draft, tags: ['végétarien', 'rapide'] }),
    ).not.toThrow();
    expect(readRecipe(database.db, recipeId)?.tags).toEqual(['rapide', 'végétarien']);
  });

  it('does not write the favourite flag back', () => {
    // Same rule as a food (specs 8.5 v2.3): the star acts immediately, from
    // the list and from the recipe, so a form loaded a minute earlier must not
    // undo a tap nobody thought of as an edit.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(database.db, draftWith(foodId, { isFavorite: false }));

    const draft = readRecipeDraft(database.db, recipeId);
    if (draft === null) throw new Error('no draft');

    setRecipeFavorite(database.db, recipeId, true);
    updateRecipe(database.db, recipeId, draft);

    expect(readRecipe(database.db, recipeId)?.isFavorite).toBe(true);
  });

  it('leaves journal entries alone', () => {
    // Specs 8.6 point 3 read the other way: an occurrence never modifies the
    // recipe, and the recipe never modifies an occurrence. Nothing in this
    // layer touches journal_entry at all, which is the structural form of it.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(database.db, draftWith(foodId));

    const draft = readRecipeDraft(database.db, recipeId);
    if (draft === null) throw new Error('no draft');
    updateRecipe(database.db, recipeId, { ...draft, name: 'Renommée' });

    expect(countRows(database.raw, 'journal_entry')).toBe(0);
  });

  it('throws on a recipe that is not there', () => {
    const foodId = createFood(database.db, foodDraft());
    const draft = draftWith(foodId);

    expect(() => updateRecipe(database.db, newId<RecipeId>(), draft)).toThrow();
  });
});

describe('deleting a recipe', () => {
  it('takes its ingredients, steps and tags, and nothing else', () => {
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(
      database.db,
      draftWith(foodId, {
        tags: ['rapide'],
        steps: [{ id: null, text: 'Mijoter.' }],
      }),
    );

    deleteRecipe(database.db, recipeId);

    expect(countRows(database.raw, 'recipe')).toBe(0);
    expect(countRows(database.raw, 'recipe_ingredient')).toBe(0);
    expect(countRows(database.raw, 'recipe_step')).toBe(0);
    expect(countRows(database.raw, 'recipe_tag')).toBe(0);
    // A recipe owns its ingredient LINES, never the foods they point at.
    expect(countRows(database.raw, 'food')).toBe(1);
  });

  it('is never blocked, and needs no freeze of its own', () => {
    // Unlike a food. A grouped block in the journal carries its macros on its
    // CHILDREN (D5/R2), each of which froze a food's reference when it was
    // logged, so there is nothing about a recipe an entry still needs.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(database.db, draftWith(foodId));

    expect(() => deleteRecipe(database.db, recipeId)).not.toThrow();
  });
});

describe('what the draft validator refuses', () => {
  it('collects every problem rather than stopping at the first', () => {
    const problems = validateRecipeDraft({
      ...emptyRecipeDraft(),
      name: '',
      yieldValue: 0,
      prepMinutes: -5,
      tags: ['a', 'a', '  '],
      steps: [{ id: null, text: '   ' }],
    });

    const codes = problems.map((problem) => problem.code);
    expect(codes).toContain('name_empty');
    expect(codes).toContain('yield_invalid');
    expect(codes).toContain('prep_minutes_invalid');
    expect(codes).toContain('no_ingredients');
    expect(codes).toContain('tag_duplicated');
    expect(codes).toContain('tag_empty');
    expect(codes).toContain('step_empty');
  });

  it('accepts a recipe with no steps, no tags and no preparation time', () => {
    // Schema 2.2 makes prep_minutes nullable, and specs 8.6 lists steps and
    // tags without requiring them. A recipe is its ingredients and its yield.
    const foodId = createFood(database.db, foodDraft());

    expect(
      validateRecipeDraft({
        ...emptyRecipeDraft(),
        name: 'Minimale',
        prepMinutes: null,
        ingredients: [ingredient(foodId)],
      }),
    ).toEqual([]);
  });

  it('names the line that is neither linked nor frozen', () => {
    const problems = validateRecipeDraft({
      ...emptyRecipeDraft(),
      name: 'Cassée',
      ingredients: [
        { id: null, foodId: null, name: 'Fantôme', quantity: 100, unit: 'g', frozen: null },
      ],
    });

    expect(problems).toContainEqual({ code: 'ingredient_unlinked', index: 0 });
  });
});

describe('the library list', () => {
  it('sorts case-insensitively, so lower case does not follow every capital', () => {
    const foodId = createFood(database.db, foodDraft());
    createRecipe(database.db, draftWith(foodId, { name: 'Zucchini' }));
    createRecipe(database.db, draftWith(foodId, { name: 'abricot' }));

    expect(listRecipes(database.db).map((item) => item.name)).toEqual(['abricot', 'Zucchini']);
  });
});
