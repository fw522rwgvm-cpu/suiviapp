import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { FoodId } from '../../src/core/db/schema';
import {
  createFood,
  deleteFood,
  setFoodFavorite,
  updateFood,
} from '../../src/features/nutrition/data/food-writes';
import { readFood, readFoodDraft } from '../../src/features/nutrition/data/food-reads';
import { addFoodEntry } from '../../src/features/nutrition/data/day-writes';
import { readDayTotals } from '../../src/features/nutrition/data/day-reads';
import { emptyFoodDraft, type FoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { baseQuantity } from '../../src/features/nutrition/domain/portions';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The food write layer, against a real SQLite file (D15).
 *
 * The invariants worth the file are the ones specs 5.3 states and that nothing
 * in the type system can hold: that editing a food does not rewrite history,
 * that deleting one is never blocked and never destroys anything, and that
 * display_ref_qty cannot move a single total.
 */

const DAY = toLocalDate('2026-09-11');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function bread(overrides: Partial<FoodDraft> = {}): FoodDraft {
  return {
    ...emptyFoodDraft(),
    name: 'Pain de mie',
    brand: 'Sans marque',
    macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
    portions: [{ id: null, name: 'tranche', quantity: 25 }],
    ...overrides,
  };
}

describe('creating a food', () => {
  it('stores the macros canonically and the reference quantity beside them', () => {
    const id = createFood(
      database.db,
      bread({ refQty: 30, macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 } }),
    );

    const stored = readFood(database.db, id);
    // For 100 base units, whatever was typed against (specs 6.1 v2.2).
    expect(stored?.reference.protein).toBeCloseTo(8, 10);
    expect(stored?.reference.kcal).toBeCloseTo(265, 10);
    // And the preference is kept, without normative value.
    expect(stored?.displayRefQty).toBe(30);
  });

  it('writes the food and its portions in one transaction', () => {
    createFood(database.db, bread({ portions: [
      { id: null, name: 'tranche', quantity: 25 },
      { id: null, name: 'bol', quantity: 250 },
    ] }));

    expect(countRows(database.raw, 'food')).toBe(1);
    expect(countRows(database.raw, 'food_portion')).toBe(2);
  });

  it('numbers portions from the order of the list', () => {
    const id = createFood(database.db, bread({ portions: [
      { id: null, name: 'bol', quantity: 250 },
      { id: null, name: 'tranche', quantity: 25 },
    ] }));

    expect(readFood(database.db, id)?.portions.map((portion) => portion.name)).toEqual([
      'bol',
      'tranche',
    ]);
  });

  it('stores an absent brand as NULL, not as an empty string', () => {
    // Empty and absent are the same thing to a reader and two different things
    // in the database — the same trap the round-trip test found in slice 2.
    const id = createFood(database.db, bread({ brand: '   ' }));
    expect(readFood(database.db, id)?.brand).toBeNull();
  });

  it('refuses a draft the editor would not have let through', () => {
    // A caller bug rather than an expected failure: the button is disabled on
    // exactly these problems. Throwing also rolls the transaction back.
    expect(() => createFood(database.db, bread({ name: '' }))).toThrow();
    expect(() => createFood(database.db, bread({ refQty: 0 }))).toThrow();
    expect(countRows(database.raw, 'food')).toBe(0);
  });
});

describe('editing a food', () => {
  it('survives two portions swapping names in one edit', () => {
    // THE CASE THAT DECIDES HOW PORTIONS ARE WRITTEN.
    //
    // ux_portion_food_name is unique on (food_id, name). Any row-by-row update
    // collides here: whichever is written first takes a name the other still
    // holds. Replacing them wholesale makes the case stop existing.
    const id = createFood(database.db, bread({ portions: [
      { id: null, name: 'tranche', quantity: 25 },
      { id: null, name: 'bol', quantity: 250 },
    ] }));

    const stored = readFoodDraft(database.db, id);
    expect(stored).not.toBeNull();
    if (stored === null) return;

    expect(() =>
      updateFood(database.db, id, {
        ...stored,
        portions: [
          { id: stored.portions[0]?.id ?? null, name: 'bol', quantity: 25 },
          { id: stored.portions[1]?.id ?? null, name: 'tranche', quantity: 250 },
        ],
      }),
    ).not.toThrow();

    const after = readFood(database.db, id);
    expect(after?.portions.map((portion) => [portion.name, portion.quantity])).toEqual([
      ['bol', 25],
      ['tranche', 250],
    ]);
  });

  it('removes a portion that the draft no longer carries', () => {
    const id = createFood(database.db, bread());
    const stored = readFoodDraft(database.db, id);
    if (stored === null) throw new Error('fixture');

    updateFood(database.db, id, { ...stored, portions: [] });

    expect(countRows(database.raw, 'food_portion')).toBe(0);
  });

  it('leaves every past journal entry exactly as it was frozen', () => {
    // D5/R1 and specs 5.2: an entry froze its reference, so editing the food
    // cannot rewrite what was eaten. Testable for the first time in slice 3.
    const id = createFood(database.db, bread());
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(60),
    });

    const before = readDayTotals(database.db, DAY);
    const stored = readFoodDraft(database.db, id);
    if (stored === null) throw new Error('fixture');

    updateFood(database.db, id, {
      ...stored,
      name: 'Pain de mie complet',
      macros: { protein: 99, carbs: 99, fat: 99, kcal: 999 },
    });

    expect(readDayTotals(database.db, DAY)).toEqual(before);
    const entry = database.raw.prepare('SELECT * FROM journal_entry').get() as Record<
      string,
      unknown
    >;
    expect(entry['name']).toBe('Pain de mie');
    expect(entry['protein_100']).toBe(8);
  });

  it('cannot move a total by changing the reference quantity alone (D9)', () => {
    // THE ASSERTION THAT MAKES THE display_ref_qty FENCE FALSIFIABLE rather
    // than merely intended. If anything ever derives a stored value from this
    // preference, it fails here.
    const id = createFood(database.db, bread());
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(60),
    });

    const before = readDayTotals(database.db, DAY);
    const stored = readFoodDraft(database.db, id);
    if (stored === null) throw new Error('fixture');

    // Same food, same canonical macros, typed against 30 g instead of 100 g.
    updateFood(database.db, id, {
      ...stored,
      refQty: 30,
      macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 },
    });

    expect(readDayTotals(database.db, DAY)).toEqual(before);
    expect(readFood(database.db, id)?.reference.protein).toBeCloseTo(8, 10);
  });

  it('refuses to update a food that does not exist', () => {
    expect(() => updateFood(database.db, 'ghost' as FoodId, bread())).toThrow();
  });
});

describe('deleting a food', () => {
  it('takes its portions with it and nothing else', () => {
    const id = createFood(database.db, bread());
    deleteFood(database.db, id);

    expect(countRows(database.raw, 'food')).toBe(0);
    expect(countRows(database.raw, 'food_portion')).toBe(0);
  });

  it('is never blocked, and leaves past entries intact (specs 5.3)', () => {
    // The reason source_food_id carries no foreign key. With a cascade this
    // would destroy history; with a restrict it would refuse.
    const id = createFood(database.db, bread());
    addFoodEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      foodId: id,
      quantity: baseQuantity(60),
    });
    const before = readDayTotals(database.db, DAY);

    expect(() => deleteFood(database.db, id)).not.toThrow();

    expect(readDayTotals(database.db, DAY)).toEqual(before);
    const entry = database.raw.prepare('SELECT * FROM journal_entry').get() as Record<
      string,
      unknown
    >;
    expect(entry['name']).toBe('Pain de mie');
    // The dangling link is KEPT rather than nulled: it is the only trace tying
    // this entry to what it once was.
    expect(entry['source_food_id']).toBe(id);
  });
});

describe('favourites', () => {
  it('flips without touching anything else', () => {
    const id = createFood(database.db, bread());
    expect(readFood(database.db, id)?.isFavorite).toBe(false);

    setFoodFavorite(database.db, id, true);
    expect(readFood(database.db, id)?.isFavorite).toBe(true);
    expect(readFood(database.db, id)?.name).toBe('Pain de mie');

    setFoodFavorite(database.db, id, false);
    expect(readFood(database.db, id)?.isFavorite).toBe(false);
  });

  it('SURVIVES A LATER SAVE THAT STILL CARRIES THE OLD FLAG', () => {
    // The one that bit. The star acts at once, from the list or from the
    // editor's header; the editor's draft was loaded before that tap and goes
    // on holding whatever the flag was then. If a save wrote it back, marking
    // a favourite and then correcting a typo would silently unmark it -- and
    // nobody would connect the two.
    const stale = bread({ isFavorite: false });
    const id = createFood(database.db, stale);

    setFoodFavorite(database.db, id, true);
    updateFood(database.db, id, { ...stale, name: 'Pain de mie complet' });

    expect(readFood(database.db, id)?.isFavorite).toBe(true);
    expect(readFood(database.db, id)?.name).toBe('Pain de mie complet');
  });

  it('is still what creation was told, since a new food has no row to flip', () => {
    const id = createFood(database.db, bread({ isFavorite: true }));
    expect(readFood(database.db, id)?.isFavorite).toBe(true);
  });

  it('stores 0 and 1, never a boolean', () => {
    // A boolean would reach the exporter, which throws on anything that is not
    // a string, a finite number or null.
    const id = createFood(database.db, bread({ isFavorite: true }));
    const row = database.raw
      .prepare('SELECT is_favorite FROM food WHERE id = ?')
      .get(id) as { is_favorite: unknown };

    expect(row.is_favorite).toBe(1);
    expect(typeof row.is_favorite).toBe('number');
  });
});
