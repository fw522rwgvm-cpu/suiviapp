import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  recipe,
  recipeIngredient,
  type FoodId,
  type RecipeId,
  type RecipeIngredientId,
} from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import { createFood, deleteFood, updateFood } from '../../src/features/nutrition/data/food-writes';
import {
  countRecipesUsingFood,
  recipeNamesUsingFood,
} from '../../src/features/nutrition/data/recipe-reads';
import { describeRecipeUses } from '../../src/features/nutrition/components/recipe-text';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * D5/R3 — the freeze on deletion, against a real SQLite file (D15).
 *
 * > R3 — Le figeage à la suppression est atomique. Chaque ligne d'ingrédient
 * > porte en permanence des colonnes de gel vides et un lien vers l'aliment.
 * > La suppression d'un aliment remplit ces colonnes et rompt le lien dans une
 * > transaction unique.
 *
 * This is the file that keeps specs 5.3 and schema 2.2 from contradicting each
 * other. 2.2 declares recipe_ingredient.food_id with no ON DELETE clause — NO
 * ACTION, enforced immediately — while 5.3 says no deletion is ever blocked.
 * Both are true only for as long as deleteFood freezes first, so every
 * assertion here is really the same one: that it still does.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function chickpeas(overrides: Partial<FoodDraft> = {}): FoodDraft {
  return {
    ...emptyFoodDraft(),
    name: 'Pois chiches',
    baseUnit: 'g',
    refQty: 100,
    macros: { protein: 8.25, carbs: 47.5, fat: 3.125, kcal: 265.5 },
    ...overrides,
  };
}

/** A recipe with one ingredient, written straight through Drizzle. */
function recipeUsing(
  foodId: FoodId,
  options: { name?: string; quantity?: number; recipeId?: RecipeId } = {},
): RecipeId {
  const recipeId = options.recipeId ?? newId<RecipeId>();

  database.db
    .insert(recipe)
    .values({
      id: recipeId,
      name: options.name ?? 'Curry de pois chiches',
      prepMinutes: 45,
      yieldType: 'portions',
      yieldValue: 4,
      isFavorite: 0,
      createdAt: 1_789_000_000_000,
      updatedAt: 1_789_000_000_000,
    })
    .run();

  database.db
    .insert(recipeIngredient)
    .values({
      id: newId<RecipeIngredientId>(),
      recipeId,
      position: 0,
      foodId,
      quantity: options.quantity ?? 180,
      unit: 'g',
    })
    .run();

  return recipeId;
}

function ingredientRow(): Record<string, unknown> {
  return database.raw.prepare('SELECT * FROM recipe_ingredient').get() as Record<string, unknown>;
}

describe('deleting a food used as an ingredient', () => {
  it('is not blocked, where the raw DELETE would be', () => {
    // THE ASSERTION THE WHOLE SLICE TURNS ON.
    //
    // The bare statement is refused — see the second half — so a deleteFood
    // that ever stopped freezing would fail here rather than lose data
    // quietly. Specs 5.3 is satisfied by the freeze, not by softening the
    // constraint.
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId);

    expect(() => deleteFood(database.db, foodId)).not.toThrow();
    expect(countRows(database.raw, 'food')).toBe(0);

    // And the raw form, on an identical setup, is refused. Without this the
    // test above would pass just as well against ON DELETE SET NULL, or
    // against no foreign key at all.
    const secondId = createFood(database.db, chickpeas({ name: 'Lentilles' }));
    recipeUsing(secondId, { name: 'Dhal' });

    expect(() =>
      database.raw.prepare('DELETE FROM food WHERE id = ?').run(secondId),
    ).toThrow();
  });

  it('keeps the ingredient line, with its name and its macros', () => {
    // Specs 5.3: "la ligne d'ingrédient est conservée sous forme figée : nom
    // et macros gelés, plus de lien vers la base".
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId);

    deleteFood(database.db, foodId);

    const row = ingredientRow();
    expect(countRows(database.raw, 'recipe_ingredient')).toBe(1);
    expect(row['food_id']).toBeNull();
    expect(row['frozen_name']).toBe('Pois chiches');
    expect(row['frozen_base_unit']).toBe('g');
    expect(row['frozen_protein_100']).toBe(8.25);
    expect(row['frozen_carbs_100']).toBe(47.5);
    expect(row['frozen_fat_100']).toBe(3.125);
    expect(row['frozen_kcal_100']).toBe(265.5);
    expect(typeof row['frozen_at']).toBe('number');
    // The quantity is untouched: the freeze is about WHAT the ingredient is,
    // never about how much of it the recipe calls for.
    expect(row['quantity']).toBe(180);
  });

  it('freezes the food as it reads at that moment, not as it was created', () => {
    // The capsule must hold the LAST state of the food, because specs 8.5
    // makes correcting a food the main way its data is fixed. Freezing the
    // creation values would silently reinstate the error the user corrected —
    // on the one path where they would never look for it.
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId);

    updateFood(
      database.db,
      foodId,
      chickpeas({ name: 'Pois chiches cuits', macros: { protein: 9, carbs: 27, fat: 2.6, kcal: 164 } }),
    );
    deleteFood(database.db, foodId);

    const row = ingredientRow();
    expect(row['frozen_name']).toBe('Pois chiches cuits');
    expect(row['frozen_kcal_100']).toBe(164);
  });

  it('freezes every line of every recipe, not just the first', () => {
    // One UPDATE over all of them, so there is no half-frozen state to reach
    // even in principle. A loop would have made this assertion about luck.
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId, { name: 'Curry' });
    recipeUsing(foodId, { name: 'Salade' });
    recipeUsing(foodId, { name: 'Houmous' });

    deleteFood(database.db, foodId);

    const rows = database.raw
      .prepare('SELECT frozen_kcal_100, food_id FROM recipe_ingredient')
      .all() as { frozen_kcal_100: number | null; food_id: string | null }[];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.food_id === null)).toBe(true);
    expect(rows.every((row) => row.frozen_kcal_100 === 265.5)).toBe(true);
  });

  it('leaves the ingredients of other foods alone', () => {
    const chickpeaId = createFood(database.db, chickpeas());
    const riceId = createFood(database.db, chickpeas({ name: 'Riz' }));
    const recipeId = newId<RecipeId>();
    recipeUsing(chickpeaId, { recipeId });
    database.db
      .insert(recipeIngredient)
      .values({
        id: newId<RecipeIngredientId>(),
        recipeId,
        position: 1,
        foodId: riceId,
        quantity: 60,
        unit: 'g',
      })
      .run();

    deleteFood(database.db, chickpeaId);

    const rows = database.raw
      .prepare('SELECT food_id, frozen_name FROM recipe_ingredient ORDER BY position')
      .all() as { food_id: string | null; frozen_name: string | null }[];

    expect(rows[0]?.food_id).toBeNull();
    expect(rows[0]?.frozen_name).toBe('Pois chiches');
    // Still live, still empty: the freeze columns are empty for the whole
    // normal life of a row.
    expect(rows[1]?.food_id).toBe(riceId);
    expect(rows[1]?.frozen_name).toBeNull();
  });

  it('rolls back entirely if the deletion cannot go through', () => {
    // The atomicity R3 actually asks for, exercised rather than asserted from
    // the shape of the code: if the DELETE fails, the freeze must not survive
    // it. Otherwise a recipe would lose its live link to a food that is still
    // in the library — a silent half-deletion.
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId);

    // A trigger is the only way to make the second statement fail without
    // touching the code under test.
    database.raw
      .prepare(
        `CREATE TRIGGER refuse_food_delete BEFORE DELETE ON food
         BEGIN SELECT RAISE(ABORT, 'nope'); END`,
      )
      .run();

    expect(() => deleteFood(database.db, foodId)).toThrow();

    const row = ingredientRow();
    expect(row['food_id']).toBe(foodId);
    expect(row['frozen_name']).toBeNull();
    expect(row['frozen_at']).toBeNull();
    expect(countRows(database.raw, 'food')).toBe(1);
  });

  it('deletes a food no recipe uses, as it always did', () => {
    const foodId = createFood(database.db, chickpeas());

    expect(() => deleteFood(database.db, foodId)).not.toThrow();
    expect(countRows(database.raw, 'food')).toBe(0);
  });

  it('does not throw on a food that is already gone', () => {
    // Deleting twice is not an error: the second caller is simply late, and
    // there is nothing to freeze against. Writing a capsule of nulls here
    // would violate ck_ingredient_link, correctly.
    const foodId = createFood(database.db, chickpeas());
    deleteFood(database.db, foodId);

    expect(() => deleteFood(database.db, foodId)).not.toThrow();
  });
});

describe('what the confirmation is allowed to say', () => {
  it('counts recipes, not ingredient lines', () => {
    // One recipe using a food twice is one recipe. "3 lignes d'ingrédient" is
    // an implementation detail that happens to be a bigger number.
    const foodId = createFood(database.db, chickpeas());
    const recipeId = newId<RecipeId>();
    recipeUsing(foodId, { recipeId, name: 'Curry' });
    database.db
      .insert(recipeIngredient)
      .values({
        id: newId<RecipeIngredientId>(),
        recipeId,
        position: 1,
        foodId,
        quantity: 30,
        unit: 'g',
      })
      .run();

    expect(countRecipesUsingFood(database.db, foodId)).toBe(1);
    expect(recipeNamesUsingFood(database.db, foodId)).toEqual(['Curry']);
  });

  it('stops counting a recipe once its link is frozen', () => {
    const foodId = createFood(database.db, chickpeas());
    recipeUsing(foodId);
    expect(countRecipesUsingFood(database.db, foodId)).toBe(1);

    deleteFood(database.db, foodId);

    expect(countRecipesUsingFood(database.db, foodId)).toBe(0);
  });

  it('says nothing at all when no recipe uses the food', () => {
    expect(describeRecipeUses({ count: 0, names: [] })).toBeNull();
  });

  it('says nothing while the answer is still unknown', () => {
    // Undefined is "not read yet", never "none". A confirmation that claimed
    // no recipe used the food because the query had not answered would be
    // wrong in the reassuring direction.
    expect(describeRecipeUses(undefined)).toBeNull();
  });

  it('names the recipes while there are few enough to read', () => {
    const text = describeRecipeUses({ count: 2, names: ['Curry', 'Dhal'] });

    expect(text).toContain('« Curry »');
    expect(text).toContain('« Dhal »');
    // It never claims anything is lost, because nothing is.
    expect(text).not.toContain('perd');
    expect(text).toContain('gardent leurs chiffres');
  });

  it('falls back to a count past a handful', () => {
    const many = ['A', 'B', 'C', 'D', 'E'];
    const text = describeRecipeUses({ count: many.length, names: many });

    expect(text).toContain('5 recettes');
    expect(text).not.toContain('« A »');
  });

  it('agrees in the singular', () => {
    const text = describeRecipeUses({ count: 1, names: ['Curry'] });

    expect(text).toContain('garde ses chiffres');
    expect(text).not.toContain('gardent');
  });
});
