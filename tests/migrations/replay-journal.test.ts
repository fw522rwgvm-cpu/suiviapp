import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyMigration,
  applyMigrationsUpTo,
  columnNames,
  openEmptyDatabase,
  readJournal,
  readMigrationSql,
  tableNames,
} from '../helpers/migrations';

/**
 * The journal tables of schema 2.3, replayed in Node (D6/G4).
 *
 * From this slice on, migrations are add-only (D6/G2): what these tests really
 * protect is the shape that can no longer be corrected in place. A missing
 * CHECK or a cascade that does not cascade would be found months later, on a
 * populated database, with only a rebuild to fix it.
 */

function indexNames(db: Database.Database, table: string): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all(table) as { name: string }[];
  return rows.map((row) => row.name);
}

function seedOneEntry(db: Database.Database): void {
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
}

describe('journal schema', () => {
  it('creates the three tables of section 2.3, and only those', () => {
    const db = openEmptyDatabase();
    try {
      // Stops AT 0001 rather than replaying everything, because the claim is
      // about what this migration created — not about what the schema holds
      // today. Written against the whole journal it would have to be edited
      // at every later slice, and each edit is a chance to weaken it into
      // "whatever happens to be there now".
      applyMigrationsUpTo(db, 1);
      const tables = tableNames(db);
      expect(tables).toContain('day');
      expect(tables).toContain('day_meal');
      expect(tables).toContain('journal_entry');

      // Templates, planning, foods and recipes belong to later slices. Their
      // absence here is the point: no layer built "for later" (section 7).
      // `food` arrives in 0002, and it arriving LATER is exactly the property
      // that lets an archive written at 0001 be imported without it.
      expect(tables).not.toContain('day_template');
      expect(tables).not.toContain('planning_weekday');
      expect(tables).not.toContain('food');
      expect(tables).not.toContain('food_portion');
      expect(tables).not.toContain('recipe');
    } finally {
      db.close();
    }
  });

  it('carries exactly the columns section 2.3 describes', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);

      expect(columnNames(db, 'day')).toEqual([
        'date',
        'materialized_at',
        'template_id_snapshot',
        'template_name_snapshot',
      ]);

      expect(columnNames(db, 'day_meal')).toEqual([
        'date',
        'id',
        'name',
        'position',
        'target_carbs',
        'target_fat',
        'target_kcal',
        'target_protein',
      ]);

      expect(columnNames(db, 'journal_entry')).toEqual([
        'base_unit',
        'brand',
        'carbs_100',
        'created_at',
        'date',
        'day_meal_id',
        'fat_100',
        'id',
        'kcal_100',
        'kind',
        'name',
        'parent_entry_id',
        'portion_name',
        'portion_quantity',
        'position',
        'protein_100',
        'quantity',
        'source_food_id',
        'source_recipe_id',
        'updated_at',
      ]);
    } finally {
      db.close();
    }
  });

  it('indexes everything section 2.3 asks to be indexed', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      expect(indexNames(db, 'day_meal')).toContain('ix_day_meal_date');
      expect(indexNames(db, 'journal_entry')).toEqual([
        'ix_entry_date',
        'ix_entry_meal',
        'ix_entry_parent',
        'ix_entry_source_food',
      ]);
    } finally {
      db.close();
    }
  });

  it('deletes a day down to its entries, in one cascade', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      seedOneEntry(db);

      db.prepare("DELETE FROM day WHERE date = '2026-09-11'").run();

      const meals = db.prepare('SELECT COUNT(*) AS n FROM day_meal').get() as { n: number };
      const entries = db.prepare('SELECT COUNT(*) AS n FROM journal_entry').get() as {
        n: number;
      };
      // Two hops: day -> day_meal -> journal_entry. If the second one did not
      // cascade, orphan entries would keep counting towards every statistic.
      expect(meals.n).toBe(0);
      expect(entries.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('refuses an entry attached to no meal', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      expect(() =>
        db
          .prepare(
            `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name)
             VALUES ('e1', 'ghost', '2026-09-11', 0, 'free', 'Saisie libre')`,
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it('accepts the four kinds and rejects anything else', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      db.prepare("INSERT INTO day (date, materialized_at) VALUES ('2026-09-11', 1)").run();
      db.prepare(
        "INSERT INTO day_meal (id, date, position, name) VALUES ('m1', '2026-09-11', 0, 'Déjeuner')",
      ).run();

      const insert = db.prepare(
        `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name)
         VALUES (?, 'm1', '2026-09-11', 0, ?, 'x')`,
      );

      for (const kind of ['food', 'recipe', 'recipe_item', 'free']) {
        expect(() => insert.run(`ok-${kind}`, kind)).not.toThrow();
      }
      expect(() => insert.run('nope', 'snack')).toThrow();
      expect(() => insert.run('empty', '')).toThrow();
    } finally {
      db.close();
    }
  });

  it('accepts g, ml and nothing else as a base unit, NULL aside', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      db.prepare("INSERT INTO day (date, materialized_at) VALUES ('2026-09-11', 1)").run();
      db.prepare(
        "INSERT INTO day_meal (id, date, position, name) VALUES ('m1', '2026-09-11', 0, 'Déjeuner')",
      ).run();

      const insert = db.prepare(
        `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name, base_unit)
         VALUES (?, 'm1', '2026-09-11', 0, 'food', 'x', ?)`,
      );

      expect(() => insert.run('g', 'g')).not.toThrow();
      expect(() => insert.run('ml', 'ml')).not.toThrow();
      // A recipe parent carries no unit at all (D5/R2).
      expect(() => insert.run('none', null)).not.toThrow();
      // Units are watertight: no ounces, no conversion (specs 5.1).
      expect(() => insert.run('oz', 'oz')).toThrow();
      expect(() => insert.run('upper', 'G')).toThrow();
    } finally {
      db.close();
    }
  });

  it('sums macros without double counting a grouped parent', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      db.prepare("INSERT INTO day (date, materialized_at) VALUES ('2026-09-11', 1)").run();
      db.prepare(
        "INSERT INTO day_meal (id, date, position, name) VALUES ('m1', '2026-09-11', 0, 'Déjeuner')",
      ).run();

      // A recipe parent: name and quantity, no macros at all (D5/R2).
      db.prepare(
        `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name, quantity)
         VALUES ('parent', 'm1', '2026-09-11', 0, 'recipe', 'Chili', 1)`,
      ).run();
      // Its ingredient lines carry everything.
      db.prepare(
        `INSERT INTO journal_entry
           (id, day_meal_id, date, parent_entry_id, position, kind, name, base_unit,
            quantity, protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('leaf', 'm1', '2026-09-11', 'parent', 0, 'recipe_item', 'Boeuf', 'g',
                 200, 26, 0, 15, 250)`,
      ).run();

      // Deliberately written with no filtering clause whatsoever. It is still
      // right, because the parent's macros are NULL and SUM ignores NULLs:
      // that is what D5/R2 buys — double counting becomes impossible rather
      // than conditionally avoided.
      const total = db
        .prepare(
          `SELECT SUM(quantity * protein_100 / 100.0) AS protein,
                  SUM(quantity * kcal_100    / 100.0) AS kcal
             FROM journal_entry WHERE date = '2026-09-11'`,
        )
        .get() as { protein: number; kcal: number };

      expect(total.protein).toBeCloseTo(52, 10);
      expect(total.kcal).toBeCloseTo(500, 10);
    } finally {
      db.close();
    }
  });

  it('totals a free entry to exactly what was typed in', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      seedOneEntry(db);

      // A free entry is 100 units of a virtual food (D5/R2), so quantity/100
      // is 1 and the total is the entered value, through the same expression
      // as every other row.
      const total = db
        .prepare(
          `SELECT SUM(quantity * protein_100 / 100.0) AS protein,
                  SUM(quantity * carbs_100   / 100.0) AS carbs,
                  SUM(quantity * fat_100     / 100.0) AS fat,
                  SUM(quantity * kcal_100    / 100.0) AS kcal
             FROM journal_entry WHERE date = '2026-09-11'`,
        )
        .get() as { protein: number; carbs: number; fat: number; kcal: number };

      expect(total).toEqual({ protein: 20, carbs: 30, fat: 10, kcal: 330 });
    } finally {
      db.close();
    }
  });

  it('adds itself to a database that already carries slice 0, without losing data', () => {
    // The upgrade path of the daily installation, which has 0000 applied and
    // real settings in it. D6/G2 makes this the regime from here on: every
    // later migration lands on a database that is already in use.
    const db = openEmptyDatabase();
    try {
      const entries = readJournal();
      const initial = entries[0];
      const journalMigration = entries[1];
      expect(initial?.tag).toBe('0000_initial_setting');
      expect(journalMigration?.tag).toBe('0001_journal');

      applyMigration(db, readMigrationSql(initial!.tag));
      db.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'dark')").run();

      applyMigration(db, readMigrationSql(journalMigration!.tag));

      const kept = db.prepare("SELECT value FROM setting WHERE key = 'theme'").get() as {
        value: string;
      };
      expect(kept.value).toBe('dark');
      expect(tableNames(db)).toContain('journal_entry');
    } finally {
      db.close();
    }
  });
});
