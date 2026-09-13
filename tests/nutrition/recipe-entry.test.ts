import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { DayMealId, FoodId, RecipeId } from '../../src/core/db/schema';
import {
  readDay,
  readDayTotals,
  readMealEntries,
} from '../../src/features/nutrition/data/day-reads';
import { addEntries, addFoodEntry } from '../../src/features/nutrition/data/day-writes';
import { createFood, deleteFood } from '../../src/features/nutrition/data/food-writes';
import {
  readLastEntryForFood,
  readRecentFoods,
} from '../../src/features/nutrition/data/food-reads';
import { readRecipe } from '../../src/features/nutrition/data/recipe-reads';
import { createRecipe, deleteRecipe } from '../../src/features/nutrition/data/recipe-writes';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { emptyRecipeDraft } from '../../src/features/nutrition/domain/recipe-draft';
import {
  occurrenceLines,
  occurrenceTotal,
  usableLines,
} from '../../src/features/nutrition/domain/recipe-occurrence';
import { baseQuantity } from '../../src/features/nutrition/domain/portions';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Logging a recipe as a grouped block (specs 8.6), end to end through the
 * write layer.
 *
 * The critical assertion is not that it writes rows: it is that the block
 * comes to what the user was shown, that the recipe is untouched, and that the
 * ingredient lines do not leak into the quantity pre-fill of the foods they
 * came from.
 */

const DATE = toLocalDate('2026-09-11');

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
    macros: { protein: 8, carbs: 48, fat: 3, kcal: 264 },
    ...overrides,
  };
}

/** A four-portion recipe: 400 g of chickpeas and 100 g of coconut cream. */
function buildRecipe(): { recipeId: RecipeId; chickpeaId: FoodId; creamId: FoodId } {
  const chickpeaId = createFood(database.db, foodDraft());
  const creamId = createFood(
    database.db,
    foodDraft({ name: 'Crème de coco', macros: { protein: 2, carbs: 3, fat: 20, kcal: 200 } }),
  );

  const recipeId = createRecipe(database.db, {
    ...emptyRecipeDraft(),
    name: 'Curry de pois chiches',
    yieldType: 'portions',
    yieldValue: 4,
    ingredients: [
      { id: null, foodId: chickpeaId, name: 'Pois chiches', quantity: 400, unit: 'g', frozen: null },
      { id: null, foodId: creamId, name: 'Crème de coco', quantity: 100, unit: 'g', frozen: null },
    ],
  });

  return { recipeId, chickpeaId, creamId };
}

/** What the screen would collect: the recipe scaled to `consumed`. */
function occurrence(recipeId: RecipeId, consumed: number) {
  const view = readRecipe(database.db, recipeId);
  if (view === null) throw new Error('no recipe');
  return {
    kind: 'recipe' as const,
    recipeId,
    name: view.name,
    yieldType: view.yield.type,
    consumed,
    lines: occurrenceLines(view, consumed),
  };
}

function firstMeal(): DayMealId {
  const meal = readDay(database.db, DATE).meals[0];
  if (meal?.id === null || meal?.id === undefined) {
    throw new Error('meal is not materialised');
  }
  return meal.id;
}

describe('logging a recipe', () => {
  it('writes one empty parent and the lines that carry everything', () => {
    const { recipeId } = buildRecipe();

    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 2)],
    });

    const entries = readMealEntries(database.db, firstMeal());
    const block = entries[0];

    expect(entries).toHaveLength(1);
    expect(block?.kind).toBe('recipe');
    // D5/R2: the parent carries no macros at all, so the clause-free SUM
    // cannot count it.
    expect(block?.reference).toBeNull();
    expect(block?.children).toHaveLength(2);
    expect(block?.children.every((child) => child.kind === 'recipe_item')).toBe(true);
  });

  it('comes to exactly what the screen showed', () => {
    // Half of a four-portion recipe: 200 g of chickpeas at 264 kcal/100 and
    // 50 g of cream at 200 kcal/100.
    const { recipeId } = buildRecipe();
    const collected = occurrence(recipeId, 2);
    const shown = occurrenceTotal(collected.lines);

    addEntries(database.db, { date: DATE, mealPosition: 0, entries: [collected] });

    expect(readDayTotals(database.db, DATE).kcal).toBeCloseTo(shown.kcal, 9);
    expect(readDayTotals(database.db, DATE).kcal).toBeCloseTo(200 * 2.64 + 50 * 2, 9);
  });

  it('states how much of the recipe on the parent, in its own terms', () => {
    const { recipeId } = buildRecipe();
    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 2)],
    });

    const block = readMealEntries(database.db, firstMeal())[0];

    expect(block?.quantity).toBe(2);
    expect(block?.portionName).toBe('portion');
    // No base unit: a portion of a recipe has no size in base units, which is
    // precisely what a yield in portions means.
    expect(block?.baseUnit).toBeNull();
    expect(block?.portionQuantity).toBeNull();
  });

  it('uses grams on the parent for a recipe yielded by weight', () => {
    const chickpeaId = createFood(database.db, foodDraft());
    const recipeId = createRecipe(database.db, {
      ...emptyRecipeDraft(),
      name: 'Sauce',
      yieldType: 'weight',
      yieldValue: 800,
      ingredients: [
        { id: null, foodId: chickpeaId, name: 'Pois chiches', quantity: 800, unit: 'g', frozen: null },
      ],
    });

    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 200)],
    });

    const block = readMealEntries(database.db, firstMeal())[0];
    expect(block?.baseUnit).toBe('g');
    expect(block?.quantity).toBe(200);
    expect(block?.portionName).toBeNull();
  });

  it('keeps the link to the recipe it came from', () => {
    const { recipeId } = buildRecipe();
    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 1)],
    });

    expect(readMealEntries(database.db, firstMeal())[0]?.sourceRecipeId).toBe(recipeId);
  });

  it('does not touch the recipe (specs 8.6 point 3)', () => {
    const { recipeId } = buildRecipe();
    const before = readRecipe(database.db, recipeId);

    const adjusted = occurrence(recipeId, 2);
    // The user halves the cream for this occasion only.
    adjusted.lines[1] = { ...adjusted.lines[1]!, quantity: 10 };
    addEntries(database.db, { date: DATE, mealPosition: 0, entries: [adjusted] });

    expect(readRecipe(database.db, recipeId)).toEqual(before);
  });

  it('writes the adjustment, not the recipe it was derived from', () => {
    const { recipeId } = buildRecipe();
    const adjusted = occurrence(recipeId, 2);
    adjusted.lines[1] = { ...adjusted.lines[1]!, quantity: 10 };

    addEntries(database.db, { date: DATE, mealPosition: 0, entries: [adjusted] });

    const block = readMealEntries(database.db, firstMeal())[0];
    expect(block?.children[1]?.quantity).toBe(10);
    expect(readDayTotals(database.db, DATE).kcal).toBeCloseTo(200 * 2.64 + 10 * 2, 9);
  });

  it('drops a line set to zero rather than refusing it', () => {
    // Taking an ingredient out for one occasion is what the adjustment screen
    // is for; making the user delete the row would be a second way to say it.
    const { recipeId } = buildRecipe();
    const adjusted = occurrence(recipeId, 2);
    adjusted.lines[1] = { ...adjusted.lines[1]!, quantity: 0 };

    // Passed WITH the zero in it: usableLines runs inside addEntries, so the
    // screen does not have to remember to filter and cannot forget to.
    addEntries(database.db, { date: DATE, mealPosition: 0, entries: [adjusted] });

    const block = readMealEntries(database.db, firstMeal())[0];
    expect(block?.children).toHaveLength(1);
    expect(block?.children[0]?.name).toBe('Pois chiches');
    // And the domain function agrees about which lines those are.
    expect(usableLines(adjusted.lines)).toHaveLength(1);
  });

  it('refuses a block with nothing left in it', () => {
    // A parent with no children carries no macros at all, so it would log a
    // meal worth nought calories that looks like a measurement.
    const { recipeId } = buildRecipe();
    const emptied = { ...occurrence(recipeId, 2), lines: [] };

    expect(() =>
      addEntries(database.db, { date: DATE, mealPosition: 0, entries: [emptied] }),
    ).toThrow();
    expect(countRows(database.raw, 'journal_entry')).toBe(0);
    // Nothing materialised either: an empty basket must not create a day.
    expect(countRows(database.raw, 'day')).toBe(0);
  });

  it('refuses a consumed quantity of zero', () => {
    const { recipeId } = buildRecipe();

    expect(() =>
      addEntries(database.db, {
        date: DATE,
        mealPosition: 0,
        entries: [{ ...occurrence(recipeId, 1), consumed: 0 }],
      }),
    ).toThrow();
  });

  it('lands whole or not at all, beside other lines', () => {
    // Specs 8.4 v2.3: the basket is one transaction. Half a meal is worse than
    // none, because none is visibly missing and half is not.
    const { recipeId, chickpeaId } = buildRecipe();

    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: chickpeaId, quantity: baseQuantity(50) },
        occurrence(recipeId, 1),
        { kind: 'free', name: 'Café', macros: { protein: 0, carbs: 0, fat: 0, kcal: 5 } },
      ],
    });

    const entries = readMealEntries(database.db, firstMeal());
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.kind)).toEqual(['food', 'recipe', 'free']);
  });
});

describe('the pre-fill leak an ingredient line would have caused', () => {
  it('never offers an ingredient amount as the last quantity for its food', () => {
    // THE FINDING THIS SLICE MADE, and the one nothing would have shown.
    //
    // A recipe_item carries a source_food_id and a quantity, so before slice 6
    // added the kind clause it was eligible to become "the last quantity for
    // that food". Log one bolognese and every food in it would start offering
    // an ingredient's worth on the add screen — thirty grams of onion being a
    // perfectly believable amount of onion.
    const { recipeId, chickpeaId } = buildRecipe();

    // Logged by hand at 50 g, then as part of a recipe at 200 g.
    addFoodEntry(database.db, {
      date: DATE,
      mealPosition: 0,
      foodId: chickpeaId,
      quantity: baseQuantity(50),
    });
    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 2)],
    });

    expect(readLastEntryForFood(database.db, chickpeaId)?.quantity).toBe(50);
  });

  it('keeps the window function and the single read agreeing about it', () => {
    // The two implementations slice 4 had to hold together — a row-by-row read
    // and a ROW_NUMBER window — now have a clause each, and the clauses must
    // match character for character.
    const { recipeId, chickpeaId, creamId } = buildRecipe();

    addFoodEntry(database.db, {
      date: DATE,
      mealPosition: 0,
      foodId: chickpeaId,
      quantity: baseQuantity(50),
    });
    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 2)],
    });

    const listed = new Map(
      readRecentFoods(database.db).map((item) => [item.id, item.lastQuantity.baseQuantity]),
    );

    expect(listed.get(chickpeaId)).toBe(readLastEntryForFood(database.db, chickpeaId)?.quantity);
    // The cream has only ever been an ingredient, so it has no last entry at
    // all — and falls back to its reference quantity, as a food never eaten
    // always has.
    expect(readLastEntryForFood(database.db, creamId)).toBeNull();
  });
});

describe('the whole journey, as the slice was asked for', () => {
  it('survives the deletion of a food the recipe uses', () => {
    // THE EXIT CRITERION, end to end and in order:
    //
    //   create a recipe yielded in portions, log it choosing a quantity,
    //   adjust one ingredient FOR THAT OCCASION ONLY, see a grouped block
    //   whose total is right, find the saved recipe unchanged — then delete a
    //   food it uses and find the block still showing a correct total.
    //
    // The last clause is the one nothing else asserts, and it is where two
    // independent freezes have to hold at once: D5/R1 froze the block's lines
    // when they were logged, and D5/R3 freezes the recipe's ingredient line
    // when the food goes. Neither may move the other.
    const { recipeId, creamId } = buildRecipe();

    const adjusted = occurrence(recipeId, 2);
    adjusted.lines[1] = { ...adjusted.lines[1]!, quantity: 10 };
    addEntries(database.db, { date: DATE, mealPosition: 0, entries: [adjusted] });

    const blockBefore = readMealEntries(database.db, firstMeal())[0];
    const dayBefore = readDayTotals(database.db, DATE);
    const recipeBefore = readRecipe(database.db, recipeId);

    // A grouped block whose total is the adjustment, not the recipe.
    expect(blockBefore?.children).toHaveLength(2);
    expect(blockBefore?.total?.kcal).toBeCloseTo(200 * 2.64 + 10 * 2, 9);

    // The saved recipe has not moved.
    expect(recipeBefore?.ingredients[1]?.quantity).toBe(100);

    deleteFood(database.db, creamId);

    const blockAfter = readMealEntries(database.db, firstMeal())[0];
    const recipeAfter = readRecipe(database.db, recipeId);

    // The journal did not move by a bit: its lines froze their own reference
    // and never consult a food again (D5/R1).
    expect(readDayTotals(database.db, DATE)).toEqual(dayBefore);
    expect(blockAfter?.total?.kcal).toBeCloseTo(blockBefore?.total?.kcal ?? 0, 12);
    expect(blockAfter?.children[1]?.name).toBe('Crème de coco');

    // And the recipe did not move either — its line is frozen rather than
    // gone, so it keeps every figure it had (specs 5.3, D5/R3).
    expect(recipeAfter?.total.kcal).toBeCloseTo(recipeBefore?.total.kcal ?? 0, 12);
    expect(recipeAfter?.ingredients[1]?.frozen).toBe(true);
    expect(recipeAfter?.ingredients[1]?.quantity).toBe(100);
  });

  it('keeps the block readable when the recipe itself is deleted', () => {
    // source_recipe_id carries no foreign key, so nothing cascades into
    // history. The block keeps its name, its lines and its total; only the
    // link to something still in the library is gone.
    const { recipeId } = buildRecipe();
    addEntries(database.db, {
      date: DATE,
      mealPosition: 0,
      entries: [occurrence(recipeId, 2)],
    });
    const before = readDayTotals(database.db, DATE);

    deleteRecipe(database.db, recipeId);

    const block = readMealEntries(database.db, firstMeal())[0];
    expect(readDayTotals(database.db, DATE)).toEqual(before);
    expect(block?.name).toBe('Curry de pois chiches');
    expect(block?.children).toHaveLength(2);
    // Still pointing at it, informatively: the column is what ties the entry
    // to what it was, and erasing it would be the one thing that loses.
    expect(block?.sourceRecipeId).toBe(recipeId);
  });
});
