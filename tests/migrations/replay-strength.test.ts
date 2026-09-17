import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyMigrationsUpTo,
  applyOneMigration,
  columnNames,
  indexOfTag,
  openEmptyDatabase,
  tableNames,
} from '../helpers/migrations';

/**
 * The strength tables of schema 2.6, replayed in Node (D6/G4).
 *
 * 0008 is frozen the day it ships (D6/G2), and SQLite cannot add a CHECK or a
 * foreign key afterwards without rebuilding the table. It is also the heaviest
 * migration since 0001 — six tables, five foreign keys, a composite primary
 * key and eight CHECKs — so this is the last moment any of it can still be
 * corrected.
 *
 * Each constraint is therefore exercised from BOTH sides, on the rule slice 8
 * wrote down: a constraint that is present but never fires is indistinguishable
 * from one that was forgotten, and the assertion that catches that is the one
 * that tries to violate it.
 */

const STRENGTH_MIGRATION = '0008_strength';

/** Foreign keys are off by default in SQLite and every cascade test needs them. */
function openWithForeignKeys(): Database.Database {
  const db = openEmptyDatabase();
  applyAllMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function insertExercise(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    name: string;
    primaryMuscle: string;
    equipment: string | null;
    incrementKg: number;
    isFavorite: number;
  }> = {},
): string {
  const row = {
    id: 'e1',
    name: 'Développé couché',
    primaryMuscle: 'chest',
    equipment: 'barbell',
    incrementKg: 2.5,
    isFavorite: 0,
    ...overrides,
  };
  db.prepare(
    'INSERT INTO exercise (id, name, primary_muscle, equipment, increment_kg, is_favorite) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(row.id, row.name, row.primaryMuscle, row.equipment, row.incrementKg, row.isFavorite);
  return row.id;
}

function insertRoutine(db: Database.Database, id = 'r1'): string {
  db.prepare('INSERT INTO routine (id, name) VALUES (?, ?)').run(id, 'Haut du corps');
  return id;
}

function insertBlock(
  db: Database.Database,
  routineId: string,
  id = 'b1',
  restSeconds: number | null = null,
): string {
  db.prepare(
    'INSERT INTO routine_block (id, routine_id, position, rest_seconds) VALUES (?, ?, ?, ?)',
  ).run(id, routineId, 0, restSeconds);
  return id;
}

function insertLine(
  db: Database.Database,
  blockId: string,
  exerciseId: string,
  overrides: Partial<{
    id: string;
    setType: string;
    repsMin: number | null;
    repsMax: number | null;
    targetLoadKg: number | null;
    targetRir: number | null;
    restSeconds: number | null;
    progressionEnabled: number;
  }> = {},
): string {
  const row = {
    id: 'l1',
    setType: 'work',
    repsMin: 6,
    repsMax: 8,
    targetLoadKg: 60,
    targetRir: 2,
    restSeconds: 120,
    progressionEnabled: 1,
    ...overrides,
  };
  db.prepare(
    'INSERT INTO routine_line (id, block_id, exercise_id, position, set_index, set_type, ' +
      'reps_min, reps_max, target_load_kg, target_rir, rest_seconds, progression_enabled) ' +
      'VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    blockId,
    exerciseId,
    row.setType,
    row.repsMin,
    row.repsMax,
    row.targetLoadKg,
    row.targetRir,
    row.restSeconds,
    row.progressionEnabled,
  );
  return row.id;
}

describe('migration 0008 — what it creates', () => {
  it('adds the six tables and nothing else', () => {
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(STRENGTH_MIGRATION) - 1);
    const before = new Set(tableNames(db));

    // This migration alone, never "everything after it": the unbounded form
    // starts counting the next migration's tables the day one is written.
    applyOneMigration(db, STRENGTH_MIGRATION);
    const added = tableNames(db)
      .filter((name) => !before.has(name))
      .sort();

    expect(added).toEqual([
      'exercise',
      'exercise_secondary_muscle',
      'routine',
      'routine_block',
      'routine_line',
      'routine_warmup_step',
    ]);
    db.close();
  });

  it('creates none of the session tables, which belong to slice 11', () => {
    /**
     * THE ASSERTION THAT KEEPS THE SLICE HONEST.
     *
     * Section 2.6 describes the whole of V3 in one block, so the tempting move
     * is to create it all at once — and section 7 forbids exactly that, no
     * layer built "for later". Deferring costs nothing here because every
     * foreign key points the right way: session_set.exercise_id is declared in
     * session_set, which 0009 creates whole against an `exercise` that already
     * exists.
     *
     * This fails the day somebody adds them early, which is when the reasoning
     * above is worth re-reading rather than re-deriving.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    const names = new Set(tableNames(db));
    for (const deferred of [
      'session',
      'session_segment',
      'session_block',
      'session_set',
      'exercise_note',
    ]) {
      expect(names.has(deferred), `${deferred} belongs to 0009`).toBe(false);
    }
    db.close();
  });

  it('spells the columns exactly as section 2.6 does', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    // columnNames sorts, so these read alphabetically rather than in
    // declaration order.
    expect(columnNames(db, 'exercise')).toEqual([
      'created_at',
      'equipment',
      'id',
      'increment_kg',
      'is_favorite',
      'media_uri',
      'name',
      'note_breathing',
      'note_execution',
      'note_mistakes',
      'note_setup',
      'primary_muscle',
      // Added by 0009, after the fact — an ALTER TABLE ADD COLUMN with a
      // default, which is exactly the shape SQLite allows and therefore the
      // shape slice 3's rule says to defer.
      'tracks_duration',
      'updated_at',
    ]);
    expect(columnNames(db, 'exercise_secondary_muscle')).toEqual(['exercise_id', 'muscle']);
    expect(columnNames(db, 'routine')).toEqual(['created_at', 'id', 'name', 'updated_at']);
    expect(columnNames(db, 'routine_warmup_step')).toEqual([
      'id',
      'position',
      'routine_id',
      'text',
    ]);
    expect(columnNames(db, 'routine_block')).toEqual([
      'id',
      'position',
      'rest_seconds',
      'routine_id',
    ]);
    expect(columnNames(db, 'routine_line')).toEqual([
      'block_id',
      // Added by 0009, nullable — the other shape SQLite accepts.
      'duration_seconds',
      'exercise_id',
      'id',
      'note',
      'position',
      'progression_enabled',
      'reps_max',
      'reps_min',
      'rest_seconds',
      'set_index',
      'set_type',
      'target_load_kg',
      'target_rir',
    ]);
    db.close();
  });

  it('carries a composite primary key on the secondary muscles', () => {
    const db = openWithForeignKeys();
    const id = insertExercise(db);

    db.prepare('INSERT INTO exercise_secondary_muscle (exercise_id, muscle) VALUES (?, ?)').run(
      id,
      'triceps',
    );
    // The same muscle twice on one exercise is the same fact twice.
    expect(() =>
      db
        .prepare('INSERT INTO exercise_secondary_muscle (exercise_id, muscle) VALUES (?, ?)')
        .run(id, 'triceps'),
    ).toThrow(/UNIQUE|PRIMARY/i);

    // A different muscle on the same exercise is fine, which is what makes the
    // key composite rather than a plain uniqueness on exercise_id.
    db.prepare('INSERT INTO exercise_secondary_muscle (exercise_id, muscle) VALUES (?, ?)').run(
      id,
      'shoulders',
    );
    db.close();
  });
});

describe('migration 0008 — the vocabularies carry no CHECK, deliberately', () => {
  /**
   * The mirror image of the CHECK tests below, and the more important half.
   *
   * Three closed vocabularies ship in 0008 — muscles, equipment, set types —
   * and none is constrained in SQL. That is slice 3's food_portion.name
   * position, with more force: neither document gives these lists, they are
   * chosen in schema/strength.ts, and a CHECK would make widening one a table
   * rebuild. The barrier is the export catalogue's one_of rule, which names the
   * table, the row and the column instead of citing a constraint.
   *
   * Asserted from the database's side so the absence is a decision on record.
   * If somebody adds a CHECK later, these fail and they read why first.
   */
  it('accepts a muscle the application would never offer', () => {
    const db = openWithForeignKeys();
    expect(() => insertExercise(db, { primaryMuscle: 'rhomboids' })).not.toThrow();
    db.close();
  });

  it('accepts equipment the application would never offer', () => {
    const db = openWithForeignKeys();
    expect(() => insertExercise(db, { equipment: 'trap-bar' })).not.toThrow();
    db.close();
  });

  it('accepts a set type the application would never offer', () => {
    const db = openWithForeignKeys();
    const routineId = insertRoutine(db);
    const blockId = insertBlock(db, routineId);
    const exerciseId = insertExercise(db);

    expect(() => insertLine(db, blockId, exerciseId, { setType: 'amrap' })).not.toThrow();
    db.close();
  });
});

describe('migration 0008 — the CHECKs that are there', () => {
  it('refuses an increment of zero or less, and accepts a real one', () => {
    const db = openWithForeignKeys();

    expect(() => insertExercise(db, { id: 'a', incrementKg: 0 })).toThrow(/ck_exercise_increment/);
    expect(() => insertExercise(db, { id: 'b', incrementKg: -2.5 })).toThrow(
      /ck_exercise_increment/,
    );
    // The smallest increment anybody actually uses: half a 1.25 kg pair.
    expect(() => insertExercise(db, { id: 'c', incrementKg: 1.25 })).not.toThrow();
    db.close();
  });

  it('refuses a favourite flag that is not 0 or 1', () => {
    const db = openWithForeignKeys();

    expect(() => insertExercise(db, { id: 'a', isFavorite: 2 })).toThrow(/ck_exercise_favorite/);
    expect(() => insertExercise(db, { id: 'b', isFavorite: 1 })).not.toThrow();
    db.close();
  });

  it('refuses an inverted rep range, which would fire the progression early', () => {
    /**
     * Specs 10.4 suggests a load increase when every working set reaches the
     * TOP of its range. An inverted range puts that top below the bottom, so
     * the condition is met by a set nobody completed — plausible and wrong,
     * which is the bar a CHECK has to clear here.
     */
    const db = openWithForeignKeys();
    const blockId = insertBlock(db, insertRoutine(db));
    const exerciseId = insertExercise(db);

    expect(() => insertLine(db, blockId, exerciseId, { id: 'a', repsMin: 12, repsMax: 8 })).toThrow(
      /ck_line_reps/,
    );
    // Equal bounds are a fixed rep count, which specs 6.3 allows outright.
    expect(() =>
      insertLine(db, blockId, exerciseId, { id: 'b', repsMin: 10, repsMax: 10 }),
    ).not.toThrow();
    // One bound alone is a half-open range, and it is not an inversion.
    expect(() =>
      insertLine(db, blockId, exerciseId, { id: 'c', repsMin: 8, repsMax: null }),
    ).not.toThrow();
    expect(() =>
      insertLine(db, blockId, exerciseId, { id: 'd', repsMin: null, repsMax: null }),
    ).not.toThrow();
    db.close();
  });

  it('refuses a rep count of zero, a negative load, rir or rest', () => {
    const db = openWithForeignKeys();
    const blockId = insertBlock(db, insertRoutine(db));
    const exerciseId = insertExercise(db);

    expect(() => insertLine(db, blockId, exerciseId, { id: 'a', repsMin: 0 })).toThrow(
      /ck_line_reps_min/,
    );
    expect(() => insertLine(db, blockId, exerciseId, { id: 'b', targetLoadKg: -1 })).toThrow(
      /ck_line_load/,
    );
    expect(() => insertLine(db, blockId, exerciseId, { id: 'c', targetRir: -1 })).toThrow(
      /ck_line_rir/,
    );
    expect(() => insertLine(db, blockId, exerciseId, { id: 'd', restSeconds: -1 })).toThrow(
      /ck_line_rest/,
    );

    // Zero load is legitimate and must stay so: a bodyweight movement has no
    // load to state, and zero RIR is going to failure.
    expect(() =>
      insertLine(db, blockId, exerciseId, { id: 'e', targetLoadKg: 0, targetRir: 0 }),
    ).not.toThrow();
    db.close();
  });

  it('refuses a negative rest on a block, and accepts none at all', () => {
    const db = openWithForeignKeys();
    const routineId = insertRoutine(db);

    expect(() => insertBlock(db, routineId, 'a', -5)).toThrow(/ck_block_rest/);
    // NULL is how a single-exercise block says the rest belongs to its lines.
    expect(() => insertBlock(db, routineId, 'b', null)).not.toThrow();
    expect(() => insertBlock(db, routineId, 'c', 90)).not.toThrow();
    db.close();
  });
});

describe('migration 0008 — the foreign keys', () => {
  it('cascades from a routine to its steps, blocks and lines', () => {
    const db = openWithForeignKeys();
    const routineId = insertRoutine(db);
    const blockId = insertBlock(db, routineId);
    const exerciseId = insertExercise(db);
    insertLine(db, blockId, exerciseId);
    db.prepare(
      'INSERT INTO routine_warmup_step (id, routine_id, position, text) VALUES (?, ?, ?, ?)',
    ).run('w1', routineId, 0, '5 min de rameur');

    db.prepare('DELETE FROM routine WHERE id = ?').run(routineId);

    // The line goes with the block, which goes with the routine: a two-step
    // cascade, which is the one that would quietly fail if the middle link were
    // declared without an action.
    expect(db.prepare('SELECT COUNT(*) AS n FROM routine_warmup_step').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM routine_block').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM routine_line').get()).toEqual({ n: 0 });
    // And the exercise is untouched: it is referenced by the line, not owned.
    expect(db.prepare('SELECT COUNT(*) AS n FROM exercise').get()).toEqual({ n: 1 });
    db.close();
  });

  it('cascades from an exercise to its secondary muscles', () => {
    const db = openWithForeignKeys();
    const id = insertExercise(db);
    db.prepare('INSERT INTO exercise_secondary_muscle (exercise_id, muscle) VALUES (?, ?)').run(
      id,
      'triceps',
    );

    db.prepare('DELETE FROM exercise WHERE id = ?').run(id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM exercise_secondary_muscle').get()).toEqual({
      n: 0,
    });
    db.close();
  });

  it('blocks deleting an exercise a routine still uses, which is the net', () => {
    /**
     * NOT A CONTRADICTION WITH SPECS 5.3, which says no deletion is ever
     * blocked. The foreign key is the NET; the policy lives in the write
     * transaction, exactly as it does for recipe_ingredient.food_id — where
     * deleteFood() freezes the ingredients first and then deletes.
     *
     * CASCADE was the alternative and it loses something specs 5.3 asks for:
     *
     * > Supprimer un exercice possédant des séances affiche un avertissement
     * > nommant explicitement ce qui sera perdu.
     *
     * To name it, the application counts it first; having counted, it deletes
     * what it announced. A cascade does the same work silently and leaves the
     * warning guessing.
     */
    const db = openWithForeignKeys();
    const exerciseId = insertExercise(db);
    const blockId = insertBlock(db, insertRoutine(db));
    insertLine(db, blockId, exerciseId);

    expect(() => db.prepare('DELETE FROM exercise WHERE id = ?').run(exerciseId)).toThrow(
      /FOREIGN KEY/i,
    );

    // And once the line is gone, the same delete succeeds — which is what the
    // transaction will do, in this order, in one go.
    db.prepare('DELETE FROM routine_line WHERE exercise_id = ?').run(exerciseId);
    expect(() => db.prepare('DELETE FROM exercise WHERE id = ?').run(exerciseId)).not.toThrow();
    db.close();
  });

  it('refuses a line pointing at an exercise that does not exist', () => {
    const db = openWithForeignKeys();
    const blockId = insertBlock(db, insertRoutine(db));

    expect(() => insertLine(db, blockId, 'nobody')).toThrow(/FOREIGN KEY/i);
    db.close();
  });
});

describe('migration 0008 — replayed over data, which is G4', () => {
  it('leaves the rows of every earlier slice untouched', () => {
    /**
     * The point of replaying rather than building at the current schema: D6
     * has each migration carry its own backfill, and 0008 adds tables beside
     * the existing ones rather than touching any of them. This is what says so.
     */
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(STRENGTH_MIGRATION) - 1);

    db.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'dark')").run();
    db.prepare('INSERT INTO weight_measure (date, value_kg) VALUES (?, ?)').run(
      '2026-09-15',
      78.4,
    );
    db.prepare(
      'INSERT INTO food (id, name, source, base_unit, display_ref_qty, protein_100, ' +
        'carbs_100, fat_100, kcal_100) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('f1', 'Riz', 'perso', 'g', 100, 7, 78, 0.6, 350);

    applyOneMigration(db, STRENGTH_MIGRATION);

    expect(db.prepare("SELECT value FROM setting WHERE key = 'theme'").get()).toEqual({
      value: 'dark',
    });
    expect(db.prepare('SELECT value_kg FROM weight_measure').get()).toEqual({ value_kg: 78.4 });
    expect(db.prepare('SELECT name FROM food').get()).toEqual({ name: 'Riz' });
    // And the new tables arrive empty: nothing is seeded, the way
    // notification_setting seeds nothing.
    expect(db.prepare('SELECT COUNT(*) AS n FROM exercise').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM routine').get()).toEqual({ n: 0 });
    db.close();
  });
});
