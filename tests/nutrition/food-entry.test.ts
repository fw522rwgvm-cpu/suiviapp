import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { FoodId, JournalEntryId } from '../../src/core/db/schema';
import { readDayTotals, readMealEntries } from '../../src/features/nutrition/data/day-reads';
import {
  addEntries,
  addFoodEntry,
  updateFoodEntryQuantity,
} from '../../src/features/nutrition/data/day-writes';
import { createFood } from '../../src/features/nutrition/data/food-writes';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { baseQuantity, portionQuantity } from '../../src/features/nutrition/domain/portions';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Logging a food, which is what the whole slice exists to make possible.
 *
 * The capsule is the thing to test: an entry that froze only some of what it
 * needs looks perfectly right today and becomes unreadable the day the food is
 * edited or deleted — which is exactly when nobody is watching.
 */

const DAY = toLocalDate('2026-09-11');
const SLICE = { name: 'tranche', quantity: 25 };

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
    brand: 'Sans marque',
    macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
    portions: [{ id: null, name: 'tranche', quantity: 25 }],
    ...overrides,
  });
}

function rowOf(entryId: JournalEntryId): Record<string, unknown> {
  return database.raw
    .prepare('SELECT * FROM journal_entry WHERE id = ?')
    .get(entryId) as Record<string, unknown>;
}

describe('the frozen capsule', () => {
  it('copies everything the journal will ever need from the food', () => {
    const id = aFood();
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(60),
    });

    const row = rowOf(entryId);
    expect(row['kind']).toBe('food');
    expect(row['name']).toBe('Pain de mie');
    expect(row['brand']).toBe('Sans marque');
    expect(row['base_unit']).toBe('g');
    expect(row['quantity']).toBe(60);
    expect(row['protein_100']).toBe(8);
    expect(row['kcal_100']).toBe(265);
    // Informative, no live link — and the key to "the last quantity for this
    // food" through ix_entry_source_food.
    expect(row['source_food_id']).toBe(id);
    expect(row['source_recipe_id']).toBeNull();
    expect(row['parent_entry_id']).toBeNull();
  });

  it('stores base units in quantity, and the portion beside it', () => {
    // THE INVARIANT. If quantity held "2" for two slices, every total would be
    // wrong for this row — plausibly wrong, which is the worst kind.
    const id = aFood();
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: portionQuantity(SLICE, 2),
    });

    const row = rowOf(entryId);
    expect(row['quantity']).toBe(50);
    expect(row['portion_name']).toBe('tranche');
    // The size of ONE portion as of today, frozen.
    expect(row['portion_quantity']).toBe(25);
  });

  it('totals through the same clause-free sum as every other kind of row', () => {
    const id = aFood();
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: portionQuantity(SLICE, 2),
    });

    // 50 g of a food at 8 g of protein per 100.
    const totals = readDayTotals(database.db, DAY);
    expect(totals.protein).toBeCloseTo(4, 10);
    expect(totals.kcal).toBeCloseTo(132.5, 10);
  });

  it('leaves no portion columns when base units were typed', () => {
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: aFood(),
      quantity: baseQuantity(60),
    });

    const row = rowOf(entryId);
    expect(row['portion_name']).toBeNull();
    expect(row['portion_quantity']).toBeNull();
  });
});

describe('materialisation', () => {
  it('happens in the same transaction, never on its own', () => {
    // specs 8.2: a day is materialised at the first ACTION concerning it. An
    // empty materialised day would be data created by consultation.
    expect(countRows(database.raw, 'day')).toBe(0);

    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: aFood(),
      quantity: baseQuantity(60),
    });

    expect(countRows(database.raw, 'day')).toBe(1);
    expect(countRows(database.raw, 'day_meal')).toBe(4);
  });

  it('rolls back entirely when the food has gone', () => {
    // Read inside the transaction, so a food deleted between the screen
    // opening and the save leaves nothing behind — not even a materialised day.
    expect(() =>
      addFoodEntry(database.db, {
        date: DAY,
        mealPosition: 0,
        foodId: 'ghost' as FoodId,
        quantity: baseQuantity(60),
      }),
    ).toThrow();

    expect(countRows(database.raw, 'day')).toBe(0);
    expect(countRows(database.raw, 'journal_entry')).toBe(0);
  });

  it('refuses a quantity that is not a positive number', () => {
    const id = aFood();
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        addFoodEntry(database.db, {
          date: DAY,
          mealPosition: 0,
          foodId: id,
          quantity: baseQuantity(value),
        }),
      ).toThrow();
    }
    expect(countRows(database.raw, 'day')).toBe(0);
  });
});

describe('correcting a logged quantity (specs 5.3)', () => {
  it('changes the quantity and nothing that was frozen', () => {
    // The capsule is NOT refreshed. Correcting "I had 60 g, not 50" must not
    // silently adopt macros edited since.
    const id = aFood();
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(50),
    });

    database.raw.prepare('UPDATE food SET protein_100 = 99 WHERE id = ?').run(id);
    updateFoodEntryQuantity(database.db, entryId, baseQuantity(60));

    const row = rowOf(entryId);
    expect(row['quantity']).toBe(60);
    expect(row['protein_100']).toBe(8);
    expect(readDayTotals(database.db, DAY).protein).toBeCloseTo(4.8, 10);
  });

  it('switches from base units to a portion, and back', () => {
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: aFood(),
      quantity: baseQuantity(60),
    });

    updateFoodEntryQuantity(database.db, entryId, portionQuantity(SLICE, 3));
    expect(rowOf(entryId)['quantity']).toBe(75);
    expect(rowOf(entryId)['portion_name']).toBe('tranche');

    updateFoodEntryQuantity(database.db, entryId, baseQuantity(40));
    expect(rowOf(entryId)['quantity']).toBe(40);
    expect(rowOf(entryId)['portion_name']).toBeNull();
    expect(rowOf(entryId)['portion_quantity']).toBeNull();
  });

  it('refuses to touch an entry that no longer exists', () => {
    expect(() =>
      updateFoodEntryQuantity(database.db, 'ghost' as JournalEntryId, baseQuantity(10)),
    ).toThrow();
  });
});

describe('a basket of entries, written at once (specs 8.4)', () => {
  it('writes foods and free entries together, in order', () => {
    const id = aFood();

    const ids = addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: id, quantity: portionQuantity(SLICE, 2) },
        { kind: 'free', name: 'Café', macros: { protein: 0, carbs: 0, fat: 0, kcal: 5 } },
        { kind: 'food', foodId: id, quantity: baseQuantity(30) },
      ],
    });

    expect(ids).toHaveLength(3);
    const rows = database.raw
      .prepare('SELECT kind, name, quantity, position FROM journal_entry ORDER BY position')
      .all() as { kind: string; name: string; quantity: number; position: number }[];

    expect(rows.map((row) => [row.kind, row.name, row.quantity])).toEqual([
      ['food', 'Pain de mie', 50],
      ['free', 'Café', 100],
      ['food', 'Pain de mie', 30],
    ]);
    // Positions continue rather than restart: order inside a meal is read from
    // this column, and three lines landing on 0 would be three lines in an
    // order nobody chose.
    expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it('appends after what the meal already holds', () => {
    const id = aFood();
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(10),
    });

    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'free', macros: { protein: 1, carbs: 1, fat: 1, kcal: 20 } }],
    });

    const positions = (
      database.raw
        .prepare('SELECT position FROM journal_entry ORDER BY position')
        .all() as { position: number }[]
    ).map((row) => row.position);
    expect(positions).toEqual([0, 1]);
  });

  it('writes the whole basket or none of it', () => {
    // THE REASON THE BASKET IS ONE TRANSACTION. The certificate expires weekly
    // and the application can be killed at any moment; half a meal is worse
    // than none, because none is visibly missing and half is not.
    const id = aFood();

    expect(() =>
      addEntries(database.db, {
        date: DAY,
        mealPosition: 0,
        entries: [
          { kind: 'food', foodId: id, quantity: baseQuantity(50) },
          { kind: 'food', foodId: 'ghost' as FoodId, quantity: baseQuantity(50) },
        ],
      }),
    ).toThrow();

    expect(countRows(database.raw, 'journal_entry')).toBe(0);
    // And the day itself is rolled back with them: a materialised day with
    // nothing in it is data created by consultation (specs 8.2).
    expect(countRows(database.raw, 'day')).toBe(0);
  });

  it('refuses the whole basket for one bad quantity, before opening anything', () => {
    const id = aFood();

    expect(() =>
      addEntries(database.db, {
        date: DAY,
        mealPosition: 0,
        entries: [
          { kind: 'food', foodId: id, quantity: baseQuantity(50) },
          { kind: 'food', foodId: id, quantity: baseQuantity(0) },
        ],
      }),
    ).toThrow();

    expect(countRows(database.raw, 'day')).toBe(0);
  });

  it('materialises nothing for an empty basket', () => {
    // Confirming with nothing chosen is not an action on the day, and specs 8.2
    // forbids anything but an action from creating one.
    expect(addEntries(database.db, { date: DAY, mealPosition: 0, entries: [] })).toEqual([]);
    expect(countRows(database.raw, 'day')).toBe(0);
  });

  it('totals the basket through the same clause-free sum', () => {
    const id = aFood();
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'food', foodId: id, quantity: portionQuantity(SLICE, 2) },
        { kind: 'free', macros: { protein: 0, carbs: 0, fat: 0, kcal: 5 } },
      ],
    });

    // 50 g at 265 kcal/100, plus a 5 kcal free entry.
    expect(readDayTotals(database.db, DAY).kcal).toBeCloseTo(137.5, 10);
  });
});

describe('what the journal screen reads back', () => {
  it('derives the total rather than storing it (D9)', () => {
    const entryId = addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: aFood(),
      quantity: portionQuantity(SLICE, 2),
    });

    const mealId = rowOf(entryId)['day_meal_id'] as never;
    const entries = readMealEntries(database.db, mealId);

    expect(entries[0]?.name).toBe('Pain de mie');
    expect(entries[0]?.quantity).toBe(50);
    expect(entries[0]?.reference?.protein).toBe(8);
    expect(entries[0]?.total?.protein).toBeCloseTo(4, 10);
  });
});
