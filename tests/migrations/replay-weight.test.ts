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
 * The weight tables of schema 2.5, replayed in Node (D6/G4).
 *
 * 0006 is frozen the day it ships (D6/G2), and SQLite cannot add a CHECK or a
 * foreign key afterwards without rebuilding the table. Everything irreversible
 * in slice 8 is in that one file: two tables, their NOT NULL columns and five
 * CHECKs. This is the last moment any of it can still be corrected, so each
 * constraint is exercised from BOTH sides — a constraint that is present but
 * never fires is indistinguishable from one that was forgotten, and the
 * assertion that catches that is the one that tries to violate it.
 */

const WEIGHT_MIGRATION = '0006_weight';

function insertGoal(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    targetKg: number;
    mode: string;
    targetDate: string | null;
    rate: number | null;
    definedAt: number;
    isActive: number;
  }> = {},
): void {
  const row = {
    id: 'g1',
    targetKg: 74.5,
    mode: 'rate',
    targetDate: null,
    rate: -0.35,
    definedAt: 1_789_000_000_000,
    isActive: 1,
    ...overrides,
  };
  db.prepare(
    'INSERT INTO weight_goal (id, target_kg, mode, target_date, rate_kg_per_week, ' +
      'defined_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.targetKg,
    row.mode,
    row.targetDate,
    row.rate,
    row.definedAt,
    row.isActive,
  );
}

function insertMeasure(db: Database.Database, date: string, valueKg: number): void {
  db.prepare('INSERT INTO weight_measure (date, value_kg) VALUES (?, ?)').run(date, valueKg);
}

describe('migration 0006 — what it creates', () => {
  it('adds the two tables and nothing else', () => {
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(WEIGHT_MIGRATION) - 1);
    const before = new Set(tableNames(db));

    // This migration alone, not "everything after it": the unbounded form
    // starts counting the next migration's tables the day one is written, which
    // is the latent defect 0005 uncovered in the slice-5 test.
    applyOneMigration(db, WEIGHT_MIGRATION);
    const added = tableNames(db).filter((name) => !before.has(name));

    expect(added).toEqual(['weight_goal', 'weight_measure']);
    db.close();
  });

  it('spells the columns exactly as section 2.5 does', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    // columnNames sorts, so these read alphabetically rather than in
    // declaration order.
    expect(columnNames(db, 'weight_measure')).toEqual([
      'created_at',
      'date',
      'updated_at',
      'value_kg',
    ]);
    expect(columnNames(db, 'weight_goal')).toEqual([
      'defined_at',
      'id',
      'is_active',
      'mode',
      'rate_kg_per_week',
      'target_date',
      'target_kg',
    ]);
    db.close();
  });

  it('leaves the measurements without an index of their own, on purpose', () => {
    /**
     * NOT AN OMISSION, and worth pinning so that adding one later is deliberate.
     *
     * The charts read weight_measure by date range, which is exactly what an
     * index is normally for — but `date` IS the primary key, so SQLite already
     * carries a unique index on it and BETWEEN scans that. Section 2.5 declares
     * none and is right to.
     *
     * The assertion allows the implicit sqlite_autoindex, which is that primary
     * key: what it refuses is a SECOND, hand-written index that would buy
     * nothing.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'weight_measure' AND name NOT LIKE 'sqlite_%'",
      )
      .all();

    expect(rows).toEqual([]);
    db.close();
  });

  it('declares no foreign key at all, which is what lets a weight stand alone', () => {
    /**
     * The tempting shape is date REFERENCES day(date). It would be wrong.
     *
     * A day exists only once MATERIALISED (specs 8.2), so the key would force a
     * day into existence to weigh on it — data created by consultation, which
     * 8.2 forbids outright. Weighing yourself on a day you logged no food is
     * entirely ordinary, and this assertion is what says so in a form that
     * breaks if anyone adds the key later.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(db.prepare('PRAGMA foreign_key_list(weight_measure)').all()).toEqual([]);
    expect(db.prepare('PRAGMA foreign_key_list(weight_goal)').all()).toEqual([]);

    // And the proof it is not merely undeclared: a measurement lands on a date
    // no day row answers to.
    insertMeasure(db, '2026-03-04', 78.35);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM day WHERE date = '2026-03-04'").get(),
    ).toEqual({ n: 0 });
    db.close();
  });
});

describe('the CHECK on the measured value', () => {
  it('accepts an ordinary weight, fractional included', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertMeasure(db, '2026-03-04', 78.35);
    expect(
      db.prepare("SELECT value_kg AS v FROM weight_measure WHERE date = '2026-03-04'").get(),
    ).toEqual({ v: 78.35 });
    db.close();
  });

  it('refuses zero and refuses a negative weight', () => {
    /**
     * WHERE THE MACROS GOT NO CHECK AND THIS DOES.
     *
     * Slice 3 refused every CHECK on the macros because specs 8.5 requires Open
     * Food Facts values to be flagged and editable, never refused, and slice 4
     * copies a scanned product in automatically — a CHECK would have turned a
     * flaggable anomaly into a failed INSERT on that path.
     *
     * None of that holds here: no external source, no automatic copy, and no
     * path on which a value arrives untyped. A weight of zero is not doubtful,
     * it is impossible.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() => insertMeasure(db, '2026-03-04', 0)).toThrow(/ck_weight_value/);
    expect(() => insertMeasure(db, '2026-03-05', -5)).toThrow(/ck_weight_value/);
    db.close();
  });

  it('sets no upper bound, because that would legislate on what a body weighs', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertMeasure(db, '2026-03-04', 250);
    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_measure').get()).toEqual({ n: 1 });
    db.close();
  });
});

describe('one measurement per date', () => {
  it('is the primary key rather than a rule anyone has to remember', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertMeasure(db, '2026-03-04', 78.35);
    expect(() => insertMeasure(db, '2026-03-04', 77.9)).toThrow();

    // And replacing is what the write layer will do — the point being that the
    // database leaves it no other option.
    db.prepare(
      'INSERT INTO weight_measure (date, value_kg) VALUES (?, ?) ' +
        'ON CONFLICT(date) DO UPDATE SET value_kg = excluded.value_kg',
    ).run('2026-03-04', 77.9);

    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_measure').get()).toEqual({ n: 1 });
    expect(
      db.prepare("SELECT value_kg AS v FROM weight_measure WHERE date = '2026-03-04'").get(),
    ).toEqual({ v: 77.9 });
    db.close();
  });
});

describe('the CHECKs on the goal', () => {
  it('accepts each of the two modes with its own term', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertGoal(db, { id: 'g1', mode: 'rate', rate: -0.35, targetDate: null });
    insertGoal(db, {
      id: 'g2',
      mode: 'target_date',
      rate: null,
      targetDate: '2026-12-31',
      isActive: 0,
    });

    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_goal').get()).toEqual({ n: 2 });
    db.close();
  });

  it('refuses a third mode', () => {
    /**
     * The same class as ck_entry_kind and ck_recipe_yield_type, and for the
     * same reason: `mode` DRIVES THE CALCULATION. It decides which column is
     * read and which figure is derived from it, so a third value falls through
     * every branch and produces a plausible, wrong rate with nothing to say so.
     *
     * Widening a vocabulary of labels breaks nothing — which is why
     * food_portion.name carries none.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() => insertGoal(db, { mode: 'bmi', rate: -0.35 })).toThrow(/ck_weight_goal/);
    db.close();
  });

  it('refuses a mode whose own term is missing', () => {
    // A goal in 'rate' mode with no rate is a goal NOBODY CAN READ, and nothing
    // downstream would report it. Same defect the four IS NOT NULL clauses of
    // readDailyTargets exist to prevent, one table over.
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() => insertGoal(db, { mode: 'rate', rate: null, targetDate: null })).toThrow(
      /ck_weight_goal_terms/,
    );
    expect(() =>
      insertGoal(db, { mode: 'target_date', rate: null, targetDate: null }),
    ).toThrow(/ck_weight_goal_terms/);
    db.close();
  });

  it('refuses a goal carrying BOTH terms, which is D9 made structural', () => {
    /**
     * THE DECISION OF THIS MIGRATION.
     *
     * Specs 6.2 makes one term derived from the other: give a target date and
     * the rate is calculated, give a rate and the date is estimated. D9 forbids
     * storing what is derivable. So a row carrying both would be either a
     * breach of D9 or an ambiguity with no answer — which of the two is
     * authoritative?
     *
     * The CHECK makes that state inexpressible, which is strictly better than a
     * rule the write layer has to remember to apply.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() =>
      insertGoal(db, { mode: 'rate', rate: -0.35, targetDate: '2026-12-31' }),
    ).toThrow(/ck_weight_goal_terms/);
    expect(() =>
      insertGoal(db, { mode: 'target_date', rate: -0.35, targetDate: '2026-12-31' }),
    ).toThrow(/ck_weight_goal_terms/);
    db.close();
  });

  it('accepts a rate of zero and a positive rate, because a rate is signed', () => {
    /**
     * NO CHECK ON THE RATE, AND THAT IS A REFUSAL RATHER THAN AN OVERSIGHT.
     *
     * Negative loses weight, positive gains it, and ZERO MEANS MAINTENANCE —
     * "I want to stay at 75 kg" — which is a legitimate goal. There is no bound
     * that would not refuse a real case.
     *
     * A zero rate makes the estimated date infinite, which is a case the
     * calculation states rather than a value the schema refuses.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertGoal(db, { id: 'g1', mode: 'rate', rate: 0 });
    insertGoal(db, { id: 'g2', mode: 'rate', rate: 0.25, isActive: 0 });

    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_goal').get()).toEqual({ n: 2 });
    db.close();
  });

  it('refuses a target weight of zero, and a flag that is not a flag', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() => insertGoal(db, { targetKg: 0 })).toThrow(/ck_weight_goal_target/);
    expect(() => insertGoal(db, { isActive: 2 })).toThrow(/ck_weight_goal_active/);
    db.close();
  });
});

describe('at most one active goal', () => {
  it('refuses a second active goal and allows any number of inactive ones', () => {
    /**
     * Everything downstream assumes ONE: the gap to the target rate compares
     * against a rate, the curve carries a line. Two active goals would need a
     * tie-break nobody has written, and whichever was picked would produce a
     * plausible figure against the wrong goal.
     *
     * Deactivated goals are kept rather than deleted, because specs 6.2 lists
     * "désactivable" and "supprimable" as two different actions — so they must
     * leave two different traces.
     */
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertGoal(db, { id: 'g1', isActive: 1 });
    /**
     * The message names the COLUMN, not the index — "UNIQUE constraint failed:
     * weight_goal.is_active". Verified by running it rather than assumed: the
     * first version of this assertion looked for the index name and failed.
     *
     * Worth knowing, because it is the one place a CHECK is strictly better
     * than an index for diagnosis: ck_weight_goal_terms says its own name, so
     * someone repairing an archive by hand is told which rule they broke. An
     * index tells them only which column collided.
     */
    expect(() => insertGoal(db, { id: 'g2', isActive: 1 })).toThrow(
      /UNIQUE constraint failed: weight_goal\.is_active/,
    );

    insertGoal(db, { id: 'g3', isActive: 0 });
    insertGoal(db, { id: 'g4', isActive: 0 });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM weight_goal WHERE is_active = 0').get(),
    ).toEqual({ n: 2 });
    db.close();
  });

  it('lets a goal be replaced by deactivating the old one first', () => {
    // The shape the write layer has to use, pinned here so the ordering is a
    // tested fact rather than something a transaction happens to get right.
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    insertGoal(db, { id: 'g1', isActive: 1 });
    db.prepare('UPDATE weight_goal SET is_active = 0 WHERE is_active = 1').run();
    insertGoal(db, { id: 'g2', isActive: 1, targetKg: 72 });

    expect(
      db.prepare('SELECT id FROM weight_goal WHERE is_active = 1').get(),
    ).toEqual({ id: 'g2' });
    db.close();
  });
});
