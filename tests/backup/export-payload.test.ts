import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { setting } from '../../src/core/db/schema';
import {
  buildExportFile,
  countExportedRows,
  serializeExportFile,
} from '../../src/features/backup/domain/export-payload';
import { exportedTables } from '../../src/features/backup/domain/table-catalog';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Reading the database out (D7).
 *
 * Exercised against a real SQLite file, like every access function since
 * slice 1, because the export takes its database as a parameter and imports
 * nothing native. That is the whole reason the safety net can be tested at
 * all without an iPhone.
 */

const ENVELOPE = {
  schemaVersion: '0001_journal',
  schemaMigrationCount: 2,
  appVersion: '0.1.0',
  appVariant: 'production',
  exportedAt: 1_789_243_920_000,
};

const DAY = toLocalDate('2026-09-11');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('export payload', () => {
  it('carries every table of the catalogue, empty ones included', () => {
    // An absent key and an empty array would be the same thing to read and two
    // different things to write. The importer must never have to guess.
    const file = buildExportFile(database.db, ENVELOPE);

    // Compared against the catalogue rather than a list written out here: the
    // claim is "every table, in catalogue order", and a second copy of the
    // list would only ever be a chance for the two to disagree. The assertion
    // that a table cannot go missing from the catalogue itself lives in
    // table-catalog.test.ts, which is where it belongs.
    expect(Object.keys(file.tables)).toEqual(exportedTables().map((table) => table.name));
    expect(file.tables['journal_entry']).toEqual([]);
    expect(file.tables['food']).toEqual([]);
    expect(file.tables['food_portion']).toEqual([]);
    expect(countExportedRows(file)).toBe(0);
  });

  it('spells columns the way SQL spells them', () => {
    addFreeEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      name: 'Poulet',
      macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
    });

    const file = buildExportFile(database.db, ENVELOPE);
    const entry = file.tables['journal_entry']?.[0];

    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {})).toContain('day_meal_id');
    expect(Object.keys(entry ?? {})).toContain('protein_100');
    expect(Object.keys(entry ?? {})).not.toContain('dayMealId');
  });

  it('freezes the reference and not the total, as the row does', () => {
    // D5/R1. A free entry is 100 units of a virtual food, so the macros for
    // 100 are the values typed in and the total is derived, never stored. The
    // export must not quietly help by writing a total.
    addFreeEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      macros: { protein: 22.5, carbs: 3.1, fat: 0.4, kcal: 110 },
    });

    const entry = buildExportFile(database.db, ENVELOPE).tables['journal_entry']?.[0];

    expect(entry?.['quantity']).toBe(100);
    expect(entry?.['protein_100']).toBe(22.5);
    expect(Object.keys(entry ?? {})).not.toContain('total');
  });

  it('keeps nulls as nulls, never as zeroes or empty strings', () => {
    addFreeEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 9 },
    });

    const entry = buildExportFile(database.db, ENVELOPE).tables['journal_entry']?.[0];

    // brand and parent_entry_id are genuinely absent on a free entry. A zero
    // there would be a value somebody could later read as meaningful.
    expect(entry?.['brand']).toBeNull();
    expect(entry?.['parent_entry_id']).toBeNull();
    expect(entry?.['portion_name']).toBeNull();
  });

  it('produces the same file twice for the same data', () => {
    // Ordered by primary key, or the order is whatever SQLite felt like and
    // diffing two archives — the cheapest answer to "did anything change?" —
    // stops working.
    database.db.insert(setting).values({ key: 'theme', value: 'dark' }).run();
    database.db.insert(setting).values({ key: 'day_cutoff_hour', value: '4' }).run();
    addFreeEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 2, fat: 3, kcal: 40 },
    });

    const first = serializeExportFile(buildExportFile(database.db, ENVELOPE));
    const second = serializeExportFile(buildExportFile(database.db, ENVELOPE));

    expect(first).toBe(second);
    // Sorted by primary key, so day_cutoff_hour comes before theme.
    const keys = buildExportFile(database.db, ENVELOPE).tables['setting']?.map(
      (row) => row['key'],
    );
    expect(keys).toEqual(['day_cutoff_hour', 'theme']);
  });

  it('is indented and uncompressed, and survives a JSON round trip intact', () => {
    // D7 refuses compression so the file can be repaired by hand. The decimal
    // matters here: 0.1 + 0.2 must come back exactly as it went in, or the
    // macros drift a little every time the archive is used.
    addFreeEntry(database.db, {
      date: DAY,
      mealPosition: 0,
      macros: { protein: 0.1 + 0.2, carbs: 1e21, fat: 0, kcal: 1.7976931348623157e308 },
    });

    const file = buildExportFile(database.db, ENVELOPE);
    const text = serializeExportFile(file);

    expect(text).toContain('\n  "format": "suivi-export"');
    expect(text.endsWith('\n')).toBe(true);

    const reread = JSON.parse(text) as typeof file;
    expect(reread.tables['journal_entry']?.[0]?.['protein_100']).toBe(0.1 + 0.2);
    expect(reread.tables['journal_entry']?.[0]?.['carbs_100']).toBe(1e21);
    expect(reread.tables['journal_entry']?.[0]?.['kcal_100']).toBe(
      1.7976931348623157e308,
    );
  });

  it('writes the header before the rows', () => {
    const text = serializeExportFile(buildExportFile(database.db, ENVELOPE));
    expect(text.indexOf('"format"')).toBeLessThan(text.indexOf('"tables"'));
  });
});
