import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { FoodId } from '../../src/core/db/schema';
import { addFoodEntry } from '../../src/features/nutrition/data/day-writes';
import {
  listFoods,
  readFavoriteFoods,
  readFood,
  readFoodDraft,
  readLastEntryForFood,
  readQuantityPrefill,
  readRecentFoods,
} from '../../src/features/nutrition/data/food-reads';
import { createFood } from '../../src/features/nutrition/data/food-writes';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { baseQuantity, portionQuantity } from '../../src/features/nutrition/domain/portions';
import { searchFoods } from '../../src/features/nutrition/domain/food-search';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The food read layer, against a real SQLite file (D15).
 *
 * Two things are worth the file: the ordering of quick access, which is what
 * removes taps (D16), and the pre-fill chain, which is the lever on the
 * 15-second target and fails plausibly rather than visibly.
 */

const DAY = toLocalDate('2026-09-11');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function aFood(overrides: Partial<FoodDraft> = {}): FoodId {
  return createFood(database.db, {
    ...emptyFoodDraft(),
    name: 'Pain de mie',
    macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
    ...overrides,
  });
}

/** Sets created_at directly, so orderings are tested rather than raced. */
function stampLastEntry(foodId: FoodId, at: number | null): void {
  database.raw
    .prepare('UPDATE journal_entry SET created_at = ? WHERE source_food_id = ?')
    .run(at, foodId);
}

describe('the list the search runs over', () => {
  it('comes back case-insensitively alphabetical, matching ix_food_name', () => {
    aFood({ name: 'Zucchini' });
    aFood({ name: 'abricot' });
    aFood({ name: 'Banane' });

    expect(listFoods(database.db).map((item) => item.name)).toEqual([
      'abricot',
      'Banane',
      'Zucchini',
    ]);
  });

  it('carries macros for 100, never scaled by the reference quantity', () => {
    // The fence of D9, checked at the boundary that could breach it.
    const id = aFood({ refQty: 30, macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 } });
    const item = listFoods(database.db).find((food) => food.id === id);

    expect(item?.reference.protein).toBeCloseTo(8, 10);
  });

  it('feeds the pure search, which is the whole retrieval path', () => {
    aFood({ name: 'Crème fraîche' });
    aFood({ name: 'Pain de mie' });

    // No SQL involved: one cached list, one pure function (D16).
    expect(searchFoods(listFoods(database.db), 'creme').map((food) => food.name)).toEqual([
      'Crème fraîche',
    ]);
  });
});

describe('quick access (specs 8.4a)', () => {
  it('lists favourites alphabetically', () => {
    aFood({ name: 'Yaourt', isFavorite: true });
    aFood({ name: 'Amandes', isFavorite: true });
    aFood({ name: 'Pain', isFavorite: false });

    expect(readFavoriteFoods(database.db).map((food) => food.name)).toEqual([
      'Amandes',
      'Yaourt',
    ]);
  });

  it('lists foods most recently logged first', () => {
    const old = aFood({ name: 'Ancien' });
    const recent = aFood({ name: 'Recent' });

    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: old, quantity: baseQuantity(10) });
    stampLastEntry(old, 1_000);
    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: recent, quantity: baseQuantity(10) });
    stampLastEntry(recent, 2_000);

    expect(readRecentFoods(database.db).map((food) => food.name)).toEqual([
      'Recent',
      'Ancien',
    ]);
  });

  it('names a food once, however many times it was logged', () => {
    const id = aFood({ name: 'Pain' });
    for (let index = 0; index < 5; index += 1) {
      addFoodEntry(database.db, {
        date: DAY,
        mealPosition: 0,
        foodId: id,
        quantity: baseQuantity(10),
      });
    }

    expect(readRecentFoods(database.db)).toHaveLength(1);
  });

  it('ignores free entries, which reference no food', () => {
    aFood({ name: 'Pain' });
    expect(readRecentFoods(database.db)).toEqual([]);
  });

  it('keeps a favourite in the recents too', () => {
    // The same food reached two ways, not a duplicate. Filtering it out would
    // make the second list shift about depending on what is starred.
    const id = aFood({ name: 'Pain', isFavorite: true });
    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: id, quantity: baseQuantity(10) });

    expect(readFavoriteFoods(database.db)).toHaveLength(1);
    expect(readRecentFoods(database.db)).toHaveLength(1);
  });

  it('drops a food that has been deleted, without dropping its entries', () => {
    // The dangling source_food_id is kept on the entry (specs 5.3); the join
    // simply finds nothing, which is the right answer for a quick-access list.
    const id = aFood({ name: 'Pain' });
    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: id, quantity: baseQuantity(10) });
    database.raw.prepare('DELETE FROM food WHERE id = ?').run(id);

    expect(readRecentFoods(database.db)).toEqual([]);
    expect(
      (database.raw.prepare('SELECT COUNT(*) AS n FROM journal_entry').get() as { n: number }).n,
    ).toBe(1);
  });
});

describe('the last entry for a food', () => {
  it('is the last RECORDED one, which is what the normative index orders by', () => {
    const id = aFood();
    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: id, quantity: baseQuantity(40) });
    stampLastEntry(id, 1_000);
    addFoodEntry(database.db, { date: DAY, mealPosition: 1, foodId: id, quantity: baseQuantity(75) });
    database.raw
      .prepare('UPDATE journal_entry SET created_at = 2000 WHERE quantity = 75')
      .run();

    expect(readLastEntryForFood(database.db, id)?.quantity).toBe(75);
  });

  it('falls back to the identifier when created_at says nothing', () => {
    // created_at is nullable in the frozen schema, so an imported archive can
    // carry NULLs. SQLite sorts NULLs last on a descending order, which would
    // quietly hand back the OLDEST row. ULIDs sort by creation time, so the
    // identifier is both a tie-break and a working fallback.
    const id = aFood();
    addFoodEntry(database.db, { date: DAY, mealPosition: 0, foodId: id, quantity: baseQuantity(40) });
    addFoodEntry(database.db, { date: DAY, mealPosition: 1, foodId: id, quantity: baseQuantity(75) });
    stampLastEntry(id, null);

    expect(readLastEntryForFood(database.db, id)?.quantity).toBe(75);
  });

  it('remembers the portion and the size it had at the time', () => {
    const id = aFood({ portions: [{ id: null, name: 'tranche', quantity: 25 }] });
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2),
    });

    expect(readLastEntryForFood(database.db, id)).toEqual({
      quantity: 50,
      portionName: 'tranche',
      portionQuantity: 25,
    });
  });

  it('is null for a food never logged', () => {
    expect(readLastEntryForFood(database.db, aFood())).toBeNull();
  });
});

describe('what the quantity screen opens on', () => {
  it('composes the whole chain, so the screen holds no rule of its own', () => {
    const id = aFood({
      refQty: 30,
      portions: [{ id: null, name: 'tranche', quantity: 25 }],
      macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 },
    });

    // Step three: nothing logged yet, so the reference quantity stands in.
    expect(readQuantityPrefill(database.db, id)?.quantity).toEqual({
      baseQuantity: 30,
      portion: null,
    });

    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2),
    });

    // Step one: the last entry, in the terms it was logged in.
    expect(readQuantityPrefill(database.db, id)?.quantity).toEqual({
      baseQuantity: 50,
      portion: { name: 'tranche', quantity: 25, count: 2 },
    });
  });

  it('is null for a food that no longer exists', () => {
    expect(readQuantityPrefill(database.db, 'ghost' as FoodId)).toBeNull();
  });
});

describe('the editor draft', () => {
  it('restates the macros in the unit the user thinks in', () => {
    const id = aFood({ refQty: 30, macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 } });
    const draft = readFoodDraft(database.db, id);

    expect(draft?.refQty).toBe(30);
    expect(draft?.macros.protein).toBeCloseTo(2.4, 10);
    expect(draft?.macros.kcal).toBeCloseTo(79.5, 10);
  });

  it('comes back unchanged for a food typed against 100', () => {
    const id = aFood();
    expect(readFoodDraft(database.db, id)?.macros).toEqual({
      protein: 8,
      carbs: 47,
      fat: 3,
      kcal: 265,
    });
  });

  it('is null for a food that does not exist', () => {
    expect(readFood(database.db, 'ghost' as FoodId)).toBeNull();
    expect(readFoodDraft(database.db, 'ghost' as FoodId)).toBeNull();
  });
});
