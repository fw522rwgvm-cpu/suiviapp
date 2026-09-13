import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { addEntries } from '../../src/features/nutrition/data/day-writes';
import {
  listFoods,
  readFavoriteFoods,
  readLastEntryForFood,
  readQuantityPrefill,
  readRecentFoods,
} from '../../src/features/nutrition/data/food-reads';
import { createFood, updateFood } from '../../src/features/nutrition/data/food-writes';
import type { FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { baseQuantity, portionQuantity } from '../../src/features/nutrition/domain/portions';
import { seedJournal } from '../../src/dev/seed';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The quantity a recent row shows, and that its + button adds.
 *
 * THE PROPERTY WORTH TESTING IS NOT THAT IT SHOWS A NUMBER. It is that it
 * shows the SAME number the quantity screen would open on — because the row
 * now makes a promise the quantity screen used to make alone, and two paths to
 * "the last quantity" would agree almost always. The day they disagreed, the
 * row would be lying about what its own button does, and nobody would notice:
 * both figures are plausible.
 *
 * So every case below asserts the row against readQuantityPrefill rather than
 * against a literal.
 */

const DAY = toLocalDate('2026-09-13');

function draft(over: Partial<FoodDraft> = {}): FoodDraft {
  return {
    name: 'Pain de mie',
    brand: null,
    barcode: null,
    source: 'perso',
    baseUnit: 'g',
    macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
    refQty: 100,
    isFavorite: false,
    portions: [],
    ...over,
  };
}

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('a recent row agrees with the quantity screen', () => {
  it('shows the last quantity in base units', () => {
    const id = createFood(database.db, draft());
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'food', foodId: id, quantity: baseQuantity(60) }],
    });

    const recent = readRecentFoods(database.db)[0];
    expect(recent?.lastQuantity).toEqual(baseQuantity(60));
    // The assertion that matters: one value, produced once.
    expect(recent?.lastQuantity).toEqual(readQuantityPrefill(database.db, id)?.quantity);
  });

  it('shows the last quantity as the PORTION it was logged in', () => {
    const id = createFood(
      database.db,
      draft({ portions: [{ id: null, name: 'tranche', quantity: 25 }] }),
    );
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: id, quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2) },
      ],
    });

    const recent = readRecentFoods(database.db)[0];
    expect(recent?.lastQuantity.portion).toEqual({
      name: 'tranche',
      // The size the portion has TODAY, which is also the size it had when the
      // entry was logged — that equality is what step two of the chain checks.
      quantity: 25,
      count: 2,
    });
    expect(recent?.lastQuantity.baseQuantity).toBe(50);
    expect(recent?.lastQuantity).toEqual(readQuantityPrefill(database.db, id)?.quantity);
  });

  it('FALLS BACK TO BASE UNITS when the portion has been redefined since', () => {
    // The case that gives the pre-fill chain its shape, and the one a second
    // implementation would get wrong. A slice was 25 g when "2 tranches" was
    // logged and is 30 g today: re-offering "2 tranches" would add 60 g for a
    // habit that has always been 50 g — silently, from a button whose whole
    // point is not to be read.
    const id = createFood(
      database.db,
      draft({ portions: [{ id: null, name: 'tranche', quantity: 25 }] }),
    );
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: id, quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2) },
      ],
    });

    updateFood(database.db, id, draft({ portions: [{ id: null, name: 'tranche', quantity: 30 }] }));

    const recent = readRecentFoods(database.db)[0];
    expect(recent?.lastQuantity.portion).toBeNull();
    // 50 g: what was actually eaten, not 60.
    expect(recent?.lastQuantity.baseQuantity).toBe(50);
    expect(recent?.lastQuantity).toEqual(readQuantityPrefill(database.db, id)?.quantity);
  });

  it('reads the LAST RECORDED entry, not the last dated one', () => {
    // "Last" means last recorded (ix_entry_source_food is on created_at):
    // logging yesterday's lunch this morning makes that the one that repeats.
    const id = createFood(database.db, draft());
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'food', foodId: id, quantity: baseQuantity(60) }],
    });
    addEntries(database.db, {
      // An earlier DAY, recorded later.
      date: toLocalDate('2026-09-12'),
      mealPosition: 0,
      entries: [{ kind: 'food', foodId: id, quantity: baseQuantity(35) }],
    });

    expect(readRecentFoods(database.db)[0]?.lastQuantity.baseQuantity).toBe(35);
  });
});

describe('several recents at once', () => {
  it('gives each row its own quantity, in the right order', () => {
    // One row's portions must not leak into another's pre-fill: the portions
    // are fetched for the whole page in one query and grouped by food, which
    // is exactly the kind of grouping that gets an off-by-one.
    const bread = createFood(
      database.db,
      draft({ name: 'Pain', portions: [{ id: null, name: 'tranche', quantity: 25 }] }),
    );
    const rice = createFood(database.db, draft({ name: 'Riz' }));
    const milk = createFood(database.db, draft({ name: 'Lait', baseUnit: 'ml' }));

    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: bread, quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2) },
      ],
    });
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'food', foodId: rice, quantity: baseQuantity(120) }],
    });
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'food', foodId: milk, quantity: baseQuantity(200) }],
    });

    const recents = readRecentFoods(database.db);
    expect(recents.map((row) => row.name)).toEqual(['Lait', 'Riz', 'Pain']);
    expect(recents[0]?.lastQuantity).toEqual(baseQuantity(200));
    expect(recents[1]?.lastQuantity).toEqual(baseQuantity(120));
    expect(recents[2]?.lastQuantity.portion).toEqual({
      name: 'tranche',
      quantity: 25,
      count: 2,
    });

    for (const row of recents) {
      expect(row.lastQuantity).toEqual(readQuantityPrefill(database.db, row.id)?.quantity);
    }
  });

  it('answers an empty list without asking anything else', () => {
    // The early return exists because `inArray` with no ids is a query that
    // either fails or matches everything, depending on the driver.
    expect(readRecentFoods(database.db)).toEqual([]);
  });
});

describe('the grouped read and the single read are the same read', () => {
  /**
   * THE ASSERTION THE WINDOW FUNCTION RESTS ON.
   *
   * Extending the + button to favourites and to search results meant the last
   * quantity had to be fetched for the WHOLE library, so the per-food lookup
   * became one grouped query with ROW_NUMBER(). That is a second piece of code
   * answering "what was the last entry", and the first — readLastEntryForFood
   * — still serves the quantity screen.
   *
   * Two implementations of one question is exactly the shape this whole
   * feature was built to avoid. They are kept honest here rather than by care:
   * over a seeded journal of several months, food by food, they must agree.
   * The ordering is the part that would drift — `created_at` is nullable, and
   * SQLite sorts NULLs last on a descending order, quietly handing back the
   * OLDEST row.
   */
  it('agrees food by food over months of history', () => {
    const report = seedJournal(database.db, { endDate: DAY, days: 120, seed: 11 });
    expect(report.entries).toBeGreaterThan(200);

    const foods = listFoods(database.db);
    expect(foods.length).toBeGreaterThan(0);

    let compared = 0;
    for (const row of foods) {
      const single = readLastEntryForFood(database.db, row.id);
      const screen = readQuantityPrefill(database.db, row.id);

      expect(screen).not.toBeNull();
      // The row, the button and the quantity screen: one value.
      expect(row.lastQuantity).toEqual(screen?.quantity);
      if (single !== null) compared += 1;
    }

    // Guards the assertion above against passing vacuously on a library where
    // nothing was ever logged.
    expect(compared).toBeGreaterThan(0);
  });

  it('gives a never-eaten food the same answer the chain always gave', () => {
    // A favourite marked on a food nobody has eaten. There is no "last time",
    // and the chain falls through to display_ref_qty and then to 100 — which
    // is what the quantity screen would open on, so the row is still telling
    // the truth about what its button does.
    const id = createFood(database.db, draft({ name: 'Jamais mangé', isFavorite: true }));

    const favourite = readFavoriteFoods(database.db)[0];
    expect(favourite?.id).toBe(id);
    expect(favourite?.lastQuantity).toEqual(baseQuantity(100));
    expect(favourite?.lastQuantity).toEqual(readQuantityPrefill(database.db, id)?.quantity);
    // And it is absent from recents, which are derived from journal entries.
    expect(readRecentFoods(database.db)).toEqual([]);
  });

  it('answers an empty library without a query for nothing', () => {
    expect(listFoods(database.db)).toEqual([]);
    expect(readFavoriteFoods(database.db)).toEqual([]);
  });
});
