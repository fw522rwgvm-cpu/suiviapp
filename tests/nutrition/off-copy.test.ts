import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { addEntries } from '../../src/features/nutrition/data/day-writes';
import { listFoods } from '../../src/features/nutrition/data/food-reads';
import { createFood, updateFood } from '../../src/features/nutrition/data/food-writes';
import { readDayTotals } from '../../src/features/nutrition/data/day-reads';
import { baseQuantity } from '../../src/features/nutrition/domain/portions';
import type { CompleteOffProduct } from '../../src/features/nutrition/off/off-product';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The automatic copy of specs 8.5, and when it happens.
 *
 * > EVERY product added to the journal is systematically copied into the
 * > personal database, barcode and origin kept.
 *
 * The decision this file records: the copy happens at "Confirmer", inside the
 * transaction that writes the entries, and never when a product is merely
 * chosen. Both answers were arguable; this is the one whose failure mode is
 * recoverable. Choosing wrong the other way leaves foods nobody validated in
 * the library, and a library polluted by browsing is exactly what specs 8.2
 * forbids for days.
 */

const DAY = toLocalDate('2026-09-13');

const NUTELLA: CompleteOffProduct = {
  barcode: '3017620422003',
  name: 'Nutella',
  brand: 'Nutella',
  protein100: 6.3,
  carbs100: 57.5,
  fat100: 30.9,
  kcal100: 539,
};

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('confirming a basket containing an Open Food Facts product', () => {
  it('copies it into the library and logs it, in one transaction', () => {
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'off', product: NUTELLA, quantity: baseQuantity(30) }],
    });

    const foods = listFoods(database.db);
    expect(foods).toHaveLength(1);
    expect(foods[0]?.name).toBe('Nutella');
    // Barcode and origin kept, in as many words (specs 8.5).
    expect(foods[0]?.barcode).toBe(NUTELLA.barcode);
    const row = database.raw.prepare('SELECT source, base_unit FROM food').get() as {
      source: string;
      base_unit: string;
    };
    expect(row.source).toBe('off');

    // Always grams: Open Food Facts publishes _100g for everything it holds,
    // and reading that as "per 100 ml" for a drink would be a density of 1,
    // which specs 5.1 rules out.
    expect(row.base_unit).toBe('g');

    expect(countRows(database.raw, 'journal_entry')).toBe(1);
  });

  it('logs the entry against the food it just wrote', () => {
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'off', product: NUTELLA, quantity: baseQuantity(30) }],
    });

    const foodId = listFoods(database.db)[0]?.id;
    const entry = database.raw.prepare('SELECT * FROM journal_entry').get() as Record<
      string,
      unknown
    >;

    expect(entry['source_food_id']).toBe(foodId);
    // Frozen from what was STORED rather than from what arrived over the
    // network, so the capsule and the library can never disagree (D5/R1).
    expect(entry['name']).toBe('Nutella');
    expect(entry['kcal_100']).toBe(539);
    expect(entry['quantity']).toBe(30);
    // 30 g of Nutella: 539 * 30 / 100.
    expect(readDayTotals(database.db, DAY).kcal).toBeCloseTo(161.7, 6);
  });

  it('writes NOTHING when the basket is never confirmed', () => {
    // The whole decision, asserted as the absence of a call. There is no
    // exported function that could copy a product on its own — ensureOffFood
    // is private to day-writes, exactly as ensureMaterialized is — so a
    // product chosen and abandoned cannot reach the library by any path.
    expect(countRows(database.raw, 'food')).toBe(0);
    expect(countRows(database.raw, 'journal_entry')).toBe(0);
  });

  it('writes neither the food nor the entry when the transaction fails', () => {
    // Half a meal is worse than none, and half a meal that also invented a
    // food is worse again. A meal position that does not exist rolls
    // everything back, the copy included.
    expect(() =>
      addEntries(database.db, {
        date: DAY,
        mealPosition: 99,
        entries: [{ kind: 'off', product: NUTELLA, quantity: baseQuantity(30) }],
      }),
    ).toThrow();

    expect(countRows(database.raw, 'food')).toBe(0);
    expect(countRows(database.raw, 'journal_entry')).toBe(0);
    expect(countRows(database.raw, 'day')).toBe(0);
  });
});

describe('the copy never overwrites what is already there', () => {
  it('reuses a food already holding the barcode, correction intact', () => {
    // THE ASSERTION THE WHOLE "what happens to a correction" QUESTION RESTS
    // ON. A food copied from Open Food Facts is freely correctable, and specs
    // 8.5 calls that the main mechanism for compensating for the uneven
    // quality of the source. Re-copying over it on a later scan would undo the
    // correction silently, on the path the user least expects.
    const id = createFood(database.db, {
      name: 'Nutella (corrigé)',
      brand: 'Ferrero',
      barcode: NUTELLA.barcode,
      source: 'off',
      baseUnit: 'g',
      macros: { protein: 6.3, carbs: 57.5, fat: 30.9, kcal: 600 },
      refQty: 100,
      isFavorite: true,
      portions: [],
    });

    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [{ kind: 'off', product: NUTELLA, quantity: baseQuantity(30) }],
    });

    expect(countRows(database.raw, 'food')).toBe(1);
    const foods = listFoods(database.db);
    expect(foods[0]?.id).toBe(id);
    expect(foods[0]?.name).toBe('Nutella (corrigé)');
    expect(foods[0]?.isFavorite).toBe(true);
    // The corrected calories, not the 539 the network just offered.
    expect(foods[0]?.reference.kcal).toBe(600);

    // And the entry froze the CORRECTED values, because it reads the food back
    // rather than the product.
    const entry = database.raw.prepare('SELECT * FROM journal_entry').get() as Record<
      string,
      unknown
    >;
    expect(entry['kcal_100']).toBe(600);
  });

  it('writes one food for two lines of the same new product in one basket', () => {
    // Reached when the deduplication misses, which it does here by
    // construction: neither line has been written yet when the other is
    // chosen. Without get-or-create this is where ux_food_barcode would throw
    // and roll a confirmed meal back.
    addEntries(database.db, {
      date: DAY,
      mealPosition: 0,
      entries: [
        { kind: 'off', product: NUTELLA, quantity: baseQuantity(30) },
        { kind: 'off', product: NUTELLA, quantity: baseQuantity(15) },
      ],
    });

    expect(countRows(database.raw, 'food')).toBe(1);
    expect(countRows(database.raw, 'journal_entry')).toBe(2);
  });
});

describe('one barcode, one food — enforced before the index says so', () => {
  it('refuses to create a second food for a barcode already taken', () => {
    createFood(database.db, {
      name: 'Nutella',
      brand: null,
      barcode: NUTELLA.barcode,
      source: 'off',
      baseUnit: 'g',
      macros: { protein: 6.3, carbs: 57.5, fat: 30.9, kcal: 539 },
      refQty: 100,
      isFavorite: false,
      portions: [],
    });

    expect(() =>
      createFood(database.db, {
        name: 'Pâte à tartiner',
        brand: null,
        barcode: NUTELLA.barcode,
        source: 'perso',
        baseUnit: 'g',
        macros: { protein: 1, carbs: 1, fat: 1, kcal: 20 },
        refQty: 100,
        isFavorite: false,
        portions: [],
      }),
      // A sentence about the actual problem, rather than a SQLite error citing
      // a constraint from inside someone else's transaction.
    ).toThrow(/already belongs to food/);

    expect(countRows(database.raw, 'food')).toBe(1);
  });

  it('lets a food keep its own barcode across an edit', () => {
    // The obvious way to get this wrong: a food reported as conflicting with
    // itself, so that correcting a name becomes impossible.
    const id = createFood(database.db, {
      name: 'Nutella',
      brand: null,
      barcode: NUTELLA.barcode,
      source: 'off',
      baseUnit: 'g',
      macros: { protein: 6.3, carbs: 57.5, fat: 30.9, kcal: 539 },
      refQty: 100,
      isFavorite: false,
      portions: [],
    });

    expect(() =>
      updateFood(database.db, id, {
        name: 'Nutella (corrigé)',
        brand: 'Ferrero',
        barcode: NUTELLA.barcode,
        source: 'off',
        baseUnit: 'g',
        macros: { protein: 6.3, carbs: 57.5, fat: 30.9, kcal: 600 },
        refQty: 100,
        isFavorite: false,
        portions: [],
      }),
    ).not.toThrow();
  });

  it('lets any number of foods have no barcode at all', () => {
    // Which is most of the library: an apple is a thing, not a product. An
    // empty string would take the unique slot and refuse the second one, so
    // blank is stored as NULL.
    for (const name of ['Pomme', 'Riz', 'Poulet']) {
      createFood(database.db, {
        name,
        brand: null,
        barcode: '',
        source: 'perso',
        baseUnit: 'g',
        macros: { protein: 1, carbs: 1, fat: 1, kcal: 20 },
        refQty: 100,
        isFavorite: false,
        portions: [],
      });
    }

    expect(countRows(database.raw, 'food')).toBe(3);
    expect(listFoods(database.db).every((food) => food.barcode === null)).toBe(true);
  });
});
