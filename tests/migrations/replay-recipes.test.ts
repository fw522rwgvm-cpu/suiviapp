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
 * The recipe tables of schema 2.2, replayed in Node (D6/G4).
 *
 * 0005 is frozen the day it ships (D6/G2), and SQLite can add neither a CHECK
 * nor a foreign key afterwards without rebuilding the table. Everything
 * irreversible in slice 6 is in that one file: three foreign keys, six CHECKs,
 * and two NOT NULL columns that schema 2.2 left nullable. This is the last
 * moment any of it can still be corrected, so each is exercised FROM BOTH
 * SIDES — a constraint that is present but never fires is indistinguishable
 * from one that was forgotten, and the assertion that catches that is the one
 * that tries to violate it.
 */

const RECIPE_MIGRATION = '0005_recipes';

function insertFood(db: Database.Database, id = 'f1', unit = 'g'): void {
  db.prepare(
    `INSERT INTO food (id, name, source, base_unit, protein_100, carbs_100,
                       fat_100, kcal_100)
     VALUES (?, ?, 'perso', ?, 8.25, 47.5, 3.125, 265.5)`,
  ).run(id, 'Pois chiches', unit);
}

function insertRecipe(db: Database.Database, id = 'r1'): void {
  db.prepare(
    `INSERT INTO recipe (id, name, prep_minutes, yield_type, yield_value,
                         is_favorite, created_at, updated_at)
     VALUES (?, 'Curry', 45, 'portions', 4, 1, ?, ?)`,
  ).run(id, 1_789_000_000_000, 1_789_000_000_000);
}

function insertIngredient(
  db: Database.Database,
  values: {
    id?: string;
    recipeId?: string;
    foodId?: string | null;
    quantity?: number;
    unit?: string;
    frozenKcal?: number | null;
    frozenBaseUnit?: string | null;
  } = {},
): void {
  db.prepare(
    `INSERT INTO recipe_ingredient (id, recipe_id, position, food_id, quantity, unit,
                                    frozen_base_unit, frozen_kcal_100)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(
    values.id ?? 'i1',
    values.recipeId ?? 'r1',
    values.foodId === undefined ? 'f1' : values.foodId,
    values.quantity ?? 180.25,
    values.unit ?? 'g',
    values.frozenBaseUnit ?? null,
    values.frozenKcal ?? null,
  );
}

function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('migration 0005 — what it creates', () => {
  it('adds the four tables and nothing else', () => {
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(RECIPE_MIGRATION) - 1);
    const before = new Set(tableNames(db));

    applyOneMigration(db, RECIPE_MIGRATION);
    const added = tableNames(db).filter((name) => !before.has(name));

    expect(added).toEqual(['recipe', 'recipe_ingredient', 'recipe_step', 'recipe_tag']);
    db.close();
  });

  it('spells the columns exactly as section 2.2 does', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    // columnNames sorts, so these read alphabetically rather than in
    // declaration order.
    expect(columnNames(db, 'recipe')).toEqual([
      'created_at',
      'id',
      'is_favorite',
      'name',
      'prep_minutes',
      'updated_at',
      'yield_type',
      'yield_value',
    ]);
    expect(columnNames(db, 'recipe_tag')).toEqual(['recipe_id', 'tag']);
    expect(columnNames(db, 'recipe_step')).toEqual(['id', 'position', 'recipe_id', 'text']);
    expect(columnNames(db, 'recipe_ingredient')).toEqual([
      'food_id',
      'frozen_at',
      'frozen_base_unit',
      'frozen_carbs_100',
      'frozen_fat_100',
      'frozen_kcal_100',
      'frozen_name',
      'frozen_protein_100',
      'id',
      'position',
      'quantity',
      'recipe_id',
      'unit',
    ]);
    db.close();
  });

  it('creates ix_ingredient_food, the one reversible part of this migration', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'recipe_ingredient'")
      .all() as { name: string }[];

    expect(indexes.map((row) => row.name)).toContain('ix_ingredient_food');
    db.close();
  });

  it('gives recipe_tag a composite primary key rather than an identifier', () => {
    // Schema 2.2 declares PRIMARY KEY(recipe_id, tag) and no id: a tag is not
    // an entity, it is the fact that this recipe carries this word.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertRecipe(db);

    db.prepare("INSERT INTO recipe_tag (recipe_id, tag) VALUES ('r1', 'végétarien')").run();

    // The same tag twice on one recipe is impossible rather than merely
    // avoided.
    expect(() =>
      db.prepare("INSERT INTO recipe_tag (recipe_id, tag) VALUES ('r1', 'végétarien')").run(),
    ).toThrow();

    // But the same word on another recipe is ordinary — the key is per recipe,
    // and an index widened to a global unique on `tag` would fail right here.
    insertRecipe(db, 'r2');
    expect(() =>
      db.prepare("INSERT INTO recipe_tag (recipe_id, tag) VALUES ('r2', 'végétarien')").run(),
    ).not.toThrow();
    db.close();
  });
});

describe('the constraints 0005 can never gain later', () => {
  it('refuses a yield of zero, which would poison the export', () => {
    // Not tidiness. A zero makes every derived macro infinite — total divided
    // by the yield — and logging the recipe would freeze that infinity into
    // journal_entry.quantity, which IS exported. toExportValue throws on a
    // non-finite number, so one zero here would break the only safety net the
    // project has, one step removed and a week later.
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO recipe (id, name, yield_type, yield_value)
           VALUES ('r0', 'Rien', 'portions', 0)`,
        )
        .run(),
    ).toThrow();

    // And the other side, so the CHECK is known to admit what it should.
    expect(() =>
      db
        .prepare(
          `INSERT INTO recipe (id, name, yield_type, yield_value)
           VALUES ('r1', 'Curry', 'portions', 0.5)`,
        )
        .run(),
    ).not.toThrow();
    db.close();
  });

  it('admits both yield types and refuses a third', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);

    const insert = db.prepare(
      "INSERT INTO recipe (id, name, yield_type, yield_value) VALUES (?, 'x', ?, 4)",
    );

    expect(() => insert.run('a', 'portions')).not.toThrow();
    expect(() => insert.run('b', 'weight')).not.toThrow();
    // A third type would fall through recipe-macros.ts and produce a plausible
    // wrong number rather than an unknown label — which is why this set gets a
    // CHECK where food_portion.name deliberately gets none.
    expect(() => insert.run('c', 'servings')).toThrow();
    db.close();
  });

  it('keeps the ingredient unit watertight', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);

    expect(() => insertIngredient(db, { id: 'i1', unit: 'g' })).not.toThrow();
    expect(() => insertIngredient(db, { id: 'i2', unit: 'ml' })).not.toThrow();
    // Specs 5.1: no conversion, no density. A portion name here would also
    // make `quantity` stop meaning base units, and the clause-free macro SUM
    // would quietly stop being right.
    expect(() => insertIngredient(db, { id: 'i3', unit: 'tranche' })).toThrow();
    db.close();
  });

  it('refuses an ingredient that is neither linked nor frozen', () => {
    // ck_ingredient_link, and the reason it is worth its cost. Such a row
    // carries NULL macros, and NULL is what SUM IGNORES — so the ingredient
    // would contribute nothing to the recipe's total while the total still
    // looked like a number. That is the "plausible and wrong" class, which is
    // the only kind that matters.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);

    expect(() =>
      insertIngredient(db, { id: 'i1', foodId: null, frozenKcal: null }),
    ).toThrow();

    // Linked and not frozen: the whole normal life of a row.
    expect(() => insertIngredient(db, { id: 'i2', foodId: 'f1' })).not.toThrow();
    // Frozen and unlinked: what D5/R3 leaves behind after a food is deleted.
    expect(() =>
      insertIngredient(db, {
        id: 'i3',
        foodId: null,
        frozenKcal: 212.75,
        frozenBaseUnit: 'ml',
      }),
    ).not.toThrow();
    db.close();
  });

  it('refuses an ingredient of zero', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);

    expect(() => insertIngredient(db, { quantity: 0 })).toThrow();
    db.close();
  });

  it('cascades tags, steps and ingredients when a recipe goes', () => {
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);
    db.prepare("INSERT INTO recipe_tag (recipe_id, tag) VALUES ('r1', 'rapide')").run();
    db.prepare(
      "INSERT INTO recipe_step (id, recipe_id, position, text) VALUES ('s1', 'r1', 0, 'Mijoter.')",
    ).run();
    insertIngredient(db);

    db.prepare("DELETE FROM recipe WHERE id = 'r1'").run();

    expect(countRows(db, 'recipe_tag')).toBe(0);
    expect(countRows(db, 'recipe_step')).toBe(0);
    expect(countRows(db, 'recipe_ingredient')).toBe(0);
    // And the food is untouched: a recipe owns its ingredient LINES, never the
    // foods they point at.
    expect(countRows(db, 'food')).toBe(1);
    db.close();
  });

  it('refuses to delete a food an ingredient still points at — which is the freeze doing its job', () => {
    // THE CONSTRAINT THAT LOOKS LIKE A BUG AND IS NOT.
    //
    // Schema 2.2 declares food_id with no ON DELETE clause, which means NO
    // ACTION, and NO ACTION in SQLite is immediate. Read alone, that
    // contradicts specs 5.3: no deletion is ever blocked.
    //
    // It stops contradicting it the moment D5/R3 is obeyed — the freeze fills
    // the capsule and breaks the link in ONE transaction, so by the time the
    // DELETE runs nothing references the food. This assertion is therefore not
    // a complaint about the schema: it is the proof that deleteFood cannot
    // quietly stop freezing, because the database would refuse.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);
    insertIngredient(db);

    expect(() => db.prepare("DELETE FROM food WHERE id = 'f1'").run()).toThrow();

    // Freeze first, in the shape deleteFood uses, and the same delete goes
    // through. Same statement, same row, opposite outcome — which is the whole
    // of what R3 buys.
    db.prepare(
      `UPDATE recipe_ingredient
          SET frozen_name = (SELECT name FROM food WHERE id = 'f1'),
              frozen_kcal_100 = (SELECT kcal_100 FROM food WHERE id = 'f1'),
              frozen_at = 1,
              food_id = NULL
        WHERE food_id = 'f1'`,
    ).run();

    expect(() => db.prepare("DELETE FROM food WHERE id = 'f1'").run()).not.toThrow();
    expect(countRows(db, 'recipe_ingredient')).toBe(1);
    db.close();
  });

  it('reads the food row while unlinking it in the same statement', () => {
    // THE ASSUMPTION THE FREEZE RESTS ON, checked rather than reasoned about.
    //
    // freezeIngredientsOf sets food_id to NULL in the same UPDATE whose other
    // SET expressions read that food through a correlated subquery. The
    // reasoning says the subquery hits `food`, a different table, untouched —
    // but a reasoning is not an observation, and the whole of D5/R3 rests on
    // this one statement being atomic AND complete.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);
    insertRecipe(db);
    insertIngredient(db);

    db.prepare(
      `UPDATE recipe_ingredient
          SET frozen_name = (SELECT name FROM food WHERE id = recipe_ingredient.food_id),
              frozen_base_unit = (SELECT base_unit FROM food WHERE id = recipe_ingredient.food_id),
              frozen_kcal_100 = (SELECT kcal_100 FROM food WHERE id = recipe_ingredient.food_id),
              frozen_at = 1,
              food_id = NULL
        WHERE food_id = 'f1'`,
    ).run();

    const row = db.prepare('SELECT * FROM recipe_ingredient').get() as Record<string, unknown>;

    expect(row['food_id']).toBeNull();
    expect(row['frozen_name']).toBe('Pois chiches');
    expect(row['frozen_base_unit']).toBe('g');
    expect(row['frozen_kcal_100']).toBe(265.5);
    db.close();
  });

  it('refuses a step with no text and a step with no position', () => {
    // Schema 2.2 leaves both nullable. They are NOT NULL here because a step
    // with no text is not a step, and a step with no position has no place in
    // an ordered list — and a NOT NULL column without a default is exactly
    // what SQLite cannot add later.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertRecipe(db);

    expect(() =>
      db
        .prepare("INSERT INTO recipe_step (id, recipe_id, position) VALUES ('s1', 'r1', 0)")
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare("INSERT INTO recipe_step (id, recipe_id, text) VALUES ('s2', 'r1', 'Mijoter.')")
        .run(),
    ).toThrow();
    db.close();
  });

  it('refuses a tag, a step and an ingredient naming a recipe that does not exist', () => {
    // The three foreign keys schema 2.2 does not declare on tags and steps.
    // Without them, barrier 3 of the import could no longer tell a sound
    // archive from one whose recipes point nowhere.
    const db = openEmptyDatabase();
    applyAllMigrations(db);
    insertFood(db);

    expect(() =>
      db.prepare("INSERT INTO recipe_tag (recipe_id, tag) VALUES ('ghost', 'x')").run(),
    ).toThrow();
    expect(() =>
      db
        .prepare("INSERT INTO recipe_step (id, recipe_id, position, text) VALUES ('s', 'ghost', 0, 'x')")
        .run(),
    ).toThrow();
    expect(() => insertIngredient(db, { recipeId: 'ghost' })).toThrow();
    db.close();
  });
});

describe('replaying 0005 over a populated database (D6/G4)', () => {
  it('applies to a database already carrying a journal and a library', () => {
    // The path every existing installation takes: 0005 lands on a phone with
    // months of entries and a food library in it. It creates four empty tables
    // and touches nothing else — which is what makes it safe to ship with no
    // backfill at all.
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(RECIPE_MIGRATION) - 1);
    db.pragma('foreign_keys = ON');

    insertFood(db);
    db.prepare(
      'INSERT INTO day (date, template_id_snapshot, template_name_snapshot, materialized_at) ' +
        'VALUES (?, NULL, NULL, ?)',
    ).run('2026-09-11', 1_789_000_000_000);
    db.prepare("INSERT INTO day_meal (id, date, position, name) VALUES ('dm1', '2026-09-11', 0, 'Dejeuner')").run();
    db.prepare(
      `INSERT INTO journal_entry (id, day_meal_id, date, position, kind, name,
                                  base_unit, quantity, protein_100, carbs_100,
                                  fat_100, kcal_100)
       VALUES ('e1', 'dm1', '2026-09-11', 0, 'free', 'Saisie libre', 'g', 100,
               20, 10, 5, 185)`,
    ).run();

    expect(() => applyOneMigration(db, RECIPE_MIGRATION)).not.toThrow();

    expect(countRows(db, 'journal_entry')).toBe(1);
    expect(countRows(db, 'food')).toBe(1);
    expect(countRows(db, 'recipe')).toBe(0);
    expect(countRows(db, 'recipe_ingredient')).toBe(0);
    db.close();
  });

  it('leaves the food table unrebuilt, exactly as 0003 did', () => {
    // The prediction slice 3 made and slice 4 collected on, checked a second
    // time: 0005 adds a table that REFERENCES food, and referencing a table
    // does not touch it. Nothing about food is rewritten, so nothing about the
    // history hanging off it can be lost.
    const db = openEmptyDatabase();
    applyMigrationsUpTo(db, indexOfTag(RECIPE_MIGRATION) - 1);
    const before = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'food'")
      .get() as { sql: string };

    applyOneMigration(db, RECIPE_MIGRATION);
    const after = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'food'")
      .get() as { sql: string };

    expect(after.sql).toBe(before.sql);
    db.close();
  });
});
