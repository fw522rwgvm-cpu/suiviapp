import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyMigration,
  applyMigrationsUpTo,
  columnNames,
  indexOfTag,
  openEmptyDatabase,
  readMigrationSql,
  tableNames,
} from '../helpers/migrations';

/**
 * 0002 is what this file is about, so the inventory assertions replay UP TO
 * 0002 rather than replaying everything.
 *
 * They used to replay everything, which meant the same thing only for as long
 * as 0002 was the last migration. The day 0003 added `barcode` and `off_cache`
 * — both of them deferred, by name, in the comments below — four of these
 * turned red at once. Recut this way they say something stronger and permanent:
 * this is what the frozen migration produces, whatever is layered on later.
 * What 0003 adds is asserted in replay-off.test.ts.
 *
 * The behavioural assertions — CHECK constraints, the cascade, the missing
 * foreign key — keep replaying everything, because they are about the database
 * the application actually runs against.
 */
const FOOD_MIGRATION = '0002_food';

/**
 * The food tables of schema 2.2, replayed in Node (D6/G4).
 *
 * Migration 0002 is frozen the day it ships (D6/G2), and SQLite cannot add a
 * CHECK or a foreign key afterwards without rebuilding the table. So what
 * these tests protect is the shape that can no longer be corrected in place —
 * and the only moment it can still be corrected at all is before the first
 * build carries it to the phone.
 *
 * Every constraint is exercised from BOTH sides. A CHECK that is present but
 * never fires is indistinguishable from one that was forgotten, and the
 * assertion that catches that is the one that tries to violate it.
 */

function indexNames(db: Database.Database, table: string): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all(table) as { name: string }[];
  return rows.map((row) => row.name);
}

/** A complete, valid food. Deliberately not a favourite and not 100 g. */
function insertFood(db: Database.Database, id = 'f1'): void {
  db.prepare(
    `INSERT INTO food (id, name, brand, source, base_unit,
                       protein_100, carbs_100, fat_100, kcal_100,
                       display_ref_qty, is_favorite, created_at, updated_at)
     VALUES (?, 'Pain de mie', 'Sans marque', 'perso', 'g',
             8.5, 47.2, 3.1, 265, 30, 0, 1789000000001, 1789000000001)`,
  ).run(id);
}

describe('food schema', () => {
  it('creates the two tables of section 2.2 that slice 3 uses, and only those', () => {
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));
      const tables = tableNames(db);
      expect(tables).toContain('food');
      expect(tables).toContain('food_portion');

      // Recipes are slice 6, the Open Food Facts cache slice 4. Their absence
      // is the point: no layer built "for later" (section 7). off_cache
      // arrived in 0003 and is asserted there; what is asserted HERE is that
      // 0002 never carried it.
      expect(tables).not.toContain('recipe');
      expect(tables).not.toContain('recipe_ingredient');
      expect(tables).not.toContain('off_cache');
    } finally {
      db.close();
    }
  });

  it('carries exactly the columns slice 3 decided on', () => {
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));

      // `barcode` is deliberately ABSENT, and this assertion is the record of
      // that decision holding. The rule that produced this list: 0002 carries
      // what cannot be added later — NOT NULL columns and CHECK constraints —
      // and defers what can. A nullable, unconstrained column with no user
      // before the scan of slice 4 can arrive by ALTER TABLE, and in 0003 it
      // did: one statement, on a table full of real data, nothing rebuilt.
      expect(columnNames(db, 'food')).toEqual([
        'base_unit',
        'brand',
        'carbs_100',
        'created_at',
        'display_ref_qty',
        'fat_100',
        'id',
        'is_favorite',
        'kcal_100',
        'name',
        'protein_100',
        'source',
        'updated_at',
      ]);

      expect(columnNames(db, 'food_portion')).toEqual([
        'food_id',
        'id',
        'name',
        'position',
        'quantity',
      ]);
    } finally {
      db.close();
    }
  });

  it('indexes what section 2.2 asks to be indexed', () => {
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));
      // ux_food_barcode is deferred with its column, and lands in 0003.
      expect(indexNames(db, 'food')).toEqual(['ix_food_name']);
      expect(indexNames(db, 'food_portion')).toEqual(['ux_portion_food_name']);
    } finally {
      db.close();
    }
  });

  it('sorts case-insensitively, which is the one thing ix_food_name buys', () => {
    // The index is NOCASE so that 'abricot' comes before 'Zucchini' rather
    // than after every capital letter. It does NOT serve the search: LIKE
    // '%x%' uses no index, ever, and the search is a pure function over a
    // cached list (domain/food-search.ts).
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      for (const [id, name] of [
        ['a', 'Zucchini'],
        ['b', 'abricot'],
        ['c', 'Banane'],
      ]) {
        db.prepare(
          `INSERT INTO food (id, name, source, base_unit,
                             protein_100, carbs_100, fat_100, kcal_100)
           VALUES (?, ?, 'perso', 'g', 0, 0, 0, 0)`,
        ).run(id, name);
      }

      const rows = db
        .prepare('SELECT name FROM food ORDER BY name COLLATE NOCASE')
        .all() as { name: string }[];
      expect(rows.map((row) => row.name)).toEqual(['abricot', 'Banane', 'Zucchini']);
    } finally {
      db.close();
    }
  });

  it('accepts perso and off as an origin, and nothing else', () => {
    // 'off' is allowed three slices before anything writes it, because the
    // CHECK carrying this set cannot be widened without rebuilding the table.
    // The specs spell it 'openfoodfacts' in section 6.1; section 6 opens by
    // declaring itself non-normative on the data model, and schema 2.2 wins.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      const insert = db.prepare(
        `INSERT INTO food (id, name, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES (?, 'x', ?, 'g', 0, 0, 0, 0)`,
      );

      expect(() => insert.run('a', 'perso')).not.toThrow();
      expect(() => insert.run('b', 'off')).not.toThrow();
      expect(() => insert.run('c', 'openfoodfacts')).toThrow();
      expect(() => insert.run('d', '')).toThrow();
      expect(() => insert.run('e', 'Perso')).toThrow();
    } finally {
      db.close();
    }
  });

  it('accepts g and ml as a base unit, and nothing else — NULL included', () => {
    // Watertight, with no conversion and no density (specs 5.1). Unlike
    // journal_entry.base_unit, this one is NOT NULL: a food without a unit has
    // no scale for its macros at all.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      const insert = db.prepare(
        `INSERT INTO food (id, name, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES (?, 'x', 'perso', ?, 0, 0, 0, 0)`,
      );

      expect(() => insert.run('a', 'g')).not.toThrow();
      expect(() => insert.run('b', 'ml')).not.toThrow();
      expect(() => insert.run('c', 'oz')).toThrow();
      expect(() => insert.run('d', 'G')).toThrow();
      expect(() => insert.run('e', null)).toThrow();
    } finally {
      db.close();
    }
  });

  it('keeps is_favorite to 0 or 1, and defaults it to 0', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      const insert = db.prepare(
        `INSERT INTO food (id, name, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100, is_favorite)
         VALUES (?, 'x', 'perso', 'g', 0, 0, 0, 0, ?)`,
      );

      expect(() => insert.run('a', 0)).not.toThrow();
      expect(() => insert.run('b', 1)).not.toThrow();
      expect(() => insert.run('c', 2)).toThrow();
      expect(() => insert.run('d', -1)).toThrow();

      db.prepare(
        `INSERT INTO food (id, name, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('e', 'x', 'perso', 'g', 0, 0, 0, 0)`,
      ).run();
      const row = db.prepare("SELECT is_favorite, display_ref_qty FROM food WHERE id = 'e'").get() as {
        is_favorite: number;
        display_ref_qty: number;
      };
      // 0/1 as an INTEGER, never a boolean: Drizzle's mode: 'boolean' would
      // hand the exporter true/false, which it refuses to serialise.
      expect(row.is_favorite).toBe(0);
      // The default is the identity of the canonical form.
      expect(row.display_ref_qty).toBe(100);
    } finally {
      db.close();
    }
  });

  it('refuses a macro nowhere and a portion quantity of zero', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);

      // The macros carry NO CHECK, and that is a refusal rather than an
      // omission: specs 8.5 requires Open Food Facts values to be marked and
      // editable, never refused, and slice 4 copies every logged product into
      // this table automatically. A negative macro is absurd and still gets in,
      // because a blocked automatic copy would be worse than an absurd number
      // the screen can flag.
      expect(() =>
        db
          .prepare(
            `INSERT INTO food (id, name, source, base_unit,
                               protein_100, carbs_100, fat_100, kcal_100)
             VALUES ('odd', 'x', 'perso', 'g', -1, 0, 0, 99999)`,
          )
          .run(),
      ).not.toThrow();

      // A portion quantity, on the other hand, is compulsory (specs 6.1 v2.2)
      // precisely because a portion without one is not calculable — and zero
      // is the same defect one step further.
      insertFood(db);
      const portion = db.prepare(
        "INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES (?, 'f1', ?, ?, 0)",
      );
      expect(() => portion.run('p1', 'tranche', 25)).not.toThrow();
      expect(() => portion.run('p2', 'bol', 0)).toThrow();
      expect(() => portion.run('p3', 'verre', -5)).toThrow();
    } finally {
      db.close();
    }
  });

  it('accepts any portion name, on purpose', () => {
    // No CHECK here, where kind and base_unit got one. The line is not how
    // likely the set is to move but what widening it would break: widening
    // `kind` breaks the clause-free SUM, widening `base_unit` breaks
    // watertightness, widening the portion vocabulary breaks nothing.
    //
    // The closed list of specs 6.1 is enforced where it can name a line
    // number instead of a constraint — see the one_of rule in
    // table-catalog.ts, applied before the first insertion of an import.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db);
      expect(() =>
        db
          .prepare(
            "INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES ('p', 'f1', 'sachet', 12, 0)",
          )
          .run(),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('holds one portion name per food, and the same name across two foods', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db, 'f1');
      insertFood(db, 'f2');
      const portion = db.prepare(
        'INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES (?, ?, ?, ?, ?)',
      );

      expect(() => portion.run('p1', 'f1', 'tranche', 25, 0)).not.toThrow();
      // Unique PER FOOD (specs 6.1 v2.2): two foods may each have a slice, and
      // they are different sizes.
      expect(() => portion.run('p2', 'f2', 'tranche', 40, 0)).not.toThrow();
      expect(() => portion.run('p3', 'f1', 'tranche', 30, 1)).toThrow();
    } finally {
      db.close();
    }
  });

  it('deletes a food down to its portions, in one cascade', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db);
      db.prepare(
        "INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES ('p1', 'f1', 'tranche', 25, 0)",
      ).run();

      db.prepare("DELETE FROM food WHERE id = 'f1'").run();

      const rows = db.prepare('SELECT COUNT(*) AS n FROM food_portion').get() as { n: number };
      expect(rows.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('refuses a portion attached to no food', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      expect(() =>
        db
          .prepare(
            "INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES ('p', 'ghost', 'bol', 250, 0)",
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it('leaves a consumed food deletable, and its entries untouched (specs 5.3)', () => {
    // THE ASSERTION THAT JUSTIFIES HAVING NO FOREIGN KEY on source_food_id.
    //
    // With a cascade it would destroy history; with a restrict it would block
    // a deletion specs 5.3 says is never blocked. It has neither, and it could
    // not have either: journal_entry has been frozen since 0001, and SQLite
    // has no ALTER TABLE ADD CONSTRAINT.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db);
      db.prepare("INSERT INTO day (date, materialized_at) VALUES ('2026-09-11', 1)").run();
      db.prepare(
        "INSERT INTO day_meal (id, date, position, name) VALUES ('m1', '2026-09-11', 0, 'Déjeuner')",
      ).run();
      db.prepare(
        `INSERT INTO journal_entry
           (id, day_meal_id, date, position, kind, source_food_id, name, base_unit,
            quantity, protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('e1', 'm1', '2026-09-11', 0, 'food', 'f1', 'Pain de mie', 'g',
                 60, 8.5, 47.2, 3.1, 265)`,
      ).run();

      expect(() => db.prepare("DELETE FROM food WHERE id = 'f1'").run()).not.toThrow();

      const entry = db.prepare("SELECT * FROM journal_entry WHERE id = 'e1'").get() as Record<
        string,
        unknown
      >;
      // Intact, frozen capsule and all — including the now-dangling link,
      // which is kept rather than nulled: it is the only trace tying this
      // entry to what it was.
      expect(entry['name']).toBe('Pain de mie');
      expect(entry['quantity']).toBe(60);
      expect(entry['kcal_100']).toBe(265);
      expect(entry['source_food_id']).toBe('f1');

      // And the integrity check the import runs sees nothing wrong, because
      // there is no constraint for it to see. That is the specification.
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      expect(violations).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('adds itself to a database that already carries slices 0 and 1, losing nothing', () => {
    // G4, and the upgrade path of the daily installation: it has 0000 and 0001
    // applied with real history in it, and 0002 lands on top. From slice 1 on,
    // every migration arrives on a database already in use.
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, 1);
      db.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'dark')").run();
      db.prepare("INSERT INTO day (date, materialized_at) VALUES ('2026-09-11', 1)").run();
      db.prepare(
        "INSERT INTO day_meal (id, date, position, name) VALUES ('m1', '2026-09-11', 0, 'Déjeuner')",
      ).run();
      db.prepare(
        `INSERT INTO journal_entry
           (id, day_meal_id, date, position, kind, name, base_unit, quantity,
            protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('e1', 'm1', '2026-09-11', 0, 'free', 'Saisie libre', 'g', 100,
                 20, 30, 10, 330)`,
      ).run();

      // 0002 ALONE, named rather than "everything after 0001": that spelling
      // meant the same thing only while 0002 was last, and 0003 broke it.
      applyMigration(db, readMigrationSql(FOOD_MIGRATION));

      const kept = db.prepare("SELECT value FROM setting WHERE key = 'theme'").get() as {
        value: string;
      };
      expect(kept.value).toBe('dark');
      const entries = db.prepare('SELECT COUNT(*) AS n FROM journal_entry').get() as {
        n: number;
      };
      expect(entries.n).toBe(1);

      // 0002 creates and backfills nothing, because there is nothing to carry
      // over: no food can be inferred from a free entry without inventing it.
      const foods = db.prepare('SELECT COUNT(*) AS n FROM food').get() as { n: number };
      expect(foods.n).toBe(0);
    } finally {
      db.close();
    }
  });
});
