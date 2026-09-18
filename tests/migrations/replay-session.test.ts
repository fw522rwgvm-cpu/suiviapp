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
 * The session tables of schema 2.6, replayed in Node (D6/G4).
 *
 * `0010` is frozen the day it ships (D6/G2), and SQLite cannot add a CHECK, a
 * foreign key or a uniqueness rule afterwards without rebuilding the table. So
 * this is the last moment any of it can be corrected, and everything
 * irreversible is exercised here.
 *
 * Each constraint is tried from BOTH sides, on the rule slice 8 wrote down: a
 * constraint that is present but never fires is indistinguishable from one that
 * was forgotten, and the assertion that catches that is the one that tries to
 * violate it.
 *
 * ## THE ONE THAT MATTERS MOST
 *
 * `ux_session_active` is the invariant of specs 10.3 — "une seule séance en
 * cours à la fois" — which D12 requires the DATABASE to carry rather than an
 * application check. It is a partial unique index, so it is only as strong as
 * the status vocabulary being closed: ck_session_status is the other half, and
 * both halves are tested here because either one alone lets two live sessions
 * exist.
 */

const SESSION_MIGRATION = '0010_session';

function openWithForeignKeys(): Database.Database {
  const db = openEmptyDatabase();
  applyAllMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function insertExercise(db: Database.Database, id = 'e1', name = 'Développé couché'): string {
  db.prepare(
    'INSERT INTO exercise (id, name, primary_muscle, equipment, increment_kg, is_favorite) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name, 'chest', 'barbell', 2.5, 0);
  return id;
}

function insertSession(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    date: string;
    status: string;
    startedAt: number;
    endedAt: number | null;
  }> = {},
): string {
  const row = {
    id: 's1',
    date: '2026-09-18',
    status: 'in_progress',
    startedAt: 1_789_600_000_000,
    endedAt: null as number | null,
    ...overrides,
  };
  db.prepare(
    'INSERT INTO session (id, date, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.date, row.status, row.startedAt, row.endedAt);
  return row.id;
}

function insertBlock(db: Database.Database, sessionId: string, id = 'sb1'): string {
  db.prepare(
    'INSERT INTO session_block (id, session_id, position, rest_seconds) VALUES (?, ?, 0, 90)',
  ).run(id, sessionId);
  return id;
}

function insertSet(
  db: Database.Database,
  blockId: string,
  overrides: Partial<{
    id: string;
    exerciseId: string | null;
    targetRepsMin: number | null;
    targetRepsMax: number | null;
    actualReps: number | null;
    actualLoadKg: number | null;
    actualRir: number | null;
    restSeconds: number | null;
    progressionEnabled: number;
    status: string;
  }> = {},
): string {
  const row = {
    id: 'ss1',
    exerciseId: 'e1' as string | null,
    targetRepsMin: 6 as number | null,
    targetRepsMax: 8 as number | null,
    actualReps: 8 as number | null,
    actualLoadKg: 70 as number | null,
    actualRir: 2 as number | null,
    restSeconds: 120 as number | null,
    progressionEnabled: 1,
    status: 'done',
    ...overrides,
  };
  db.prepare(
    'INSERT INTO session_set (id, session_block_id, exercise_id, exercise_name_frozen, position, ' +
      'set_index, set_type, target_reps_min, target_reps_max, actual_reps, actual_load_kg, ' +
      'actual_rir, rest_seconds, progression_enabled, status) ' +
      'VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    blockId,
    row.exerciseId,
    'Développé couché',
    'work',
    row.targetRepsMin,
    row.targetRepsMax,
    row.actualReps,
    row.actualLoadKg,
    row.actualRir,
    row.restSeconds,
    row.progressionEnabled,
    row.status,
  );
  return row.id;
}

describe('migration 0010 — what it creates', () => {
  it('adds the five tables and nothing else', () => {
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(SESSION_MIGRATION) - 1);
    const before = new Set(tableNames(db));

    // This migration alone, never "everything after it": the unbounded form
    // starts counting the next migration's tables the day one is written.
    applyOneMigration(db, SESSION_MIGRATION);
    const added = tableNames(db)
      .filter((name) => !before.has(name))
      .sort();

    expect(added).toEqual([
      'exercise_note',
      'session',
      'session_block',
      'session_segment',
      'session_set',
    ]);
    db.close();
  });

  it('alters nothing that already shipped', () => {
    /**
     * The claim that made deferring these tables free (architecture 9.15 no 1,
     * amended to 0010 in 9.24): every foreign key points at a table created
     * here or at `exercise`, which has existed since 0008. So nothing older is
     * touched, and no table is rebuilt to pay for the deferral.
     *
     * Asserted by comparing the columns of the tables 0008 and 0009 left
     * behind, before and after. A rebuild changes them; an ALTER changes them;
     * only leaving them alone does not.
     */
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(SESSION_MIGRATION) - 1);
    const beforeShape = new Map(
      tableNames(db).map((name) => [name, columnNames(db, name).join(',')]),
    );

    applyOneMigration(db, SESSION_MIGRATION);

    for (const [name, columns] of beforeShape) {
      expect(columnNames(db, name).join(','), `${name} was touched by 0010`).toEqual(columns);
    }
    db.close();
  });

  it('spells the columns exactly as section 2.6 does, plus the two durations', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(columnNames(db, 'session').sort()).toEqual([
      'created_at',
      'date',
      'ended_at',
      'id',
      'notes',
      'routine_id',
      'routine_name_snapshot',
      'started_at',
      'status',
      'updated_at',
    ]);
    expect(columnNames(db, 'session_segment').sort()).toEqual([
      'ended_at',
      'id',
      'session_id',
      'started_at',
    ]);
    expect(columnNames(db, 'session_block').sort()).toEqual([
      'id',
      'position',
      'rest_seconds',
      'session_id',
    ]);
    /**
     * target_duration_seconds and actual_duration_seconds are NOT in section
     * 2.6, which predates `0009` and describes a set only by its repetitions.
     * Without them an exercise flagged tracks_duration could be put into a
     * routine and then never performed — the feature dead on the one screen it
     * exists for. Amended rather than worked around (architecture 9.24).
     */
    expect(columnNames(db, 'session_set').sort()).toEqual([
      'actual_duration_seconds',
      'actual_load_kg',
      'actual_reps',
      'actual_rir',
      'completed_at',
      'exercise_id',
      'exercise_name_frozen',
      'id',
      'position',
      'progression_enabled',
      'rest_seconds',
      'session_block_id',
      'set_index',
      'set_type',
      'status',
      'target_duration_seconds',
      'target_load_kg',
      'target_reps_max',
      'target_reps_min',
      'target_rir',
    ]);
    expect(columnNames(db, 'exercise_note').sort()).toEqual([
      'consumed_at',
      'created_at',
      'exercise_id',
      'id',
      'text',
    ]);
    db.close();
  });
});

describe('one session in progress — the invariant of specs 10.3', () => {
  it('refuses a second session in progress', () => {
    const db = openWithForeignKeys();
    insertSession(db, { id: 's1' });

    expect(() => insertSession(db, { id: 's2' })).toThrow(/UNIQUE/);
    db.close();
  });

  it('allows any number of finished sessions', () => {
    // The other side, and the one that says the index is PARTIAL rather than
    // simply unique on status — which would allow one workout, ever.
    const db = openWithForeignKeys();
    insertSession(db, { id: 's1', status: 'done', endedAt: 1_789_600_100_000 });
    insertSession(db, { id: 's2', status: 'done', endedAt: 1_789_600_200_000 });
    insertSession(db, { id: 's3' });

    expect(
      db.prepare('SELECT count(*) AS n FROM session').get() as { n: number },
    ).toEqual({ n: 3 });
    db.close();
  });

  it('lets a finished session be followed by a new live one', () => {
    // The ordinary life of the application: finish, then start another.
    const db = openWithForeignKeys();
    insertSession(db, { id: 's1' });
    db.prepare('UPDATE session SET status = ?, ended_at = ? WHERE id = ?').run(
      'done',
      1_789_600_100_000,
      's1',
    );

    expect(() => insertSession(db, { id: 's2' })).not.toThrow();
    db.close();
  });

  it('refuses a status the vocabulary does not know, which is what makes the index total', () => {
    /**
     * THE HALF THAT IS EASY TO MISS, AND WITHOUT WHICH THE INVARIANT IS NOT ONE.
     *
     * ux_session_active is partial — WHERE status = 'in_progress' — so it says
     * nothing whatsoever about a row whose status is 'running'. Two such rows
     * would sit side by side, both live as far as any reader is concerned, and
     * D12's whole point is that this must be impossible in the DATABASE.
     *
     * So the CHECK is not decoration next to the index: it is what makes the
     * partial index total. This is the only place in the schema where that is
     * true of an index, and it is why session.status carries a CHECK where
     * session_set.status deliberately does not.
     */
    const db = openWithForeignKeys();

    expect(() => insertSession(db, { id: 's1', status: 'running' })).toThrow(
      /ck_session_status/,
    );
    db.close();
  });

  it('refuses a session that ended before it started', () => {
    const db = openWithForeignKeys();

    expect(() =>
      insertSession(db, {
        id: 's1',
        status: 'done',
        startedAt: 1_789_600_100_000,
        endedAt: 1_789_600_000_000,
      }),
    ).toThrow(/ck_session_order/);
    db.close();
  });
});

describe('segments — what carries the duration', () => {
  it('refuses a segment that ended before it started', () => {
    /**
     * The duration of a session is the SUM of these rows (D9, D12: the duration
     * is never stored). So an inverted pair does not look wrong — it makes a
     * workout quietly shorter, which is the bar a CHECK has to clear.
     */
    const db = openWithForeignKeys();
    insertSession(db);

    expect(() =>
      db
        .prepare(
          'INSERT INTO session_segment (id, session_id, started_at, ended_at) VALUES (?, ?, ?, ?)',
        )
        .run('g1', 's1', 1_789_600_100_000, 1_789_600_000_000),
    ).toThrow(/ck_segment_order/);
    db.close();
  });

  it('accepts an open segment, which is the one being extended', () => {
    const db = openWithForeignKeys();
    insertSession(db);

    expect(() =>
      db
        .prepare(
          'INSERT INTO session_segment (id, session_id, started_at, ended_at) VALUES (?, ?, ?, ?)',
        )
        .run('g1', 's1', 1_789_600_000_000, null),
    ).not.toThrow();
    db.close();
  });

  it('takes its segments and blocks with it when a session is deleted', () => {
    // Specs 10.3: "Une séance terminée reste éditable et supprimable". CASCADE,
    // because a segment and a block have no existence apart from their session
    // — unlike a session_set's exercise, which outlives it.
    const db = openWithForeignKeys();
    insertSession(db);
    db.prepare(
      'INSERT INTO session_segment (id, session_id, started_at, ended_at) VALUES (?, ?, ?, ?)',
    ).run('g1', 's1', 1_789_600_000_000, null);
    insertExercise(db);
    insertSet(db, insertBlock(db, 's1'));

    db.prepare('DELETE FROM session WHERE id = ?').run('s1');

    for (const table of ['session_segment', 'session_block', 'session_set']) {
      expect(
        (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
        `${table} survived its session`,
      ).toBe(0);
    }
    db.close();
  });
});

describe('a set outlives its exercise — D5/R4', () => {
  it('blocks deleting an exercise a set names, which is the net', () => {
    /**
     * NO ACTION, exactly as routine_line.exercise_id and
     * recipe_ingredient.food_id are. Read alone it contradicts specs 5.3 — no
     * deletion is ever blocked — and it stops contradicting it the moment
     * deleteExercise() does its job: it nulls this column first, then deletes.
     *
     * So this throw is not an obstacle to work around. It is the only thing
     * that proves the transaction ran. Simplify deleteExercise() one day and
     * the database refuses loudly, instead of an archive quietly losing what it
     * recorded.
     */
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    insertSet(db, insertBlock(db, 's1'));

    expect(() => db.prepare('DELETE FROM exercise WHERE id = ?').run('e1')).toThrow(
      /FOREIGN KEY/,
    );
    db.close();
  });

  it('keeps the frozen name once the link is broken', () => {
    // The other side, and the pair of columns IS the mechanism: the id is
    // nullable, the name is NOT NULL. A session from two years ago still says
    // what was performed.
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    insertSet(db, insertBlock(db, 's1'));

    db.prepare('UPDATE session_set SET exercise_id = NULL WHERE exercise_id = ?').run('e1');
    db.prepare('DELETE FROM exercise WHERE id = ?').run('e1');

    expect(
      db.prepare('SELECT exercise_id, exercise_name_frozen FROM session_set').get(),
    ).toEqual({ exercise_id: null, exercise_name_frozen: 'Développé couché' });
    db.close();
  });

  it('refuses a set with no frozen name at all', () => {
    // NOT NULL is what makes the pair work: a set that lost both its link and
    // its name records that something happened and not what.
    const db = openWithForeignKeys();
    insertSession(db);
    insertBlock(db, 's1');

    expect(() =>
      db
        .prepare(
          'INSERT INTO session_set (id, session_block_id, exercise_name_frozen, position, ' +
            'set_index, set_type, status) VALUES (?, ?, ?, 0, 1, ?, ?)',
        )
        .run('ss1', 'sb1', null, 'work', 'pending'),
    ).toThrow(/NOT NULL/);
    db.close();
  });
});

describe('what a set may and may not hold', () => {
  it('refuses an inverted target range', () => {
    // An inverted range puts the "haut de la plage" of specs 10.4 BELOW its
    // bottom, so the progression suggestion fires when it should not.
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    const block = insertBlock(db, 's1');

    expect(() => insertSet(db, block, { targetRepsMin: 10, targetRepsMax: 6 })).toThrow(
      /ck_set_target_reps/,
    );
    db.close();
  });

  it('accepts a range with only one end stated', () => {
    // Specs 6.3 allows fixed repetitions as well as a range, so one end alone
    // is a legitimate target and not a half-filled row.
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    const block = insertBlock(db, 's1');

    expect(() => insertSet(db, block, { targetRepsMax: null })).not.toThrow();
    db.close();
  });

  it('accepts zero repetitions and zero load, and refuses negatives', () => {
    /**
     * Zero is legitimate on every actual and this is the assertion that says
     * so: a bodyweight movement has no load to state, and a set attempted and
     * failed has zero repetitions. Only negative is impossible.
     */
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    const block = insertBlock(db, 's1');

    expect(() =>
      insertSet(db, block, { id: 'ok', actualReps: 0, actualLoadKg: 0, actualRir: 0 }),
    ).not.toThrow();
    expect(() => insertSet(db, block, { id: 'x1', actualReps: -1 })).toThrow(
      /ck_set_actual_reps/,
    );
    expect(() => insertSet(db, block, { id: 'x2', actualLoadKg: -1 })).toThrow(
      /ck_set_actual_load/,
    );
    expect(() => insertSet(db, block, { id: 'x3', actualRir: -1 })).toThrow(/ck_set_actual_rir/);
    db.close();
  });

  it('takes any status it is given, which is deliberate', () => {
    /**
     * THE ASYMMETRY WITH session.status, ASSERTED SO IT READS AS A DECISION.
     *
     * Nothing enforces anything about a set by partial index, and the volume of
     * specs 10.1 is a POSITIVE clause — "sur les séries de travail validées
     * uniquement", so WHERE status = 'done'. A fifth status is simply not
     * counted, which is the right default for one nobody has written a volume
     * rule for. Widening breaks no calculation and escapes no invariant, which
     * is exactly the test slice 3 set and slice 10 applied to set_type.
     *
     * The barrier is the export catalogue's one_of rule, which runs before the
     * first insert and names table, row and column.
     */
    const db = openWithForeignKeys();
    insertExercise(db);
    insertSession(db);
    const block = insertBlock(db, 's1');

    expect(() => insertSet(db, block, { status: 'abandoned' })).not.toThrow();
    db.close();
  });
});

describe('exercise notes', () => {
  it('goes with its exercise, unlike a set', () => {
    /**
     * CASCADE here where session_set is NO ACTION, and the difference is what
     * each row IS. A note is advice for next time and means nothing without the
     * movement it is about; a set is history, and specs 5.3 promises history
     * survives a deletion.
     */
    const db = openWithForeignKeys();
    insertExercise(db);
    db.prepare(
      'INSERT INTO exercise_note (id, exercise_id, text, created_at) VALUES (?, ?, ?, ?)',
    ).run('n1', 'e1', 'Monter à 75', 1_789_600_000_000);

    db.prepare('DELETE FROM exercise WHERE id = ?').run('e1');

    expect(
      (db.prepare('SELECT count(*) AS n FROM exercise_note').get() as { n: number }).n,
    ).toBe(0);
    db.close();
  });
});
