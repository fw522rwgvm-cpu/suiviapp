import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FoodId, RecipeId } from '../../src/core/db/schema';
import { createRandom } from '../../src/dev/seed/random';
import { createFood, deleteFood } from '../../src/features/nutrition/data/food-writes';
import { listRecipes, readRecipe } from '../../src/features/nutrition/data/recipe-reads';
import { createRecipe } from '../../src/features/nutrition/data/recipe-writes';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import {
  emptyRecipeDraft,
  type IngredientDraft,
  type RecipeDraft,
} from '../../src/features/nutrition/domain/recipe-draft';
import {
  consumedFraction,
  ingredientView,
  macrosPerYieldUnit,
  recipeTotal,
  scaleMacros,
} from '../../src/features/nutrition/domain/recipe-macros';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Recipe arithmetic (D9, specs 8.6) — and the test that keeps its two halves
 * honest.
 *
 * A recipe stores no macros, so its total is computed twice by construction:
 * in SQL for the library list, where a read per recipe would be unaffordable,
 * and in TypeScript for the screen showing one recipe, which already holds
 * every ingredient. Both are correct designs and neither can be removed.
 *
 * WHICH MEANS THE ONLY THING KEEPING THEM EQUAL IS THIS FILE. They would agree
 * on every example anyone thought to write by hand; a generated library is
 * what makes a disagreement surface.
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
    name: 'Aliment',
    baseUnit: 'g',
    refQty: 100,
    macros: { protein: 10, carbs: 20, fat: 5, kcal: 165 },
    ...overrides,
  };
}

function ingredient(foodId: FoodId, quantity: number): IngredientDraft {
  return { id: null, foodId, name: 'Aliment', quantity, unit: 'g', frozen: null };
}

function recipeDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return { ...emptyRecipeDraft(), name: 'Recette', ...overrides };
}

describe('the fraction of a recipe being eaten', () => {
  it('is the same formula for both yield types', () => {
    // THE FINDING WORTH PINNING. Two portions of four and 250 g of 850 g are
    // both `consumed / yieldValue`; the yield type changes only the unit
    // written on the wheel. The obvious implementation is a switch with two
    // identical branches, and the second branch is where a difference would
    // eventually get introduced.
    expect(consumedFraction({ type: 'portions', value: 4 }, 2)).toBe(0.5);
    expect(consumedFraction({ type: 'weight', value: 4 }, 2)).toBe(0.5);

    expect(consumedFraction({ type: 'portions', value: 850 }, 250)).toBeCloseTo(250 / 850, 12);
    expect(consumedFraction({ type: 'weight', value: 850 }, 250)).toBeCloseTo(250 / 850, 12);
  });

  it('handles a fractional serving', () => {
    expect(consumedFraction({ type: 'portions', value: 4 }, 1.5)).toBe(0.375);
  });

  it('throws on a yield of zero rather than returning Infinity or nought', () => {
    // ck_recipe_yield_value makes this unreachable for a stored recipe, so
    // arriving here with one is a programming error. Returning zero would be
    // worse than throwing: an ingredient that silently contributes nothing is
    // the plausible-and-wrong class, and an Infinity would reach
    // journal_entry.quantity and break the export a week later.
    expect(() => consumedFraction({ type: 'portions', value: 0 }, 1)).toThrow();
    expect(() => consumedFraction({ type: 'weight', value: -3 }, 1)).toThrow();
    expect(() => macrosPerYieldUnit({ protein: 1, carbs: 1, fat: 1, kcal: 1 }, { type: 'portions', value: 0 })).toThrow();
  });
});

describe('what one yield unit is worth', () => {
  const total = { protein: 40, carbs: 200, fat: 20, kcal: 1140 };

  it('divides by the serving count for a yield in portions', () => {
    expect(macrosPerYieldUnit(total, { type: 'portions', value: 4 })).toEqual({
      protein: 10,
      carbs: 50,
      fat: 5,
      kcal: 285,
    });
  });

  it('states a weight yield per 100 g, the canonical form', () => {
    // Per gram is not a figure anyone reads, and 100 base units is how every
    // other macro in this schema is expressed.
    const perHundred = macrosPerYieldUnit(total, { type: 'weight', value: 1000 });

    expect(perHundred.protein).toBeCloseTo(4, 12);
    expect(perHundred.kcal).toBeCloseTo(114, 12);
  });

  it('is not the same thing as totalOf', () => {
    // scaleMacros takes a factor; totalOf takes a quantity against a canonical
    // reference and divides by 100. Passing one to the other is a mistake that
    // produces a number a hundredth of the right size — which, unlike a
    // hundred times, does not look obviously wrong.
    expect(scaleMacros(total, 2).kcal).toBe(2280);
  });
});

describe('an ingredient whose food is gone', () => {
  it('reads from its capsule and still contributes', () => {
    const view = ingredientView({
      foodId: null,
      quantity: 200,
      unit: 'g',
      liveName: null,
      liveBaseUnit: null,
      liveReference: null,
      frozenName: 'Crème de coco',
      frozenBaseUnit: 'ml',
      frozenReference: { protein: 2, carbs: 3, fat: 20, kcal: 200 },
    });

    expect(view?.name).toBe('Crème de coco');
    expect(view?.frozen).toBe(true);
    expect(view?.total.kcal).toBe(400);
  });

  it('prefers the live values while the link is intact', () => {
    // Specs 5.3: a recipe follows a food's edits. The frozen columns are empty
    // for the whole normal life of a row, so the two are never both set — but
    // stating the order makes a later "optimisation" that reads the capsule
    // first a visible change rather than a silent one.
    const view = ingredientView({
      foodId: 'f1',
      quantity: 100,
      unit: 'g',
      liveName: 'Vivant',
      liveBaseUnit: 'g',
      liveReference: { protein: 1, carbs: 1, fat: 1, kcal: 100 },
      frozenName: 'Gelé',
      frozenBaseUnit: 'g',
      frozenReference: { protein: 9, carbs: 9, fat: 9, kcal: 900 },
    });

    expect(view?.name).toBe('Vivant');
    expect(view?.frozen).toBe(false);
    expect(view?.total.kcal).toBe(100);
  });

  it('is null when it has neither, rather than nought', () => {
    // ck_ingredient_link refuses this row in the database. The domain agrees
    // with SUM about it — both skip it — so the two implementations match even
    // on the case neither should ever see.
    expect(
      ingredientView({
        foodId: null,
        quantity: 100,
        unit: 'g',
        liveName: null,
        liveBaseUnit: null,
        liveReference: null,
        frozenName: null,
        frozenBaseUnit: null,
        frozenReference: null,
      }),
    ).toBeNull();
  });
});

describe('the SQL sum and the TypeScript sum agree', () => {
  it('over a generated library, recipe by recipe', () => {
    // THE ASSERTION THIS FILE EXISTS FOR.
    //
    // Not a handful of round numbers: awkward quantities and awkward macros,
    // several ingredients each, some of them frozen, so that the COALESCE in
    // SQL and the live-or-capsule rule in TypeScript are both exercised on the
    // same rows. A mutation to either ordering, join or fallback shows up here
    // and nowhere else.
    const random = createRandom(11);
    const foodIds: FoodId[] = [];

    for (let index = 0; index < 12; index += 1) {
      foodIds.push(
        createFood(
          database.db,
          foodDraft({
            name: `Aliment ${index}`,
            macros: {
              protein: random.between(0, 400) / 10,
              carbs: random.between(0, 900) / 10,
              fat: random.between(0, 300) / 10,
              kcal: random.between(0, 6000) / 10,
            },
          }),
        ),
      );
    }

    const recipeIds: RecipeId[] = [];
    for (let index = 0; index < 20; index += 1) {
      const ingredients: IngredientDraft[] = [];
      const count = random.between(1, 6);
      const used = new Set<FoodId>();

      for (let line = 0; line < count; line += 1) {
        const foodId = random.pick(foodIds);
        used.add(foodId);
        ingredients.push(ingredient(foodId, random.between(1, 5000) / 4));
      }

      recipeIds.push(
        createRecipe(
          database.db,
          recipeDraft({
            name: `Recette ${index}`,
            yieldType: random.chance(0.5) ? 'portions' : 'weight',
            yieldValue: random.between(1, 40) / 2,
            ingredients,
          }),
        ),
      );
    }

    // Three foods deleted, which freezes every line that used them — so a
    // third of the library is now reading capsules rather than links.
    for (const foodId of foodIds.slice(0, 3)) {
      deleteFood(database.db, foodId);
    }

    const listed = new Map(listRecipes(database.db).map((item) => [item.id, item]));
    expect(listed.size).toBe(recipeIds.length);

    for (const recipeId of recipeIds) {
      const fromList = listed.get(recipeId);
      const fromScreen = readRecipe(database.db, recipeId);

      expect(fromScreen).not.toBeNull();
      if (fromScreen === null || fromList === undefined) continue;

      // The domain function, the screen's own figure, and the SQL sum: three
      // spellings that must be one number.
      const fromDomain = recipeTotal(fromScreen.ingredients);

      for (const macro of ['protein', 'carbs', 'fat', 'kcal'] as const) {
        expect(fromScreen.total[macro]).toBeCloseTo(fromList.total[macro], 9);
        expect(fromDomain[macro]).toBeCloseTo(fromList.total[macro], 9);
      }
    }
  });

  it('counts a recipe with no ingredients as zero rather than dropping it', () => {
    // The LEFT JOIN. The editor refuses to save one, but an imported archive
    // could carry one, and a library that silently omitted it would be a
    // library the user could not use to find and fix it.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(
      database.db,
      recipeDraft({ ingredients: [ingredient(foodId, 100)] }),
    );

    database.raw.prepare('DELETE FROM recipe_ingredient').run();

    const listed = listRecipes(database.db);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(recipeId);
    expect(listed[0]?.total.kcal).toBe(0);
    expect(listed[0]?.ingredientCount).toBe(0);
  });

  it('keeps a frozen ingredient in the total, where an inner join would drop it', () => {
    const keptId = createFood(database.db, foodDraft({ name: 'Gardé' }));
    const doomedId = createFood(
      database.db,
      foodDraft({ name: 'Supprimé', macros: { protein: 0, carbs: 0, fat: 0, kcal: 500 } }),
    );

    const recipeId = createRecipe(
      database.db,
      recipeDraft({ ingredients: [ingredient(keptId, 100), ingredient(doomedId, 100)] }),
    );
    const before = listRecipes(database.db)[0]?.total.kcal;

    deleteFood(database.db, doomedId);

    const after = listRecipes(database.db).find((item) => item.id === recipeId);
    // Specs 5.3: the line is kept, frozen. The total must not move by a bit.
    expect(after?.total.kcal).toBe(before);
    expect(after?.hasFrozenIngredient).toBe(true);
    expect(after?.ingredientCount).toBe(2);
  });
});

describe('a recipe is a living object (specs 5.3)', () => {
  it('follows an edit to one of its foods', () => {
    // > Modifier un aliment met bien à jour les recettes qui l'utilisent : une
    // > recette est un objet vivant, pas de l'historique.
    //
    // No code implements this. It is a property of NOT STORING the total, and
    // this is the assertion that would notice if anyone ever started.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(
      database.db,
      recipeDraft({ ingredients: [ingredient(foodId, 200)] }),
    );

    expect(readRecipe(database.db, recipeId)?.total.kcal).toBe(330);

    database.raw.prepare('UPDATE food SET kcal_100 = 200 WHERE id = ?').run(foodId);

    expect(readRecipe(database.db, recipeId)?.total.kcal).toBe(400);
    expect(listRecipes(database.db)[0]?.total.kcal).toBe(400);
  });

  it('stops following once the food is deleted', () => {
    // The other half of the same sentence: only the deletion freezes. After
    // it, a correction to a food of the same name would not reach this recipe
    // — which is exactly what the deletion warning tells the user.
    const foodId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(
      database.db,
      recipeDraft({ ingredients: [ingredient(foodId, 200)] }),
    );

    deleteFood(database.db, foodId);
    const frozen = readRecipe(database.db, recipeId)?.total.kcal;

    createFood(database.db, foodDraft({ macros: { protein: 0, carbs: 0, fat: 0, kcal: 999 } }));

    expect(readRecipe(database.db, recipeId)?.total.kcal).toBe(frozen);
  });
});
