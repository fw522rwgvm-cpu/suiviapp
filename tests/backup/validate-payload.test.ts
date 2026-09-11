import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { BinarySchema } from '../../src/features/backup/domain/envelope';
import { buildExportFile } from '../../src/features/backup/domain/export-payload';
import type { ImportProblem } from '../../src/features/backup/domain/problems';
import { validateImportFile } from '../../src/features/backup/domain/validate-payload';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Barriers one and two of D7, and the corruption tests that pay for writing
 * them by hand rather than with zod.
 *
 * D15's rule of thumb is that a bug you can see on screen does not deserve a
 * test, and that what deserves one is what produces a plausible but wrong
 * result. An import that accepts a broken archive is the purest example in the
 * project: it looks like it worked, and the database it replaced is gone.
 */

const BINARY: BinarySchema = { tags: ['0000_initial_setting', '0001_journal'] };
const DAY = toLocalDate('2026-09-11');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
  addFreeEntry(database.db, {
    date: DAY,
    mealPosition: 0,
    name: 'Poulet',
    macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
  });
});

afterEach(() => {
  database.close();
});

/** A file this binary would have written, then put through JSON. */
function archive(): Record<string, unknown> {
  const file = buildExportFile(database.db, {
    schemaVersion: '0001_journal',
    schemaMigrationCount: 2,
    appVersion: '0.1.0',
    appVariant: 'production',
    exportedAt: 1_789_243_920_000,
  });
  return JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
}

function tablesOf(file: Record<string, unknown>): Record<string, Record<string, unknown>[]> {
  return file['tables'] as Record<string, Record<string, unknown>[]>;
}

function firstEntry(file: Record<string, unknown>): Record<string, unknown> {
  const entry = tablesOf(file)['journal_entry']?.[0];
  if (entry === undefined) throw new Error('fixture has no journal entry');
  return entry;
}

function problemsOf(file: unknown): readonly ImportProblem[] {
  const verdict = validateImportFile(file, BINARY);
  return verdict.ok ? [] : verdict.problems;
}

function codes(file: unknown): string[] {
  return problemsOf(file).map((problem) => problem.code);
}

describe('import validation — what it accepts', () => {
  it('accepts a file this binary just wrote', () => {
    const verdict = validateImportFile(archive(), BINARY);

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.value.rows['journal_entry']).toHaveLength(1);
    expect(verdict.value.schemaIndex).toBe(1);
  });

  it('accepts an archive that predates the tables it is missing', () => {
    // The forward-compatibility case, and the reason the catalogue records
    // which migration created each table. An archive written at 0000 has no
    // day, day_meal or journal_entry key, and that is not corruption.
    const file = archive();
    file['schemaVersion'] = '0000_initial_setting';
    file['schemaMigrationCount'] = 1;
    file['tables'] = { setting: [] };

    const verdict = validateImportFile(file, BINARY);

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.value.rows['journal_entry']).toEqual([]);
  });

  it('accepts a row missing a nullable column', () => {
    // Same case one level down: a column added by a later migration is
    // necessarily nullable or defaulted, because SQLite cannot add a NOT NULL
    // column without a default.
    const file = archive();
    delete firstEntry(file)['brand'];

    expect(validateImportFile(file, BINARY).ok).toBe(true);
  });

  it('does not care what order the keys are in', () => {
    // D7 refuses compression so the file stays repairable by hand. A hand
    // that reorders keys must not break it.
    const file = archive();
    const tables = tablesOf(file);
    file['tables'] = {
      journal_entry: tables['journal_entry'] ?? [],
      day_meal: tables['day_meal'] ?? [],
      setting: tables['setting'] ?? [],
      day: tables['day'] ?? [],
    };

    expect(validateImportFile(file, BINARY).ok).toBe(true);
  });
});

describe('import validation — what it refuses', () => {
  it('refuses a table the archive should have carried', () => {
    const file = archive();
    delete tablesOf(file)['journal_entry'];

    expect(codes(file)).toContain('table_missing');
  });

  it('refuses a table it has never heard of', () => {
    const file = archive();
    tablesOf(file)['exercise'] = [];

    expect(codes(file)).toContain('table_unknown');
  });

  it('refuses tables that are not an object, and rows that are not an array', () => {
    const notAnObject = archive();
    notAnObject['tables'] = [];
    expect(codes(notAnObject)).toEqual(['tables_not_an_object']);

    const notAnArray = archive();
    tablesOf(notAnArray)['day'] = { date: '2026-09-11' } as never;
    expect(codes(notAnArray)).toContain('table_not_an_array');
  });

  it('refuses a row that is not an object', () => {
    const file = archive();
    tablesOf(file)['day'] = ['2026-09-11' as never];

    expect(codes(file)).toContain('row_not_an_object');
  });

  it('refuses a column it has never heard of', () => {
    // Cannot be a newer schema — barrier one refuses those — so it is either
    // corruption or an edit by hand that went wrong.
    const file = archive();
    firstEntry(file)['calories'] = 165;

    expect(codes(file)).toContain('column_unknown');
  });

  it('refuses a missing NOT NULL column', () => {
    const file = archive();
    delete firstEntry(file)['name'];

    expect(codes(file)).toContain('column_missing');
  });

  it('refuses null in a NOT NULL column', () => {
    const file = archive();
    firstEntry(file)['kind'] = null;

    expect(codes(file)).toContain('column_null');
  });

  it('refuses a value of the wrong storage class', () => {
    const file = archive();
    firstEntry(file)['protein_100'] = 'beaucoup';

    expect(codes(file)).toContain('column_type');
  });

  it('refuses a fraction in an INTEGER column', () => {
    // SQLite would store it without complaint. Positions are counters and the
    // rest are epoch milliseconds: a fraction there is corruption.
    const file = archive();
    firstEntry(file)['position'] = 0.5;

    expect(codes(file)).toContain('value_malformed');
  });

  it('refuses a date that only looks like one', () => {
    // Goes through core/date, the single entry point of D3. Matching the
    // shape is not being a date.
    const file = archive();
    firstEntry(file)['date'] = '2026-02-30';

    expect(problemsOf(file)).toContainEqual(
      expect.objectContaining({ code: 'value_malformed', expected: 'civil date' }),
    );
  });

  it('refuses an identifier that is not a ULID', () => {
    const file = archive();
    firstEntry(file)['id'] = 'entree-1';

    expect(problemsOf(file)).toContainEqual(
      expect.objectContaining({ code: 'value_malformed', expected: 'entity id' }),
    );
  });

  it('refuses a value outside a closed set, before SQLite would', () => {
    // The CHECK constraint would catch this at INSERT, but with a SQLite
    // error instead of a line in the file the user is meant to repair.
    const file = archive();
    firstEntry(file)['kind'] = 'snack';

    expect(problemsOf(file)).toContainEqual(
      expect.objectContaining({
        code: 'value_not_in_set',
        column: 'kind',
        found: 'snack',
      }),
    );
  });

  it('refuses a unit outside g and ml', () => {
    const file = archive();
    firstEntry(file)['base_unit'] = 'oz';

    expect(codes(file)).toContain('value_not_in_set');
  });

  it('refuses a negative timestamp', () => {
    const file = archive();
    firstEntry(file)['created_at'] = -1;

    expect(codes(file)).toContain('value_malformed');
  });

  it('refuses two rows with the same primary key', () => {
    const file = archive();
    const entries = tablesOf(file)['journal_entry'] ?? [];
    entries.push({ ...(entries[0] ?? {}) });

    expect(codes(file)).toContain('primary_key_duplicated');
  });

  it('collects every problem instead of stopping at the first', () => {
    // The point of the whole exercise: repairing a file one error per attempt
    // is a path you walk once, badly.
    const file = archive();
    const entry = firstEntry(file);
    entry['kind'] = 'snack';
    entry['date'] = '2026-02-30';
    entry['position'] = 1.5;
    delete entry['name'];

    expect(problemsOf(file).length).toBeGreaterThanOrEqual(4);
  });

  it('says where the problem is, not just that there is one', () => {
    const file = archive();
    firstEntry(file)['kind'] = 'snack';

    const problem = problemsOf(file)[0];
    expect(problem).toMatchObject({ table: 'journal_entry', index: 0, column: 'kind' });
  });
});
