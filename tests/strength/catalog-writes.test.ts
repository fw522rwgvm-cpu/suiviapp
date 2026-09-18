import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercise, exerciseSecondaryMuscle } from '../../src/core/db/schema';
import { EXERCISE_CATALOG, catalogKeyOf } from '../../src/features/strength/catalog/exercises';
import {
  installCatalogExercises,
  installedCatalogNames,
} from '../../src/features/strength/data/catalog-writes';
import { createExercise } from '../../src/features/strength/data/exercise-writes';
import {
  emptyExerciseDraft,
  DEFAULT_PROGRESSION_INCREMENT_KG,
} from '../../src/features/strength/domain/exercise-draft';
import { listExercises } from '../../src/features/strength/data/exercise-reads';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Installing the catalogue (specs 10.1, slice 11), against a real SQLite file.
 *
 * What is worth testing here is the idempotence — the property that lets the
 * screen be opened twice — and that the install writes what the catalogue says
 * rather than a subset of it.
 */

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

const ALL = EXERCISE_CATALOG.map((entry) => entry.key);

describe('installing', () => {
  it('writes the whole catalogue with its muscles and its media keys', () => {
    const result = installCatalogExercises(db.db, ALL, 2.5);

    expect(result).toEqual({ installed: EXERCISE_CATALOG.length, skipped: 0 });
    expect(listExercises(db.db)).toHaveLength(EXERCISE_CATALOG.length);

    const rows = db.db.select().from(exercise).all();
    for (const entry of EXERCISE_CATALOG) {
      const row = rows.find((candidate) => candidate.name === entry.name);
      expect(row, `${entry.name} was not written`).toBeDefined();
      expect(row?.primaryMuscle).toBe(entry.primaryMuscle);
      expect(row?.equipment).toBe(entry.equipment);
      // The catalogue key, prefixed — the whole point of the scheme.
      expect(catalogKeyOf(row?.mediaUri ?? null)).toBe(entry.key);
      expect(row?.tracksDuration).toBe(entry.tracksDuration === true ? 1 : 0);
    }

    const secondaries = db.db.select().from(exerciseSecondaryMuscle).all();
    const expected = EXERCISE_CATALOG.reduce(
      (total, entry) => total + entry.secondaryMuscles.length,
      0,
    );
    expect(secondaries).toHaveLength(expected);
  });

  it('writes a media key even for the one with no drawing', () => {
    /**
     * `gainage` has no drawing — the source has a side plank and no front
     * plank — and it still gets a key. The key is what the exercise IS, not a
     * promise that a picture exists, and withholding it would make "no
     * drawing" mean two different things depending on why.
     */
    installCatalogExercises(db.db, ['gainage'], 2.5);

    const [row] = db.db.select().from(exercise).all();
    expect(catalogKeyOf(row?.mediaUri ?? null)).toBe('gainage');
  });

  it('installs only what it was asked for', () => {
    const result = installCatalogExercises(db.db, ['squat', 'crunch'], 2.5);

    expect(result.installed).toBe(2);
    expect(listExercises(db.db).map((item) => item.name).sort()).toEqual(['Crunch', 'Squat']);
  });

  it('copies the increment it is given, rather than reading a setting', () => {
    // Specs 6.3 makes the global increment an INITIAL value, read once at
    // creation. The caller passes it; this function has no business reading a
    // settings row, which would be a second path to the same number.
    installCatalogExercises(db.db, ['squat'], 1.25);

    expect(db.db.select().from(exercise).all()[0]?.incrementKg).toBe(1.25);
  });
});

describe('running it twice', () => {
  it('IS IDEMPOTENT, which is what lets the screen be opened again', () => {
    installCatalogExercises(db.db, ALL, 2.5);
    const second = installCatalogExercises(db.db, ALL, 2.5);

    expect(second).toEqual({ installed: 0, skipped: EXERCISE_CATALOG.length });
    expect(listExercises(db.db)).toHaveLength(EXERCISE_CATALOG.length);
  });

  it('skips a name the user typed themselves, and keeps THEIRS', () => {
    /**
     * Idempotent BY NAME rather than by media key, and this is the case that
     * decides it: somebody who typed "Squat" before opening this screen has a
     * Squat. Installing a second one would be the application disagreeing with
     * them about their own library.
     *
     * And theirs is untouched — not "updated" to the catalogue's muscles. It is
     * an exercise they made, which specs 5.3 says is theirs to correct.
     */
    createExercise(db.db, {
      ...emptyExerciseDraft(DEFAULT_PROGRESSION_INCREMENT_KG),
      name: 'Squat',
      primaryMuscle: 'glutes',
      equipment: 'kettlebell',
    });

    const result = installCatalogExercises(db.db, ALL, 2.5);

    expect(result.skipped).toBe(1);
    const squats = db.db.select().from(exercise).all().filter((row) => row.name === 'Squat');
    expect(squats).toHaveLength(1);
    expect(squats[0]?.primaryMuscle).toBe('glutes');
    expect(squats[0]?.equipment).toBe('kettlebell');
    // And it is still THEIRS: no catalogue key was written over it.
    expect(squats[0]?.mediaUri).toBeNull();
  });

  it('fills in only what is missing after a partial install', () => {
    installCatalogExercises(db.db, ['squat'], 2.5);

    const result = installCatalogExercises(db.db, ALL, 2.5);

    expect(result.installed).toBe(EXERCISE_CATALOG.length - 1);
    expect(result.skipped).toBe(1);
    expect(listExercises(db.db)).toHaveLength(EXERCISE_CATALOG.length);
  });
});

describe('what the screen shows before the button', () => {
  it('names what is already there, so nothing is a surprise afterwards', () => {
    // Saying "31 installed, 2 skipped" afterwards is a report; saying it in
    // advance is a choice.
    installCatalogExercises(db.db, ['squat', 'crunch'], 2.5);

    expect([...installedCatalogNames(db.db)].sort()).toEqual(['crunch', 'squat']);
  });

  it('is empty on an untouched library', () => {
    expect(installedCatalogNames(db.db).size).toBe(0);
  });
});
