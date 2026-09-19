import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import { seedJournal } from '../../src/dev/seed';
import { createRandom } from '../../src/dev/seed/random';
import { readDay, readDayTotals } from '../../src/features/nutrition/data/day-reads';
import { listExercises } from '../../src/features/strength/data/exercise-reads';
import { EXERCISE_CATALOG } from '../../src/features/strength/catalog/exercises';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The demo data generator (D15).
 *
 * It exists to be trusted by three other things — migration replay on a
 * populated database, performance checks on long histories, and bug
 * reproduction — so what is worth testing is that it produces the same
 * database twice, and one shaped like a real one.
 */

const END = toLocalDate('2026-09-11');

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

describe('createRandom', () => {
  it('replays the same sequence from the same seed', () => {
    const first = createRandom(42);
    const second = createRandom(42);
    const draws = Array.from({ length: 20 }, () => first.next());
    expect(draws).toEqual(Array.from({ length: 20 }, () => second.next()));
  });

  it('draws a different sequence from a different seed', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('stays inside its bounds', () => {
    const random = createRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = random.between(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });
});

describe('seedJournal', () => {
  it('produces the same history twice over', () => {
    // Without this, "reproduce a bug without exposing real data" is a promise
    // the generator cannot keep.
    const other = openTestDatabase();
    try {
      seedJournal(fixture.db, { endDate: END, days: 40, seed: 99 });
      seedJournal(other.db, { endDate: END, days: 40, seed: 99 });

      const dump = (target: TestDatabase): unknown[] =>
        target.raw
          .prepare(
            'SELECT date, kind, name, quantity, protein_100, carbs_100, fat_100, kcal_100 FROM journal_entry ORDER BY date, position, name',
          )
          .all();

      expect(dump(fixture)).toEqual(dump(other));
      expect(countRows(fixture.raw, 'journal_entry')).toBeGreaterThan(0);
    } finally {
      other.close();
    }
  });

  it('leaves some days unwritten, as a real history does', () => {
    // Specs 8.7 excludes days that were never filled in from the adherence
    // rate. A generator that filled every single day would hide that case from
    // the statistics of slice 7.
    const report = seedJournal(fixture.db, { endDate: END, days: 120, seed: 3 });
    expect(report.days).toBeLessThan(120);
    expect(report.days).toBeGreaterThan(60);
    expect(countRows(fixture.raw, 'day')).toBe(report.days);
  });

  it('materialises only the days it wrote to', () => {
    seedJournal(fixture.db, { endDate: END, days: 30, seed: 5 });

    // Every materialised day must hold at least one entry: the generator goes
    // through the ordinary writes, so a bare day would mean materialisation
    // leaked outside an action.
    const empty = fixture.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM day
          WHERE NOT EXISTS (SELECT 1 FROM journal_entry WHERE journal_entry.date = day.date)`,
      )
      .get() as { n: number };
    expect(empty.n).toBe(0);
  });

  it('writes days that read back exactly as the application stores them', () => {
    seedJournal(fixture.db, { endDate: END, days: 10, seed: 11 });

    const dates = (
      fixture.raw.prepare('SELECT date FROM day ORDER BY date').all() as { date: string }[]
    ).map((row) => toLocalDate(row.date));

    for (const date of dates) {
      const day = readDay(fixture.db, date);
      expect(day.materialized).toBe(true);
      expect(day.meals.length).toBeGreaterThan(0);

      const totals = readDayTotals(fixture.db, date);
      expect(totals.kcal).toBeGreaterThan(0);
    }
  });

  it('stays within the range it was given', () => {
    const report = seedJournal(fixture.db, { endDate: END, days: 30, seed: 13 });
    expect(report.firstDate).toBe(addDays(END, -29));

    const bounds = fixture.raw
      .prepare('SELECT MIN(date) AS first, MAX(date) AS last FROM journal_entry')
      .get() as { first: string; last: string };

    expect(bounds.first >= addDays(END, -29)).toBe(true);
    expect(bounds.last <= END).toBe(true);
  });

  it('creates a personal food database, with portions and favourites', () => {
    // Quick access — favourites then recents (specs 8.4a) — has nothing to
    // show on a fresh installation, so without this the one screen slice 3 is
    // built around cannot be looked at on the device at all.
    const report = seedJournal(fixture.db, { endDate: END, days: 20, seed: 21 });

    expect(report.foods).toBeGreaterThan(0);
    expect(countRows(fixture.raw, 'food')).toBe(report.foods);
    expect(countRows(fixture.raw, 'food_portion')).toBeGreaterThan(0);

    const favourites = fixture.raw
      .prepare('SELECT COUNT(*) AS n FROM food WHERE is_favorite = 1')
      .get() as { n: number };
    expect(favourites.n).toBeGreaterThan(0);

    // Both base units, so the watertightness of specs 5.1 has something to be
    // watertight about.
    const units = (
      fixture.raw.prepare('SELECT DISTINCT base_unit FROM food ORDER BY base_unit').all() as {
        base_unit: string;
      }[]
    ).map((row) => row.base_unit);
    expect(units).toEqual(['g', 'ml']);
  });

  it('reuses the food catalogue on a second run instead of duplicating it', () => {
    // The button in Settings says "nothing is erased" and can be pressed twice
    // — thirty days stacked on top of ninety is a reasonable thing to want.
    // Entries accumulating is the point; six foods becoming twelve under two
    // sets of identical names is not: quick access would show every food
    // twice, and the recents would split between two rows for the same bread.
    const first = seedJournal(fixture.db, { endDate: END, days: 20, seed: 31 });
    const second = seedJournal(fixture.db, { endDate: END, days: 20, seed: 37 });

    expect(countRows(fixture.raw, 'food')).toBe(first.foods);
    expect(second.foods).toBe(first.foods);

    const names = fixture.raw
      .prepare('SELECT name, COUNT(*) AS n FROM food GROUP BY name HAVING n > 1')
      .all();
    expect(names).toEqual([]);

    // Portions are not duplicated either — they would have been, had the
    // second run created a second set of foods to hang them from.
    const portions = fixture.raw
      .prepare(
        'SELECT food_id, name, COUNT(*) AS n FROM food_portion GROUP BY food_id, name HAVING n > 1',
      )
      .all();
    expect(portions).toEqual([]);

    // And the entries really did accumulate, which is what makes the two runs
    // worth allowing at all.
    expect(countRows(fixture.raw, 'journal_entry')).toBe(first.entries + second.entries);
  });

  it('creates an exercise database and two routines, one a superset', () => {
    /**
     * The superset is the point of seeding routines at all. It is the shape
     * where the rest moves from the line to the block, and having one in the
     * development data means the page and the editor meet it every time rather
     * than only when somebody remembers to build one.
     */
    const report = seedJournal(fixture.db, { endDate: END, days: 20, seed: 11 });

    expect(report.exercises).toBeGreaterThan(8);
    expect(report.routines).toBe(2);

    const supersets = fixture.raw
      .prepare(
        'SELECT b.id, COUNT(DISTINCT l.exercise_id) AS exercises ' +
          'FROM routine_block b JOIN routine_line l ON l.block_id = b.id ' +
          'GROUP BY b.id HAVING exercises > 1',
      )
      .all();
    expect(supersets.length).toBeGreaterThan(0);

    // And its rest is on the BLOCK, which is the invariant restForLine keeps.
    const blockRests = fixture.raw
      .prepare(
        'SELECT COUNT(*) AS n FROM routine_block b ' +
          'WHERE (SELECT COUNT(DISTINCT exercise_id) FROM routine_line WHERE block_id = b.id) > 1 ' +
          'AND b.rest_seconds IS NULL',
      )
      .get();
    expect(blockRests).toEqual({ n: 0 });
  });

  it('gives the filter strips something on both axes, and the body map most of a body', () => {
    // A catalogue that worked three muscles with one piece of equipment would
    // exercise neither the filter nor the map, and both would look fine.
    seedJournal(fixture.db, { endDate: END, days: 10, seed: 13 });

    const muscles = fixture.raw
      .prepare('SELECT DISTINCT primary_muscle AS m FROM exercise')
      .all();
    const equipment = fixture.raw
      .prepare('SELECT DISTINCT equipment AS e FROM exercise WHERE equipment IS NOT NULL')
      .all();

    expect(muscles.length).toBeGreaterThanOrEqual(6);
    expect(equipment.length).toBeGreaterThanOrEqual(4);
  });

  it('reuses the exercise catalogue on a second run, like the foods', () => {
    const first = seedJournal(fixture.db, { endDate: END, days: 10, seed: 41 });
    const second = seedJournal(fixture.db, { endDate: END, days: 10, seed: 43 });

    expect(second.exercises).toBe(first.exercises);
    // Routines are created once and not again: a second run must not leave two
    // "Poussée A" that differ only by identity.
    expect(second.routines).toBe(0);

    const duplicates = fixture.raw
      .prepare('SELECT name, COUNT(*) AS n FROM exercise GROUP BY name HAVING n > 1')
      .all();
    expect(duplicates).toEqual([]);

    const routines = fixture.raw
      .prepare('SELECT name, COUNT(*) AS n FROM routine GROUP BY name HAVING n > 1')
      .all();
    expect(routines).toEqual([]);
  });

  it('logs foods that actually resolve, and some as portions', () => {
    const report = seedJournal(fixture.db, { endDate: END, days: 60, seed: 23 });
    expect(report.entries).toBeGreaterThan(0);

    // Every source_food_id points at a food that exists. There is no foreign
    // key to enforce it (specs 5.3), so the generator is where it gets checked.
    const dangling = fixture.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM journal_entry
          WHERE source_food_id IS NOT NULL
            AND source_food_id NOT IN (SELECT id FROM food)`,
      )
      .get() as { n: number };
    expect(dangling.n).toBe(0);

    // Both ways of expressing a quantity, so the pre-fill chain of specs 8.4
    // has both branches to walk on the device.
    const shapes = fixture.raw
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'food' AND portion_name IS NOT NULL THEN 1 ELSE 0 END) AS by_portion,
           SUM(CASE WHEN kind = 'food' AND portion_name IS NULL THEN 1 ELSE 0 END) AS by_base,
           SUM(CASE WHEN kind = 'free' THEN 1 ELSE 0 END) AS free
         FROM journal_entry`,
      )
      .get() as { by_portion: number; by_base: number; free: number };

    expect(shapes.by_portion).toBeGreaterThan(0);
    expect(shapes.by_base).toBeGreaterThan(0);
    // Free entry stays in the mix: it is still the fastest path (specs 8.4d).
    expect(shapes.free).toBeGreaterThan(0);
  });

  it('stores a portion quantity that matches the food it came from', () => {
    seedJournal(fixture.db, { endDate: END, days: 60, seed: 29 });

    // The frozen portion size must be the one the food carried at the time —
    // which, the generator never editing a food, is the one it still carries.
    const mismatched = fixture.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM journal_entry e
          WHERE e.portion_name IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM food_portion p
               WHERE p.food_id = e.source_food_id
                 AND p.name = e.portion_name
                 AND p.quantity = e.portion_quantity)`,
      )
      .get() as { n: number };
    expect(mismatched.n).toBe(0);
  });

  it(
    'carries a long history without choking',
    () => {
      // Three years, which is what D15 means by checking performance on long
      // histories. One transaction for the lot.
      const report = seedJournal(fixture.db, { endDate: END, days: 1095, seed: 17 });
      expect(report.entries).toBeGreaterThan(1000);
      expect(readDayTotals(fixture.db, END).kcal).toBeGreaterThanOrEqual(0);
    },
    // AN EXPLICIT TIMEOUT, because the default one was acting as an accidental
    // performance budget and losing.
    //
    // Measured on an idle machine: 4905 ms against vitest's 5000 ms default. It
    // passed alone and failed whenever the full suite ran it alongside
    // eighty-eight other workers — which is a test that fails AT RANDOM, and a
    // suite that goes red for no reason is worse than one test fewer: it is
    // what teaches you to rerun instead of reading.
    //
    // Nothing here asserts a duration. This test checks that three years of
    // history GOES IN, not that it goes in quickly, so the default timeout was
    // never the guard it looked like. If a performance budget is wanted it
    // belongs in an assertion that says so, with a number chosen rather than
    // inherited from a test runner.
    30_000,
  );
});

describe('the seeded exercises', () => {
  /**
   * THE DEFECT THIS GUARDS, WHICH WAS REAL AND INVISIBLE.
   *
   * The demo exercises used to be hand-written drafts. A draft carries no
   * `media_uri` — it is deliberately not a field of ExerciseDraft — so every
   * seeded exercise had none, and its page drew NOTHING: a null medium hides
   * the whole card rather than showing an empty one. Reported from the device
   * as "the thumbnails work in the catalogue but not on the exercise page".
   *
   * Nothing else would have caught it. The rows were valid, the list showed
   * them, the routines pointed at them; the only thing wrong was a column
   * nobody read in a test.
   */
  it('GIVES EVERY SEEDED EXERCISE ITS PHOTOGRAPH', () => {
    seedJournal(fixture.db, { endDate: END, days: 7, seed: 3 });

    const seeded = listExercises(fixture.db);
    expect(seeded.length).toBeGreaterThan(0);

    const blank = seeded.filter((item) => item.mediaUri === null);
    expect(blank.map((item) => item.name)).toEqual([]);
  });

  it('does not shadow the catalogue with a second copy under another name', () => {
    // The other half of the same defect: a typed "Squat" sitting beside an
    // installed "Squat à la barre" gave a development library two of
    // everything, one of them blank. Installing from the catalogue means every
    // seeded name IS a catalogue name.
    seedJournal(fixture.db, { endDate: END, days: 7, seed: 3 });

    const known = new Set(EXERCISE_CATALOG.map((entry) => entry.name));
    const strangers = listExercises(fixture.db).filter((item) => !known.has(item.name));

    expect(strangers.map((item) => item.name)).toEqual([]);
  });

  it('is idempotent, so seeding twice does not double the library', () => {
    seedJournal(fixture.db, { endDate: END, days: 7, seed: 3 });
    const first = listExercises(fixture.db).length;

    seedJournal(fixture.db, { endDate: END, days: 7, seed: 3 });

    expect(listExercises(fixture.db).length).toBe(first);
  });
});
