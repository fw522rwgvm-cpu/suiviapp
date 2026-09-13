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
 * Migration 0003: the barcode and the Open Food Facts cache (D6/G4).
 *
 * WHAT MAKES THIS ONE DIFFERENT FROM EVERY MIGRATION BEFORE IT.
 *
 * 0001 and 0002 created tables. This one ALTERS a table that already holds
 * real data on a phone in daily use — the first time the project does that.
 * It is also the payoff of a decision taken one slice early: slice 3 deferred
 * `barcode` and `ux_food_barcode` on the grounds that a nullable, unconstrained
 * column and an index can always be added later, where a NOT NULL column or a
 * CHECK cannot. The assertions below are what turns that reasoning into
 * something checked rather than believed.
 *
 * Constraints are exercised from BOTH sides, as in replay-food: a unique index
 * that is present but never fires looks exactly like one that was forgotten.
 */

const OFF_MIGRATION = '0003_barcode_off_cache';
const FOOD_MIGRATION = '0002_food';

function indexNames(db: Database.Database, table: string): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all(table) as { name: string }[];
  return rows.map((row) => row.name);
}

function insertFood(
  db: Database.Database,
  id: string,
  barcode: string | null,
  name = 'Nutella',
): void {
  db.prepare(
    `INSERT INTO food (id, name, barcode, source, base_unit,
                       protein_100, carbs_100, fat_100, kcal_100)
     VALUES (?, ?, ?, 'off', 'g', 6.3, 57.5, 30.9, 539)`,
  ).run(id, name, barcode);
}

describe('0003 — barcode and the Open Food Facts cache', () => {
  it('adds the barcode to food without rebuilding it', () => {
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));
      expect(columnNames(db, 'food')).not.toContain('barcode');

      applyMigration(db, readMigrationSql(OFF_MIGRATION));

      expect(columnNames(db, 'food')).toContain('barcode');
      // Nothing else moved. An ALTER TABLE ADD COLUMN cannot disturb the rest,
      // which is exactly why this column was worth deferring for a slice.
      expect(columnNames(db, 'food')).toEqual([
        'barcode',
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
    } finally {
      db.close();
    }
  });

  it('lands on a database already full of foods, keeping every one of them', () => {
    // THE UPGRADE PATH OF THE DAILY INSTALLATION, which has 0000 to 0002
    // applied and a real library in it. From slice 1 on, every migration
    // arrives on a database in use; from slice 4 on, one of them alters a
    // table rather than creating one.
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));
      db.prepare(
        `INSERT INTO food (id, name, brand, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100,
                           display_ref_qty, is_favorite)
         VALUES ('f1', 'Pain de mie', 'Sans marque', 'perso', 'g',
                 8.5, 47.2, 3.1, 265, 30, 1)`,
      ).run();
      db.prepare(
        "INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES ('p1', 'f1', 'tranche', 25, 0)",
      ).run();

      applyMigration(db, readMigrationSql(OFF_MIGRATION));

      const row = db.prepare("SELECT * FROM food WHERE id = 'f1'").get() as Record<
        string,
        unknown
      >;
      expect(row['name']).toBe('Pain de mie');
      expect(row['brand']).toBe('Sans marque');
      expect(row['is_favorite']).toBe(1);
      expect(row['display_ref_qty']).toBe(30);
      // The new column arrives NULL, which is the honest value: this food has
      // no barcode and never did. ALTER TABLE ADD COLUMN cannot do otherwise
      // for a nullable column without a default, and that is the property the
      // deferral relied on.
      expect(row['barcode']).toBeNull();

      const portions = db.prepare('SELECT COUNT(*) AS n FROM food_portion').get() as {
        n: number;
      };
      expect(portions.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('holds one food per barcode — the deduplication of specs 8.5, in the database', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);

      insertFood(db, 'a', '3017620422003');
      // The same product a second time is refused. THIS is what makes the
      // deduplication a guarantee rather than something a screen remembers to
      // do — and it is also why the copy path reads by barcode and updates
      // instead of inserting blind.
      expect(() => insertFood(db, 'b', '3017620422003', 'Nutella (encore)')).toThrow();
      // A different barcode is fine.
      expect(() => insertFood(db, 'c', '3033710065967', 'Lait')).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('lets every barcode-less food coexist, which is most of the library', () => {
    // The PARTIAL part. SQLite treats NULLs as distinct in a unique index, so
    // the WHERE clause changes no behaviour here — it states the intention and
    // keeps the index to the rows that have one. Asserted anyway, because the
    // failure it would cause is catastrophic and silent to a reader: a library
    // that refuses a second home-made food.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);

      expect(() => insertFood(db, 'a', null, 'Pomme')).not.toThrow();
      expect(() => insertFood(db, 'b', null, 'Riz')).not.toThrow();
      expect(() => insertFood(db, 'c', null, 'Poulet')).not.toThrow();

      const rows = db.prepare('SELECT COUNT(*) AS n FROM food').get() as { n: number };
      expect(rows.n).toBe(3);
    } finally {
      db.close();
    }
  });

  it('keeps a barcode a string, zeros and all', () => {
    // An EAN can begin with a zero and a barcode read as a number loses it.
    // SQLite has no length or format constraint here on purpose — a barcode is
    // an external identifier with no closed set — so what is asserted is that
    // the column stores text and hands it back unchanged.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db, 'a', '0000000004011', 'Banane');

      const row = db.prepare("SELECT barcode FROM food WHERE id = 'a'").get() as {
        barcode: unknown;
      };
      expect(row.barcode).toBe('0000000004011');
      expect(typeof row.barcode).toBe('string');
    } finally {
      db.close();
    }
  });

  it('still refuses nothing about the macros, which is the point of slice 3', () => {
    // 0003 adds a unique index, and a unique index is the first thing in this
    // table that can make an INSERT fail. The refusal that shaped slice 3 —
    // no CHECK on the macros, so the automatic copy of specs 8.5 can never be
    // blocked by an odd value — must survive it.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      expect(() =>
        db
          .prepare(
            `INSERT INTO food (id, name, barcode, source, base_unit,
                               protein_100, carbs_100, fat_100, kcal_100)
             VALUES ('odd', 'Produit douteux', '1234567890128', 'off', 'g',
                     -1, 0, 0, 99999)`,
          )
          .run(),
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('creates the cache table of section 2.4, and nothing more', () => {
    const db = openEmptyDatabase();
    try {
      applyMigrationsUpTo(db, indexOfTag(FOOD_MIGRATION));
      expect(tableNames(db)).not.toContain('off_cache');

      applyMigration(db, readMigrationSql(OFF_MIGRATION));

      expect(tableNames(db)).toContain('off_cache');
      expect(columnNames(db, 'off_cache')).toEqual(['barcode', 'fetched_at', 'payload']);
      // No index: the 30-day sweep walks a few hundred rows, and an index is
      // the one thing in a migration that can still be added later.
      expect(indexNames(db, 'off_cache')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('keys the cache on the barcode, one row per product', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      const insert = db.prepare(
        'INSERT INTO off_cache (barcode, payload, fetched_at) VALUES (?, ?, ?)',
      );

      insert.run('3017620422003', '{"name":"Nutella"}', 1_789_000_000_000);
      expect(() =>
        insert.run('3017620422003', '{"name":"Nutella"}', 1_789_000_000_001),
      ).toThrow();

      // Replacing is how the opportunistic refresh writes: same key, newer
      // payload and stamp. It touches nothing in `food` — which is the whole
      // answer to what becomes of a correction when the cache refreshes.
      db.prepare(
        'INSERT OR REPLACE INTO off_cache (barcode, payload, fetched_at) VALUES (?, ?, ?)',
      ).run('3017620422003', '{"name":"Nutella","kcal100":539}', 1_789_000_000_002);

      const row = db
        .prepare("SELECT * FROM off_cache WHERE barcode = '3017620422003'")
        .get() as Record<string, unknown>;
      expect(row['fetched_at']).toBe(1_789_000_000_002);

      const count = db.prepare('SELECT COUNT(*) AS n FROM off_cache').get() as { n: number };
      expect(count.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('refuses a cache row with no payload or no stamp', () => {
    // Both NOT NULL: a cached product with no fetch time has no age, and the
    // 30-day validity of specs 8.5 is measured from exactly that column.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      const insert = db.prepare(
        'INSERT INTO off_cache (barcode, payload, fetched_at) VALUES (?, ?, ?)',
      );

      expect(() => insert.run('a', null, 1_789_000_000_000)).toThrow();
      expect(() => insert.run('b', '{}', null)).toThrow();
    } finally {
      db.close();
    }
  });

  it('leaves the cache entirely alone when a food is deleted', () => {
    // No foreign key between them, and it would be wrong to have one: they are
    // keyed differently (a ULID against a barcode) and they answer different
    // questions. Deleting a food must not evict a cached product, and a cached
    // product must never keep a food alive.
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      insertFood(db, 'a', '3017620422003');
      db.prepare(
        'INSERT INTO off_cache (barcode, payload, fetched_at) VALUES (?, ?, ?)',
      ).run('3017620422003', '{"name":"Nutella"}', 1_789_000_000_000);

      db.prepare("DELETE FROM food WHERE id = 'a'").run();

      const count = db.prepare('SELECT COUNT(*) AS n FROM off_cache').get() as { n: number };
      expect(count.n).toBe(1);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
