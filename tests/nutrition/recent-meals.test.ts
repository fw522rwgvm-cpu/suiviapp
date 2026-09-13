import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { FoodId } from '../../src/core/db/schema';
import { readDay, readMealEntries, readRecentMeals } from '../../src/features/nutrition/data/day-reads';
import {
  addEntries,
  addFoodEntry,
  addFreeEntry,
  deleteEntry,
} from '../../src/features/nutrition/data/day-writes';
import { createFood, deleteFood, updateFood } from '../../src/features/nutrition/data/food-writes';
import { readMealLines } from '../../src/features/nutrition/data/meal-lines';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Recent meals (specs 8.4a), deferred from slice 3 to here because a meal only
 * means something once a day has a shape.
 *
 * The decision this file has to keep falsifiable is that a replay REPLAYS THE
 * CHOICES AND NOT THE FIGURES: the quantity comes from the old entry, the
 * macros from the food as it reads today. Three cases fall back to the frozen
 * capsule, and each has its own test — a free entry, a deleted food, and a food
 * whose base unit has moved.
 *
 * IT GOES THROUGH THE BASKET, AND THE MEAL IS EXPANDED AT THE TAP. There is no
 * addRecentMeal and no replay inside the write: readMealLines turns a past meal
 * into one staged line per top-level entry, and addEntries writes each one
 * verbatim. So the path under test here is the one the screen actually takes,
 * and the three fallbacks of specs 14.6 n° 7 are asserted where they now live.
 */

/** One meal, expanded and confirmed — what the add window now does. */
function replayMeal(input: {
  date: (typeof MONDAY);
  mealPosition: number;
  sourceMealId: Parameters<typeof readMealEntries>[1];
}) {
  return addEntries(fixture.db, {
    date: input.date,
    mealPosition: input.mealPosition,
    entries: readMealLines(fixture.db, input.sourceMealId),
  });
}

const MONDAY = toLocalDate('2026-09-14');
const TUESDAY = toLocalDate('2026-09-15');

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

function chicken(): FoodId {
  return createFood(fixture.db, {
    name: 'Poulet',
    brand: 'Sans marque',
    barcode: null,
    source: 'perso',
    baseUnit: 'g',
    macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
    refQty: 100,
    isFavorite: false,
    portions: [],
  });
}

/** A Monday lunch: one food at 150 g, one free entry. */
function lunch(): void {
  addFoodEntry(fixture.db, {
    date: MONDAY,
    mealPosition: 1,
    foodId: chicken(),
    quantity: { baseQuantity: 150, portion: null },
  });
  addFreeEntry(fixture.db, {
    date: MONDAY,
    mealPosition: 1,
    name: 'Café',
    macros: { protein: 0, carbs: 0, fat: 0, kcal: 5 },
  });
}

describe('what shows up as a recent meal', () => {
  it('lists a past meal with its count and what it came to', () => {
    lunch();

    const recents = readRecentMeals(fixture.db);

    expect(recents).toHaveLength(1);
    expect(recents[0]?.name).toBe('Déjeuner');
    expect(recents[0]?.date).toBe(MONDAY);
    expect(recents[0]?.entryCount).toBe(2);
    // 150 g of chicken at 165 kcal/100 g, plus a 5 kcal coffee.
    expect(recents[0]?.kcal).toBeCloseTo(247.5 + 5, 6);
  });

  it('ignores a meal nothing was logged into', () => {
    // An empty meal is a row in a template, not something that was eaten. The
    // day below materialises four meals and only one holds an entry.
    addFreeEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    expect(readRecentMeals(fixture.db)).toHaveLength(1);
  });

  it('drops a meal once its last entry is removed', () => {
    lunch();
    const entries = readMealEntries(fixture.db, readDay(fixture.db, MONDAY).meals[1]!.id!);
    for (const entry of entries) deleteEntry(fixture.db, entry.id);

    expect(readRecentMeals(fixture.db)).toEqual([]);
  });

  it('orders by when the lines were written, not by the day they belong to', () => {
    // The rule slice 3 settled for foods: logging yesterday's dinner this
    // morning makes it the most recent thing you did.
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });
    addFreeEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 2,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    expect(readRecentMeals(fixture.db).map((meal) => meal.date)).toEqual([MONDAY, TUESDAY]);
  });
});

describe('replaying a recent meal', () => {
  it('adds every line to the target meal, in one go', () => {
    lunch();
    const sourceMealId = readDay(fixture.db, MONDAY).meals[1]!.id!;

    replayMeal({
      date: TUESDAY,
      mealPosition: 1,
      sourceMealId,
    });

    const target = readDay(fixture.db, TUESDAY).meals[1]!;
    const entries = readMealEntries(fixture.db, target.id!);
    expect(entries.map((entry) => entry.name)).toEqual(['Poulet', 'Café']);
    // The quantity is the one that was eaten, not a default.
    expect(entries[0]?.quantity).toBe(150);
  });

  it('takes the macros as the food reads TODAY, not as they were frozen', () => {
    // THE DECISION THIS FILE EXISTS FOR. Specs 8.5 makes correcting a copied
    // product "the main mechanism for compensating for the uneven quality of
    // the source"; replaying the capsule would re-import the error the user
    // just corrected, on the path built for repeating habits.
    const foodId = chicken();
    addFoodEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 1,
      foodId,
      quantity: { baseQuantity: 150, portion: null },
    });

    updateFood(fixture.db, foodId, {
      name: 'Poulet fermier',
      brand: 'Sans marque',
      barcode: null,
      source: 'perso',
      baseUnit: 'g',
      macros: { protein: 27, carbs: 0, fat: 8, kcal: 180 },
      refQty: 100,
      isFavorite: false,
      portions: [],
    });

    replayMeal({
      date: TUESDAY,
      mealPosition: 1,
      sourceMealId: readDay(fixture.db, MONDAY).meals[1]!.id!,
    });

    const replayed = readMealEntries(
      fixture.db,
      readDay(fixture.db, TUESDAY).meals[1]!.id!,
    )[0];
    expect(replayed?.name).toBe('Poulet fermier');
    expect(replayed?.reference).toEqual({ protein: 27, carbs: 0, fat: 8, kcal: 180 });
    // And the quantity still comes from the old entry: that is what "the same
    // meal" means.
    expect(replayed?.quantity).toBe(150);

    // The original is untouched — it is a closed capsule (D5/R1).
    const original = readMealEntries(
      fixture.db,
      readDay(fixture.db, MONDAY).meals[1]!.id!,
    )[0];
    expect(original?.reference).toEqual({ protein: 31, carbs: 0, fat: 3.6, kcal: 165 });
  });

  it('keeps the portion exactly as it was expressed and sized', () => {
    // Same ruling as slice 3's pre-fill: the frozen portion size wins, so a
    // tranche redefined from 25 g to 30 g does not turn a 50 g habit into 60 g.
    const foodId = createFood(fixture.db, {
      name: 'Pain',
      brand: null,
      barcode: null,
      source: 'perso',
      baseUnit: 'g',
      macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
      refQty: 100,
      isFavorite: false,
      portions: [{ id: null, name: 'tranche', quantity: 25 }],
    });
    addFoodEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 0,
      foodId,
      // Two slices of 25 g: the count is how it was expressed, the 50 g what it
      // comes to.
      quantity: { baseQuantity: 50, portion: { name: 'tranche', quantity: 25, count: 2 } },
    });

    replayMeal({
      date: TUESDAY,
      mealPosition: 0,
      sourceMealId: readDay(fixture.db, MONDAY).meals[0]!.id!,
    });

    const replayed = readMealEntries(
      fixture.db,
      readDay(fixture.db, TUESDAY).meals[0]!.id!,
    )[0];
    expect(replayed?.quantity).toBe(50);
    expect(replayed?.portionName).toBe('tranche');
    expect(replayed?.portionQuantity).toBe(25);
  });

  it('replays a free entry from its own figures, having no food to read', () => {
    addFreeEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 0,
      name: 'Café',
      macros: { protein: 0, carbs: 0, fat: 0, kcal: 5 },
    });

    replayMeal({
      date: TUESDAY,
      mealPosition: 0,
      sourceMealId: readDay(fixture.db, MONDAY).meals[0]!.id!,
    });

    const replayed = readMealEntries(
      fixture.db,
      readDay(fixture.db, TUESDAY).meals[0]!.id!,
    )[0];
    expect(replayed?.name).toBe('Café');
    expect(replayed?.reference?.kcal).toBe(5);
  });

  it('replays a deleted food from its capsule rather than losing the line', () => {
    // Specs 5.3 says deleting a food leaves past entries intact. Making the
    // user lose the line would charge them for a deletion the specs call free.
    const foodId = chicken();
    addFoodEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 0,
      foodId,
      quantity: { baseQuantity: 150, portion: null },
    });
    deleteFood(fixture.db, foodId);

    replayMeal({
      date: TUESDAY,
      mealPosition: 0,
      sourceMealId: readDay(fixture.db, MONDAY).meals[0]!.id!,
    });

    const replayed = readMealEntries(
      fixture.db,
      readDay(fixture.db, TUESDAY).meals[0]!.id!,
    )[0];
    expect(replayed?.name).toBe('Poulet');
    expect(replayed?.reference).toEqual({ protein: 31, carbs: 0, fat: 3.6, kcal: 165 });
  });

  it('falls back when the food has changed base unit, rather than mixing the two', () => {
    // Re-reading here would pair macros per 100 ml with a quantity counted in
    // grams — a wrong figure that looks entirely plausible.
    const foodId = chicken();
    addFoodEntry(fixture.db, {
      date: MONDAY,
      mealPosition: 0,
      foodId,
      quantity: { baseQuantity: 150, portion: null },
    });

    updateFood(fixture.db, foodId, {
      name: 'Bouillon',
      brand: null,
      barcode: null,
      source: 'perso',
      baseUnit: 'ml',
      macros: { protein: 1, carbs: 1, fat: 0, kcal: 8 },
      refQty: 100,
      isFavorite: false,
      portions: [],
    });

    replayMeal({
      date: TUESDAY,
      mealPosition: 0,
      sourceMealId: readDay(fixture.db, MONDAY).meals[0]!.id!,
    });

    const replayed = readMealEntries(
      fixture.db,
      readDay(fixture.db, TUESDAY).meals[0]!.id!,
    )[0];
    expect(replayed?.name).toBe('Poulet');
    expect(replayed?.baseUnit).toBe('g');
    expect(replayed?.reference?.kcal).toBe(165);
  });

  it('materialises the target day, and only because something was written', () => {
    lunch();
    const sourceMealId = readDay(fixture.db, MONDAY).meals[1]!.id!;

    expect(readDay(fixture.db, TUESDAY).materialized).toBe(false);
    replayMeal({ date: TUESDAY, mealPosition: 1, sourceMealId });
    expect(readDay(fixture.db, TUESDAY).materialized).toBe(true);
  });

  it('stages nothing at all when the source meal has been emptied', () => {
    // AN EMPTY BASKET MUST NOT CREATE A DAY (specs 8.2), and expanding at the
    // tap is what makes that true again without a special case.
    //
    // Worth recording because it moved twice. With the meal as ONE basket line
    // carrying an identifier, confirming it materialised the day and wrote
    // nothing — the basket was not empty, and 8.2 makes the user's action the
    // act that defines a day. Expanded at the tap, an emptied meal produces no
    // line at all, so there is nothing to confirm and nothing to create.
    //
    // The second reading is the better one: what the user confirms is what the
    // basket holds, and the basket holds what they were shown.
    lunch();
    const sourceMealId = readDay(fixture.db, MONDAY).meals[1]!.id!;
    for (const entry of readMealEntries(fixture.db, sourceMealId)) {
      deleteEntry(fixture.db, entry.id);
    }

    expect(readMealLines(fixture.db, sourceMealId)).toEqual([]);
    expect(replayMeal({ date: TUESDAY, mealPosition: 1, sourceMealId })).toEqual([]);
    expect(readDay(fixture.db, TUESDAY).materialized).toBe(false);
  });
});
