import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate, type LocalDate } from '../../src/core/date';
import { dayMeal } from '../../src/core/db/schema';
import {
  readDailyTargets,
  readDailyTotals,
  readDay,
  readDayTotals,
} from '../../src/features/nutrition/data/day-reads';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import {
  createTemplate,
  setDefaultTemplate,
} from '../../src/features/nutrition/data/planning-writes';
import { dayTargets } from '../../src/features/nutrition/domain/day-plan';
import { seedJournal } from '../../src/dev/seed';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * THE SAME QUESTION, ASKED TWICE, AND HELD EQUAL BY THIS FILE.
 *
 * Slice 7 gives the statistics panel its own reads: one grouped query for what
 * was eaten each day, one for what each day was aiming at. The Journal already
 * answers both questions for a single day, in different code — readDayTotals
 * for the first, readDay plus dayTargets for the second.
 *
 * Two implementations of one question is exactly what amendment 9.6 no 11
 * records the cost of, when recipe sums ended up computed in SQL and in
 * TypeScript. Neither is removable there and neither is removable here: a
 * per-day read is right for one day and impossible for ninety, and a grouped
 * read cannot serve a screen that holds one day's meals in hand.
 *
 * So what keeps them equal is not care, it is this file.
 *
 * ## THE CASE THAT ACTUALLY DECIDES IT
 *
 * readTargets treats a meal's four target columns as ALL FOUR OR NONE, because
 * a partial set is a goal nobody could read. SQL does not agree on its own:
 * sum(target_protein) cheerfully ignores the NULLs in the other three and
 * returns a protein goal for a meal the Journal says has none.
 *
 * Nothing this application writes produces such a row, and day_meal has no
 * CHECK to stop one (amendment 14.6 no 16 says why it never will) — so an
 * archive repaired by hand can. The last test here writes that row directly
 * and demands the two readings still agree.
 */

const TODAY = toLocalDate('2026-09-14');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

/** Every date of a range, so the comparison is over gaps as well as rows. */
function datesFrom(first: LocalDate, count: number): LocalDate[] {
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

describe('over a generated history', () => {
  it('agrees with readDayTotals, day by day, including the empty ones', () => {
    const report = seedJournal(database.db, { endDate: TODAY, days: 120, seed: 7 });
    // A realistic history has holes in it — the generator's coverage is 0.85 —
    // and the holes are half of what is being checked.
    expect(report.days).toBeLessThan(120);

    const from = addDays(TODAY, -119);
    const grouped = readDailyTotals(database.db, from, TODAY);

    for (const date of datesFrom(from, 120)) {
      const one = readDayTotals(database.db, date);
      const many = grouped.get(date) ?? null;

      if (many === null) {
        // No row at all means nothing was logged, which readDayTotals reports
        // as four zeros. The two ARE the same answer, in two shapes.
        expect(one).toEqual({ protein: 0, carbs: 0, fat: 0, kcal: 0 });
        continue;
      }

      expect(many.protein).toBeCloseTo(one.protein, 9);
      expect(many.carbs).toBeCloseTo(one.carbs, 9);
      expect(many.fat).toBeCloseTo(one.fat, 9);
      expect(many.kcal).toBeCloseTo(one.kcal, 9);
    }
  });

  it('agrees with readDay + dayTargets, day by day', () => {
    // The generator creates no template, so a history alone has no goals at
    // all — which is a real state, and also a useless one to compare. One
    // template, made the default, gives every day it materialises a goal.
    const templateId = createTemplate(database.db, {
      name: 'Jour ordinaire',
      meals: [
        {
          name: 'Petit-déjeuner',
          targets: { protein: 30, carbs: 60, fat: 15, kcal: 500 },
        },
        { name: 'Déjeuner', targets: { protein: 50, carbs: 90, fat: 25, kcal: 800 } },
        { name: 'Dîner', targets: { protein: 50, carbs: 80, fat: 25, kcal: 750 } },
        // No goal on this one, deliberately: specs 14.6 no 10 allows it, and it
        // is what makes a day's goal PARTIAL — the case both readings have to
        // treat the same way.
        { name: 'Collation', targets: null },
      ],
    });
    setDefaultTemplate(database.db, templateId);

    seedJournal(database.db, { endDate: TODAY, days: 120, seed: 11 });

    const from = addDays(TODAY, -119);
    const grouped = readDailyTargets(database.db, from, TODAY);

    for (const date of datesFrom(from, 120)) {
      const one = dayTargets(readDay(database.db, date).meals);
      const many = grouped.get(date) ?? null;

      // A virtual day resolves a goal from the planning; the grouped read only
      // ever sees day_meal rows. So they are compared where both apply: on the
      // days that actually exist.
      if (!readDay(database.db, date).materialized) continue;

      if (one === null) {
        expect(many).toBeNull();
        continue;
      }

      expect(many).not.toBeNull();
      expect(many?.protein).toBeCloseTo(one.protein, 9);
      expect(many?.carbs).toBeCloseTo(one.carbs, 9);
      expect(many?.fat).toBeCloseTo(one.fat, 9);
      expect(many?.kcal).toBeCloseTo(one.kcal, 9);
    }
  });
});

describe('a row this application would never write', () => {
  it('reads a partially targeted meal as having NO goal, on both sides', () => {
    // Three of the four columns filled. The Journal says "no goal"; a naive
    // sum(target_protein) would say "60 g of protein and nothing else", which
    // is a goal nobody set, on a day that would then be judged against it.
    addFreeEntry(database.db, {
      date: TODAY,
      mealPosition: 0,
      name: 'Quelque chose',
      macros: { protein: 10, carbs: 20, fat: 5, kcal: 160 },
    });

    const meals = database.db.select().from(dayMeal).all();
    const first = meals[0];
    expect(first).toBeDefined();

    database.raw
      .prepare(
        'UPDATE day_meal SET target_protein = 60, target_carbs = 100, target_fat = 20 WHERE id = ?',
      )
      .run(first?.id);

    expect(dayTargets(readDay(database.db, TODAY).meals)).toBeNull();
    expect(readDailyTargets(database.db, TODAY, TODAY).get(TODAY)).toBeUndefined();
  });

  it('still sums the meals that ARE complete beside a broken one', () => {
    addFreeEntry(database.db, {
      date: TODAY,
      mealPosition: 0,
      name: 'Quelque chose',
      macros: { protein: 10, carbs: 20, fat: 5, kcal: 160 },
    });

    const meals = database.db.select().from(dayMeal).all();
    const [broken, whole] = meals;
    expect(whole).toBeDefined();

    database.raw
      .prepare('UPDATE day_meal SET target_protein = 60 WHERE id = ?')
      .run(broken?.id);
    database.raw
      .prepare(
        'UPDATE day_meal SET target_protein = ?, target_carbs = ?, target_fat = ?, target_kcal = ? WHERE id = ?',
      )
      .run(50, 90, 25, 800, whole?.id);

    const fromJournal = dayTargets(readDay(database.db, TODAY).meals);
    const fromStats = readDailyTargets(database.db, TODAY, TODAY).get(TODAY);

    expect(fromJournal).toEqual({ protein: 50, carbs: 90, fat: 25, kcal: 800 });
    expect(fromStats).toEqual(fromJournal);
  });
});
