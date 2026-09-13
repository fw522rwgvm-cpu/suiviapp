import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyMigrationsAfter,
  applyMigrationsUpTo,
  columnNames,
  indexOfTag,
  openEmptyDatabase,
  tableNames,
} from '../helpers/migrations';

/**
 * The templates and planning of schema 2.3, replayed in Node (D6/G4).
 *
 * 0004 is frozen the day it ships (D6/G2), and SQLite cannot add a CHECK or a
 * foreign key afterwards without rebuilding the table. Everything irreversible
 * in slice 5 is in that one file: two foreign keys and one CHECK. This is the
 * last moment any of it can still be corrected, so each is exercised from BOTH
 * sides — a constraint that is present but never fires is indistinguishable
 * from one that was forgotten, and the assertion that catches that is the one
 * that tries to violate it.
 */

const PLANNING_MIGRATION = '0004_templates_planning';

function insertTemplate(db: Database.Database, id = 't1'): void {
  db.prepare('INSERT INTO day_template (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    "Jour d'entrainement",
    1_789_000_000_000,
    1_789_000_000_000,
  );
}

function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('migration 0004 — what it creates', () => {
  it('adds the four tables and nothing else', () => {
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(PLANNING_MIGRATION) - 1);
    const before = new Set(tableNames(db));

    applyMigrationsAfter(db, indexOfTag(PLANNING_MIGRATION) - 1);
    const added = tableNames(db).filter((name) => !before.has(name));

    expect(added).toEqual([
      'day_template',
      'day_template_meal',
      'planning_override',
      'planning_weekday',
    ]);
    db.close();
  });

  it('spells the columns exactly as section 2.3 does', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    // columnNames sorts, so these read alphabetically rather than in
    // declaration order.
    expect(columnNames(db, 'day_template')).toEqual([
      'created_at',
      'id',
      'name',
      'updated_at',
    ]);
    expect(columnNames(db, 'day_template_meal')).toEqual([
      'id',
      'name',
      'position',
      'target_carbs',
      'target_fat',
      'target_kcal',
      'target_protein',
      'template_id',
    ]);
    expect(columnNames(db, 'planning_weekday')).toEqual(['template_id', 'weekday']);
    expect(columnNames(db, 'planning_override')).toEqual(['date', 'template_id']);
    db.close();
  });

  it('leaves the template meals without an index, on purpose', () => {
    // Section 2.3 declares indexes where it wants them — ix_day_meal_date
    // exists — and this table is bounded by the number of templates the user
    // creates. Asserted so that adding one later is a deliberate act; an index
    // is the one part of a migration that can still be added freely.
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'day_template_meal' AND name NOT LIKE 'sqlite_%'",
      )
      .all();

    expect(rows).toEqual([]);
    db.close();
  });
});

describe('the CHECK on the weekday', () => {
  it('accepts both ends of the week', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertTemplate(db);

    // 1 is Monday and 7 is Sunday (schema 2.3, specs 8.1). core/date's
    // weekday() produces exactly this range, and tests/date asserts the
    // numbering against this very table.
    expect(() =>
      db.prepare('INSERT INTO planning_weekday (weekday, template_id) VALUES (1, ?)').run('t1'),
    ).not.toThrow();
    expect(() =>
      db.prepare('INSERT INTO planning_weekday (weekday, template_id) VALUES (7, ?)').run('t1'),
    ).not.toThrow();
    db.close();
  });

  it('refuses a day outside the week, which is why it had to ship in 0004', () => {
    // The one_of rule of the export catalogue takes strings, and this column is
    // an integer, so SQL is the only place this constraint can live. SQLite has
    // no ALTER TABLE ADD CONSTRAINT: absent here, it is absent for ever.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertTemplate(db);

    for (const weekday of [0, 8, -1]) {
      expect(() =>
        db
          .prepare('INSERT INTO planning_weekday (weekday, template_id) VALUES (?, ?)')
          .run(weekday, 't1'),
      ).toThrow();
    }
    db.close();
  });
});

describe('the two foreign keys, which are the decision of this migration', () => {
  it('refuses a planning row naming a template that does not exist', () => {
    // The barrier that would be lost without a declared key: barrier three of
    // the import runs foreign_key_check, and with no key it could no longer
    // tell a sound archive from one whose planning points nowhere.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    db.pragma('foreign_keys = ON');

    expect(() =>
      db
        .prepare('INSERT INTO planning_weekday (weekday, template_id) VALUES (1, ?)')
        .run('nobody'),
    ).toThrow();
    expect(() =>
      db
        .prepare('INSERT INTO planning_override (date, template_id) VALUES (?, ?)')
        .run('2026-09-15', 'nobody'),
    ).toThrow();
    db.close();
  });

  it('carries the assignments away with the template, blocking nothing', () => {
    // Specs 5.3: no deletion is ever blocked. CASCADE blocks nothing, so the
    // rule is satisfied rather than bent — and a planning row naming a
    // template that no longer exists could neither render nor resolve.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    db.pragma('foreign_keys = ON');
    insertTemplate(db);

    db.prepare(
      'INSERT INTO day_template_meal (id, template_id, position, name) VALUES (?, ?, 0, ?)',
    ).run('m1', 't1', 'Dejeuner');
    db.prepare('INSERT INTO planning_weekday (weekday, template_id) VALUES (2, ?)').run('t1');
    db.prepare('INSERT INTO planning_override (date, template_id) VALUES (?, ?)').run(
      '2026-09-15',
      't1',
    );

    expect(() => db.prepare('DELETE FROM day_template WHERE id = ?').run('t1')).not.toThrow();

    expect(countRows(db, 'day_template_meal')).toBe(0);
    expect(countRows(db, 'planning_weekday')).toBe(0);
    expect(countRows(db, 'planning_override')).toBe(0);
    db.close();
  });

  it('leaves a materialised day alone when its template is deleted', () => {
    // THE COUNTERWEIGHT TO THE CASCADE ABOVE, and the reason the asymmetry is
    // right rather than merely convenient. day.template_id_snapshot carries no
    // foreign key: it is history, and specs 5.2 forbids rewriting history.
    // The planning is live configuration, and a dangling row there means
    // nothing at all.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    db.pragma('foreign_keys = ON');
    insertTemplate(db);

    db.prepare(
      'INSERT INTO day (date, template_id_snapshot, template_name_snapshot, materialized_at) ' +
        'VALUES (?, ?, ?, ?)',
    ).run('2026-09-15', 't1', "Jour d'entrainement", 1_789_000_000_000);

    db.prepare('DELETE FROM day_template WHERE id = ?').run('t1');

    const row = db
      .prepare('SELECT template_id_snapshot AS id, template_name_snapshot AS name FROM day')
      .get() as { id: string | null; name: string | null };

    expect(row.id).toBe('t1');
    expect(row.name).toBe("Jour d'entrainement");
    db.close();
  });
});

describe('replaying 0004 over a populated database (D6/G4)', () => {
  it('applies to a database already carrying a journal', () => {
    // The path every existing installation takes: 0004 lands on a phone with
    // months of entries in it. It creates four empty tables and touches
    // nothing else — which is what makes it safe to ship without a backfill.
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(PLANNING_MIGRATION) - 1);
    db.pragma('foreign_keys = ON');

    db.prepare(
      'INSERT INTO day (date, template_id_snapshot, template_name_snapshot, materialized_at) ' +
        'VALUES (?, NULL, NULL, ?)',
    ).run('2026-09-11', 1_789_000_000_000);
    db.prepare(
      'INSERT INTO day_meal (id, date, position, name) VALUES (?, ?, 0, ?)',
    ).run('dm1', '2026-09-11', 'Dejeuner');
    db.prepare(
      `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name,
                                  base_unit, quantity, protein_100, carbs_100,
                                  fat_100, kcal_100)
       VALUES ('e1', 'dm1', '2026-09-11', 0, 'free', 'Saisie libre', 'g', 100,
               20, 10, 5, 185)`,
    ).run();

    expect(() => applyMigrationsAfter(db, indexOfTag(PLANNING_MIGRATION) - 1)).not.toThrow();

    // The journal came through untouched, and the new tables arrive empty:
    // 0004 seeds no default template. Specs 8.1 assumes one always exists, and
    // the fallback meal list of day-plan.ts is what answers that instead — a
    // seeded row would be a second source of meal names without removing the
    // first, and it can be created by a screen in two taps.
    expect(countRows(db, 'journal_entry')).toBe(1);
    expect(countRows(db, 'day_template')).toBe(0);
    expect(countRows(db, 'planning_weekday')).toBe(0);

    // And the day materialised before templates existed keeps its empty
    // snapshot, which is the truthful record: no template existed then.
    const row = db.prepare('SELECT template_id_snapshot AS id FROM day').get() as {
      id: string | null;
    };
    expect(row.id).toBeNull();
    db.close();
  });
});
