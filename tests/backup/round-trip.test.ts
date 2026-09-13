import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import bundle from '../../src/core/db/migrations/bundle.generated';
import { newId } from '../../src/core/id';
import {
  setting,
  type DayMealId,
  type FoodId,
  type JournalEntryId,
} from '../../src/core/db/schema';
import { buildDatabase } from '../../src/features/backup/domain/build-database';
import type { BinarySchema } from '../../src/features/backup/domain/envelope';
import {
  buildExportFile,
  serializeExportFile,
} from '../../src/features/backup/domain/export-payload';
import { journalTags } from '../../src/features/backup/domain/migration-prefix';
import {
  exportedTables,
  isExcluded,
} from '../../src/features/backup/domain/table-catalog';
import { validateImportFile } from '../../src/features/backup/domain/validate-payload';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { seedJournal } from '../../src/dev/seed';
import { MIGRATIONS_TABLE } from '../../src/core/db/version-guard';
import { openTestDatabase, type TestDatabase } from '../helpers/database';
import { tableNames } from '../helpers/migrations';

/**
 * THE EXPORT-THEN-IMPORT ROUND TRIP.
 *
 * > If a single test is written in the whole project, it is this one.
 * >   — D15, first by value
 *
 * WHAT "EQUAL" MEANS HERE.
 *
 * Not the equality of the .db files: two semantically identical databases
 * differ byte for byte.
 *
 * And deliberately NOT the comparison of a second export with the first. That
 * is circular, and the circularity is the whole trap: a serialiser that drops
 * a column drops it on the way out and on the way back, the two files match,
 * the test passes, and the data is gone.
 *
 * So equality is measured against the SOURCE DATABASE, read in raw SQL through
 * better-sqlite3 — not through the domain reads, and not through the exporter.
 * Row by row, column by column, with strict type equality: null is not 0, 1 is
 * not '1', and Object.is catches -0.
 *
 * WHAT IT DOES NOT PROVE, and nobody should read a green run as saying:
 *
 *  1. Nothing about the switch. It runs on better-sqlite3;
 *     backupDatabaseSync is native expo-sqlite. The one part capable of
 *     destroying the daily database is exactly the part left untested.
 *  2. Nothing about transport: writing the file, the share sheet, the picker,
 *     the encoding. All native.
 *  3. Nothing about tables that do not exist yet — except through the
 *     PRAGMA table_info assertions below, which are what make this test fail
 *     on a future branch instead of quietly narrowing.
 */

const BINARY: BinarySchema = { tags: journalTags(bundle) };
const DAY = toLocalDate('2026-09-11');

const ENVELOPE = {
  schemaVersion: '0001_journal',
  schemaMigrationCount: bundle.journal.entries.length,
  appVersion: '0.1.0',
  appVariant: 'production',
  exportedAt: 1_789_243_920_000,
};

let source: TestDatabase;
let restored: TestDatabase;

beforeEach(() => {
  source = openTestDatabase();
  restored = openTestDatabase();
});

afterEach(() => {
  source.close();
  restored.close();
});

/** Primary key columns, in declaration order, read from the database itself. */
function primaryKeyColumns(raw: Database.Database, table: string): string[] {
  const rows = raw.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    pk: number;
  }[];
  return rows
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

/** Column names as the DATABASE reports them, not as Drizzle describes them. */
function databaseColumns(raw: Database.Database, table: string): string[] {
  const rows = raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name).sort();
}

/**
 * Every row of a table, in raw SQL.
 *
 * Independent of the export code on purpose: a bug shared by the reader and
 * the writer is invisible to any comparison that goes through both.
 */
function dumpTable(raw: Database.Database, table: string): Record<string, unknown>[] {
  const order = primaryKeyColumns(raw, table).join(', ');
  return raw
    .prepare(`SELECT * FROM ${table}${order === '' ? '' : ` ORDER BY ${order}`}`)
    .all() as Record<string, unknown>[];
}

/** Strict, and strict about types. null is not 0; 1 is not '1'; -0 is not 0. */
function expectIdenticalRows(
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
  table: string,
): void {
  expect(after.length, `${table}: row count`).toBe(before.length);

  before.forEach((row, index) => {
    const other = after[index] ?? {};
    const columns = Object.keys(row).sort();

    expect(Object.keys(other).sort(), `${table}[${index}]: columns`).toEqual(columns);

    for (const column of columns) {
      const left = row[column];
      const right = other[column];
      expect(typeof right, `${table}[${index}].${column}: type`).toBe(typeof left);
      expect(
        Object.is(left, right),
        `${table}[${index}].${column}: ${String(left)} vs ${String(right)}`,
      ).toBe(true);
    }
  });
}

/**
 * A row in every table with a distinguishable, NON-NULL value in every single
 * column — written in raw SQL, bypassing the write layer, which never fills
 * the columns slices 3 to 6 will.
 *
 * This exists because of a hole found by mutating the exporter. Dropping a
 * nullable column from the export used to pass every assertion here: the
 * exporter omitted it, the validator accepted it as missing (an old archive
 * legitimately lacks columns added later), the builder let SQLite default it
 * to NULL — and the source row held NULL anyway, because nothing in the V1
 * write path ever sets `brand`. NULL equalled NULL and the safety net had a
 * hole the size of a column.
 *
 * The lesson generalises: a round trip only proves what the fixture actually
 * puts in. Columns with no value are columns with no test.
 */
function fillEveryColumn(raw: Database.Database): void {
  const mealId = newId<DayMealId>();
  const parentId = newId<JournalEntryId>();
  const childId = newId<JournalEntryId>();
  const foodId = newId<FoodId>();
  const plainFoodId = newId<FoodId>();

  raw.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'dark')").run();

  const insertFood = raw.prepare(
    'INSERT INTO food (id, name, brand, barcode, source, base_unit, protein_100, ' +
      'carbs_100, fat_100, kcal_100, display_ref_qty, is_favorite, created_at, ' +
      'updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // Every column distinguishable and NON-NULL: a brand, a favourite flag at 1
  // rather than its default, and a reference quantity that is not 100. A
  // column left at its default is a column a dropped-column bug survives.
  //
  // This one has a brand and NO barcode, which is what a personal food looks
  // like: it is a thing rather than a product.
  insertFood.run(
    foodId, 'Pain de mie complet', 'Sans marque', null, 'perso', 'g',
    8.25, 47.5, 3.125, 265.5, 30, 1, 1_789_000_000_010, 1_789_000_000_011,
  );
  // A second food in millilitres, not a favourite, with no brand — so the
  // comparison sees both sides of every flag rather than one. It carries the
  // barcode, crossed the other way from the brand so that neither column can
  // be dropped without one row noticing.
  //
  // A STRING, not a number: an EAN can begin with a zero, and a barcode parsed
  // as a number loses it silently — the kind of defect that survives a round
  // trip because both sides agree on the wrong value.
  insertFood.run(
    plainFoodId, 'Lait demi-écrémé', null, '3033710065967', 'off', 'ml',
    3.2, 4.8, 1.55, 46.5, 100, 0, 1_789_000_000_012, 1_789_000_000_013,
  );

  const insertPortion = raw.prepare(
    'INSERT INTO food_portion (id, food_id, name, quantity, position) VALUES (?, ?, ?, ?, ?)',
  );
  insertPortion.run(newId(), foodId, 'tranche', 25.5, 0);
  // position 1 as well as 0, so a serialiser that dropped the column and let
  // SQLite default it could not pass unnoticed.
  insertPortion.run(newId(), foodId, 'cuillère à soupe', 12.25, 1);
  // The same name under a different food: the unique index is per food, and an
  // importer that widened it to a global unique would fail exactly here.
  insertPortion.run(newId(), plainFoodId, 'tranche', 40.75, 0);
  raw
    .prepare(
      'INSERT INTO day (date, template_id_snapshot, template_name_snapshot, ' +
        'materialized_at) VALUES (?, ?, ?, ?)',
    )
    .run('2026-03-04', newId(), 'Jour de repos', 1_789_000_000_001);
  raw
    .prepare(
      'INSERT INTO day_meal (id, date, position, name, target_protein, ' +
        'target_carbs, target_fat, target_kcal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(mealId, '2026-03-04', 0, 'Déjeuner', 40.5, 60.25, 15.125, 620.5);

  const insertEntry = raw.prepare(
    'INSERT INTO journal_entry (id, day_meal_id, date, parent_entry_id, position, ' +
      'kind, source_food_id, source_recipe_id, name, brand, base_unit, quantity, ' +
      'portion_name, portion_quantity, protein_100, carbs_100, fat_100, kcal_100, ' +
      'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  insertEntry.run(
    parentId, mealId, '2026-03-04', null, 0, 'recipe',
    foodId, newId(), 'Curry de pois chiches', 'Maison', 'g', 320.5,
    'portion', 160.25, 8.25, 22.75, 5.5, 176.5, 1_789_000_000_002, 1_789_000_000_003,
  );
  // The child carries a non-null parent_entry_id, the one column no row above
  // could fill.
  insertEntry.run(
    childId, mealId, '2026-03-04', parentId, 1, 'recipe_item',
    plainFoodId, newId(), 'Pois chiches', 'Sans marque', 'ml', 0.5,
    'cuillère à café', 12.5, 0.125, 0.25, 0.375, 3.5, 1_789_000_000_004, 1_789_000_000_005,
  );
}

function roundTrip(): void {
  const file = buildExportFile(source.db, ENVELOPE);
  // Through the actual bytes, so anything JSON cannot carry shows up here and
  // not in a comparison of two objects that never left memory.
  const parsed: unknown = JSON.parse(serializeExportFile(file));

  const verdict = validateImportFile(parsed, BINARY);
  expect(verdict.ok, 'the file this binary just wrote must validate').toBe(true);
  if (!verdict.ok) return;

  const built = buildDatabase(restored.db, verdict.value);
  expect(built.ok, JSON.stringify(built.ok ? [] : built.problems)).toBe(true);
}

describe('export then import — the round trip (D15 n1)', () => {
  it('restores a row that fills every column of every table', () => {
    // THE ASSERTION THAT ACTUALLY COVERS THE COLUMNS. Every other case here
    // leaves most nullable columns at NULL, where a dropped column and a
    // preserved one look identical.
    fillEveryColumn(source.raw);

    roundTrip();

    for (const descriptor of exportedTables()) {
      const before = dumpTable(source.raw, descriptor.name);
      expect(before.length, `${descriptor.name}: fixture is empty`).toBeGreaterThan(0);

      // Every column must hold a real value in AT LEAST ONE row, or the
      // comparison below proves nothing about that column: NULL on both sides
      // is what a dropped column looks like. Not "in every row" — a root
      // entry's parent_entry_id is legitimately NULL, and demanding otherwise
      // would only push the fixture into writing impossible data.
      const covered = new Set<string>();
      for (const row of before) {
        for (const [column, value] of Object.entries(row)) {
          if (value !== null) covered.add(column);
        }
      }
      const uncovered = descriptor.columns
        .map((column) => column.name)
        .filter((column) => !covered.has(column));
      expect(uncovered, `${descriptor.name}: columns left NULL by the fixture`).toEqual([]);

      expectIdenticalRows(before, dumpTable(restored.raw, descriptor.name), descriptor.name);
    }
  });

  it('writes every declared column into every row of the file', () => {
    // Caught by mutation: the comparison above can be satisfied by NULL on
    // both sides. This looks at the file itself, so omitting a column is a
    // failure whatever the column happened to hold.
    fillEveryColumn(source.raw);
    const file = buildExportFile(source.db, ENVELOPE);

    for (const descriptor of exportedTables()) {
      const declared = descriptor.columns.map((column) => column.name).sort();
      for (const row of file.tables[descriptor.name] ?? []) {
        expect(Object.keys(row).sort(), `${descriptor.name}: a row lost a column`).toEqual(
          declared,
        );
      }
    }
  });

  it('restores an empty database as an empty database', () => {
    roundTrip();

    for (const descriptor of exportedTables()) {
      expectIdenticalRows(
        dumpTable(source.raw, descriptor.name),
        dumpTable(restored.raw, descriptor.name),
        descriptor.name,
      );
    }
  });

  it('restores a year of generated history, identically', () => {
    // Generated, never copied from real data (D15). Deterministic seed, so a
    // failure is reproducible rather than a story about last Tuesday.
    const report = seedJournal(source.db, { endDate: DAY, days: 365, seed: 42 });
    expect(report.entries).toBeGreaterThan(500);
    source.db.insert(setting).values({ key: 'theme', value: 'dark' }).run();
    source.db.insert(setting).values({ key: 'day_cutoff_hour', value: '4' }).run();

    roundTrip();

    let compared = 0;
    for (const descriptor of exportedTables()) {
      const before = dumpTable(source.raw, descriptor.name);
      expectIdenticalRows(before, dumpTable(restored.raw, descriptor.name), descriptor.name);
      compared += before.length;
    }

    // Guards against the test passing because it compared four empty tables.
    expect(compared).toBeGreaterThan(500);
  });

  it('carries awkward numbers and awkward text through unchanged', () => {
    // Floats are where a round trip quietly loses precision, and the macros of
    // this application are floats all the way down (D4).
    addFreeEntry(source.db, {
      date: DAY,
      mealPosition: 0,
      name: 'Guillemets " et \\ antislash, accents éàü, emoji 🥑, saut\nde ligne',
      macros: { protein: 0.1 + 0.2, carbs: 0, fat: 1 / 3, kcal: 1e-7 },
    });
    addFreeEntry(source.db, {
      date: DAY,
      mealPosition: 1,
      name: '',
      macros: {
        protein: Number.MAX_SAFE_INTEGER,
        carbs: 1.7976931348623157e308,
        fat: 5e-324,
        kcal: 123456.789012345,
      },
    });

    roundTrip();

    expectIdenticalRows(
      dumpTable(source.raw, 'journal_entry'),
      dumpTable(restored.raw, 'journal_entry'),
      'journal_entry',
    );
  });

  it('keeps null distinct from zero and from the empty string', () => {
    // The failure this guards against is plausible and wrong, which is D15's
    // whole criterion: a brand read as '' instead of NULL still displays, and
    // a target read as 0 instead of NULL turns "no target" into "target zero".
    addFreeEntry(source.db, {
      date: DAY,
      mealPosition: 0,
      macros: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    });

    roundTrip();

    const before = dumpTable(source.raw, 'journal_entry')[0] ?? {};
    const after = dumpTable(restored.raw, 'journal_entry')[0] ?? {};

    expect(before['brand']).toBeNull();
    expect(after['brand']).toBeNull();
    expect(after['protein_100']).toBe(0);
    expect(after['portion_quantity']).toBeNull();

    const meals = dumpTable(restored.raw, 'day_meal');
    expect(meals[0]?.['target_protein']).toBeNull();
  });
});

/**
 * The assertions that make this test age instead of quietly narrowing.
 *
 * They compare the exporter against the DATABASE — what the migrations
 * actually built — rather than against the Drizzle schema the exporter is
 * derived from. A column added by a migration and never declared in the schema
 * would be invisible to every other check in the suite, and absent from every
 * archive.
 */
describe('the round trip covers the whole database, not just what it knows', () => {
  it('leaves no table of the migrated database unaccounted for', () => {
    const exported = new Set(exportedTables().map((descriptor) => descriptor.name));

    const unaccounted = tableNames(source.raw).filter(
      (name) => name !== MIGRATIONS_TABLE && !exported.has(name) && !isExcluded(name),
    );

    expect(unaccounted).toEqual([]);
  });

  it('exports every column the database actually has', () => {
    // When a migration adds a column, this fails until the exporter knows it.
    for (const descriptor of exportedTables()) {
      expect(
        descriptor.columns.map((column) => column.name).sort(),
        `${descriptor.name}: exported columns vs PRAGMA table_info`,
      ).toEqual(databaseColumns(source.raw, descriptor.name));
    }
  });

  it('writes a file whose every table key the database recognises', () => {
    const file = buildExportFile(source.db, ENVELOPE);
    const inDatabase = new Set(tableNames(source.raw));

    for (const name of Object.keys(file.tables)) {
      expect(inDatabase.has(name), `${name} is exported but not in the database`).toBe(
        true,
      );
    }
  });
});
