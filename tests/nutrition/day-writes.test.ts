import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import {
  readDay,
  readDayTotals,
  readMealEntries,
  readMealTotals,
} from '../../src/features/nutrition/data/day-reads';
import {
  addFreeEntry,
  addMeal,
  deleteEntry,
  deleteMeal,
  FREE_ENTRY_DEFAULT_NAME,
  renameMeal,
  updateFreeEntry,
} from '../../src/features/nutrition/data/day-writes';
import { DEFAULT_MEAL_NAMES, virtualDay } from '../../src/features/nutrition/domain/day-plan';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Invariants of the access layer (D15, fifth by value).
 *
 * Two of these carry the weight of specs 8.2, and neither is visible on
 * screen: that reading never materialises a day, and that a write which fails
 * halfway leaves nothing behind.
 */

const DATE = toLocalDate('2026-09-11');
const LUNCH = 1;

const OMELETTE = { protein: 20, carbs: 2, fat: 15, kcal: 230 };

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

describe('navigation never materialises a day', () => {
  it('creates nothing while three months of history are browsed', () => {
    // Specs 8.2, in as many words: swiping through three months of history
    // creates no data. This is the test that says so.
    for (let offset = -90; offset <= 0; offset += 1) {
      const date = addDays(DATE, offset);
      readDay(fixture.db, date);
      readDayTotals(fixture.db, date);
      readMealTotals(fixture.db, date);
    }

    expect(countRows(fixture.raw, 'day')).toBe(0);
    expect(countRows(fixture.raw, 'day_meal')).toBe(0);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(0);
  });

  it('reads a date with no row as a virtual day, identical to the rendered plan', () => {
    expect(readDay(fixture.db, DATE)).toEqual(virtualDay(DATE));
    expect(readDayTotals(fixture.db, DATE)).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
      kcal: 0,
    });
  });

  it('reads the future the same way, without limit', () => {
    // Navigating and logging on future dates is allowed without limit
    // (specs 8.2), and consulting one must still create nothing.
    const future = addDays(DATE, 400);
    expect(readDay(fixture.db, future).materialized).toBe(false);
    expect(countRows(fixture.raw, 'day')).toBe(0);
  });
});

describe('addFreeEntry', () => {
  it('materialises the day on the first entry, and only once', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });

    expect(countRows(fixture.raw, 'day')).toBe(1);
    expect(countRows(fixture.raw, 'day_meal')).toBe(DEFAULT_MEAL_NAMES.length);

    addFreeEntry(fixture.db, { date: DATE, mealPosition: 0, macros: OMELETTE });

    expect(countRows(fixture.raw, 'day')).toBe(1);
    expect(countRows(fixture.raw, 'day_meal')).toBe(DEFAULT_MEAL_NAMES.length);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(2);
  });

  it('snapshots the day with no template, since none exists before slice 5', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });

    const row = fixture.raw
      .prepare('SELECT template_id_snapshot, template_name_snapshot, materialized_at FROM day')
      .get() as {
      template_id_snapshot: string | null;
      template_name_snapshot: string | null;
      materialized_at: number;
    };

    expect(row.template_id_snapshot).toBeNull();
    expect(row.template_name_snapshot).toBeNull();
    expect(row.materialized_at).toBeGreaterThan(0);
  });

  it('gives the materialised day exactly the meals the virtual one showed', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });

    const materialised = readDay(fixture.db, DATE);
    expect(materialised.materialized).toBe(true);
    expect(materialised.meals.map((meal) => meal.name)).toEqual(
      virtualDay(DATE).meals.map((meal) => meal.name),
    );
    expect(materialised.meals.map((meal) => meal.position)).toEqual([0, 1, 2, 3]);
  });

  it('lands in the meal the position named, not the first one', () => {
    // On a virtual day meals have no identifier, so writes address them by
    // position. Getting this wrong would put every entry in the first meal.
    addFreeEntry(fixture.db, { date: DATE, mealPosition: 2, macros: OMELETTE });

    const perMeal = readMealTotals(fixture.db, DATE);
    const dinner = readDay(fixture.db, DATE).meals.find((meal) => meal.position === 2);

    expect(dinner?.id).not.toBeNull();
    expect(perMeal.size).toBe(1);
    expect(perMeal.get(dinner!.id!)).toEqual(OMELETTE);
  });

  it('totals to exactly what was typed in', () => {
    // Stored as 100 units of a virtual food (D5/R2), so the total comes out of
    // the same expression as every other row, with no special case.
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });
    expect(readDayTotals(fixture.db, DATE)).toEqual(OMELETTE);
  });

  it('stores the reference and the quantity, never the total (D5/R1)', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });

    const row = fixture.raw
      .prepare('SELECT kind, quantity, base_unit, protein_100, kcal_100 FROM journal_entry')
      .get() as {
      kind: string;
      quantity: number;
      base_unit: string;
      protein_100: number;
      kcal_100: number;
    };

    expect(row.kind).toBe('free');
    expect(row.quantity).toBe(100);
    expect(row.base_unit).toBe('g');
    expect(row.protein_100).toBe(OMELETTE.protein);
    expect(row.kcal_100).toBe(OMELETTE.kcal);
  });

  it('names an unnamed entry rather than refusing it', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });
    addFreeEntry(fixture.db, {
      date: DATE,
      mealPosition: LUNCH,
      name: '   ',
      macros: OMELETTE,
    });
    addFreeEntry(fixture.db, {
      date: DATE,
      mealPosition: LUNCH,
      name: '  Omelette ',
      macros: OMELETTE,
    });

    const meal = readDay(fixture.db, DATE).meals[LUNCH]!;
    expect(readMealEntries(fixture.db, meal.id!).map((entry) => entry.name)).toEqual([
      FREE_ENTRY_DEFAULT_NAME,
      FREE_ENTRY_DEFAULT_NAME,
      'Omelette',
    ]);
  });

  it('keeps entries in the order they were logged', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, name: 'A', macros: OMELETTE });
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, name: 'B', macros: OMELETTE });
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, name: 'C', macros: OMELETTE });

    const meal = readDay(fixture.db, DATE).meals[LUNCH]!;
    expect(readMealEntries(fixture.db, meal.id!).map((entry) => entry.name)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('stores the date it was handed, whatever the timezone', () => {
    // The suite runs under UTC, America/New_York and Pacific/Kiritimati. A
    // civil date that survived a Date constructor somewhere would land a day
    // out in one of them.
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });
    const row = fixture.raw.prepare('SELECT date FROM journal_entry').get() as {
      date: string;
    };
    expect(row.date).toBe('2026-09-11');
  });

  it('leaves nothing behind when it fails halfway', () => {
    // The strongest form of specs 8.2: materialisation is never a standalone
    // operation. It is the first statement of the write that justifies it, in
    // the same transaction, so a write that cannot complete takes the
    // materialisation down with it rather than leaving an empty day that
    // nobody asked for.
    expect(() =>
      addFreeEntry(fixture.db, { date: DATE, mealPosition: 99, macros: OMELETTE }),
    ).toThrow();

    expect(countRows(fixture.raw, 'day')).toBe(0);
    expect(countRows(fixture.raw, 'day_meal')).toBe(0);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(0);
  });
});

describe('editing and deleting', () => {
  it('corrects an entry without any time limit', () => {
    const id = addFreeEntry(fixture.db, {
      date: DATE,
      mealPosition: LUNCH,
      name: 'Omelette',
      macros: OMELETTE,
    });

    updateFreeEntry(fixture.db, {
      entryId: id,
      name: 'Omelette 3 oeufs',
      macros: { protein: 30, carbs: 3, fat: 22, kcal: 340 },
    });

    expect(readDayTotals(fixture.db, DATE)).toEqual({
      protein: 30,
      carbs: 3,
      fat: 22,
      kcal: 340,
    });
    const meal = readDay(fixture.db, DATE).meals[LUNCH]!;
    expect(readMealEntries(fixture.db, meal.id!)[0]?.name).toBe('Omelette 3 oeufs');
  });

  it('refuses to silently update an entry that is not there', () => {
    const id = addFreeEntry(fixture.db, {
      date: DATE,
      mealPosition: LUNCH,
      macros: OMELETTE,
    });
    deleteEntry(fixture.db, id);

    expect(() => updateFreeEntry(fixture.db, { entryId: id, macros: OMELETTE })).toThrow();
  });

  it('deletes an entry and leaves the day materialised', () => {
    const id = addFreeEntry(fixture.db, {
      date: DATE,
      mealPosition: LUNCH,
      macros: OMELETTE,
    });
    deleteEntry(fixture.db, id);

    // The day stays: the user did act on it. Slice 7 will count days with at
    // least one entry for adherence, not days that exist (specs 8.7).
    expect(countRows(fixture.raw, 'day')).toBe(1);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(0);
    expect(readDayTotals(fixture.db, DATE)).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
      kcal: 0,
    });
  });
});

describe('meals of a day', () => {
  it('renames a meal, materialising the day on the way', () => {
    renameMeal(fixture.db, { date: DATE, mealPosition: 3, name: 'Collation du soir' });

    expect(countRows(fixture.raw, 'day')).toBe(1);
    expect(readDay(fixture.db, DATE).meals[3]?.name).toBe('Collation du soir');
  });

  it('appends a meal after the last position', () => {
    addMeal(fixture.db, { date: DATE, name: 'Pré-entraînement' });

    const meals = readDay(fixture.db, DATE).meals;
    expect(meals).toHaveLength(DEFAULT_MEAL_NAMES.length + 1);
    expect(meals.at(-1)?.name).toBe('Pré-entraînement');
    expect(meals.at(-1)?.position).toBe(DEFAULT_MEAL_NAMES.length);
  });

  it('takes a meal down with everything logged in it', () => {
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });
    addFreeEntry(fixture.db, { date: DATE, mealPosition: 0, macros: OMELETTE });

    deleteMeal(fixture.db, { date: DATE, mealPosition: LUNCH });

    expect(readDay(fixture.db, DATE).meals).toHaveLength(DEFAULT_MEAL_NAMES.length - 1);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);
    expect(readDayTotals(fixture.db, DATE)).toEqual(OMELETTE);
  });

  it('keeps a day that has lost every one of its meals', () => {
    for (const position of [3, 2, 1, 0]) {
      deleteMeal(fixture.db, { date: DATE, mealPosition: position });
    }

    const stripped = readDay(fixture.db, DATE);
    // Materialised with no meal at all: its day row, not its meal count, is
    // what says it exists. Reading it must not fall back to the virtual plan
    // and silently hand back four meals that were deleted on purpose.
    expect(stripped.materialized).toBe(true);
    expect(stripped.meals).toHaveLength(0);
  });
});

describe('days do not leak into each other', () => {
  it('totals only the date asked for', () => {
    const eve = addDays(DATE, -1);
    addFreeEntry(fixture.db, { date: DATE, mealPosition: LUNCH, macros: OMELETTE });
    addFreeEntry(fixture.db, {
      date: eve,
      mealPosition: LUNCH,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 10 },
    });

    expect(readDayTotals(fixture.db, DATE)).toEqual(OMELETTE);
    expect(readDayTotals(fixture.db, eve)).toEqual({
      protein: 1,
      carbs: 1,
      fat: 1,
      kcal: 10,
    });
  });
});
