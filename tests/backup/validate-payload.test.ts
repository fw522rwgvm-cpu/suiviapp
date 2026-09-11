import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import bundle from '../../src/core/db/migrations/bundle.generated';
import { PORTION_NAMES } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import type { BinarySchema } from '../../src/features/backup/domain/envelope';
import { buildExportFile } from '../../src/features/backup/domain/export-payload';
import { journalTags } from '../../src/features/backup/domain/migration-prefix';
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

/**
 * What slice 3 adds to the second barrier.
 *
 * Two closed sets SQL does not carry — deliberately, in the case of the
 * portion names — plus the question the whole introducedIn mechanism exists to
 * answer: what happens to an archive written before `food` existed.
 */
describe('import validation — the food tables', () => {
  /** A binary carrying all three migrations, unlike BINARY above. */
  const SLICE_3: BinarySchema = { tags: journalTags(bundle) };

  /** An archive this binary would write, declaring the current schema. */
  function currentArchive(): Record<string, unknown> {
    const file = buildExportFile(database.db, {
      schemaVersion: '0002_food',
      schemaMigrationCount: bundle.journal.entries.length,
      appVersion: '0.1.0',
      appVariant: 'production',
      exportedAt: 1_789_243_920_000,
    });
    return JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
  }

  function aFood(): Record<string, unknown> {
    return {
      id: newId(),
      name: 'Pain de mie',
      brand: null,
      source: 'perso',
      base_unit: 'g',
      protein_100: 8.5,
      carbs_100: 47.2,
      fat_100: 3.1,
      kcal_100: 265,
      display_ref_qty: 30,
      is_favorite: 0,
      created_at: 1_789_000_000_001,
      updated_at: 1_789_000_000_001,
    };
  }

  function problemsFor(file: unknown): readonly ImportProblem[] {
    const verdict = validateImportFile(file, SLICE_3);
    return verdict.ok ? [] : verdict.problems;
  }

  it('accepts an archive written before food existed, with no food key at all', () => {
    // THE CASE THE introducedIn FIELD EXISTS FOR, and the one that matters
    // most today: every archive taken since slice 2 shipped looks like this.
    //
    // It declares 0001_journal and simply has no `food` key. That is not a
    // corrupt file — the table did not exist — and the comparison is on
    // journal position, so it stays right as the journal grows.
    const file = currentArchive();
    file['schemaVersion'] = '0001_journal';
    file['schemaMigrationCount'] = 2;
    const tables = tablesOf(file);
    delete tables['food'];
    delete tables['food_portion'];

    const verdict = validateImportFile(file, SLICE_3);
    expect(verdict.ok, JSON.stringify(verdict.ok ? [] : verdict.problems)).toBe(true);
    if (!verdict.ok) return;

    // Present and empty, so the builder never has to ask whether a key went
    // missing on purpose.
    expect(verdict.value.rows['food']).toEqual([]);
    expect(verdict.value.rows['food_portion']).toEqual([]);
  });

  it('refuses an archive from this binary that has lost its food key', () => {
    // The mirror image, and the reason the rule cannot simply be "a missing
    // table is fine". An archive declaring 0002_food must carry what
    // 0002_food created.
    const file = currentArchive();
    delete tablesOf(file)['food'];

    expect(problemsFor(file).map((problem) => problem.code)).toContain('table_missing');
  });

  it("refuses the specs' spelling of the origin, which is the whole point", () => {
    // specs 6.1 says 'openfoodfacts', schema 2.2 says 'off'. Section 6 opens
    // by declaring itself non-normative on the data model, so 'off' governs —
    // and a file carrying the other spelling is refused before a single row is
    // inserted, naming the row rather than citing a CHECK.
    const file = currentArchive();
    tablesOf(file)['food'] = [{ ...aFood(), source: 'openfoodfacts' }];

    expect(problemsFor(file)).toContainEqual(
      expect.objectContaining({
        code: 'value_not_in_set',
        table: 'food',
        column: 'source',
        found: 'openfoodfacts',
      }),
    );
  });

  it('refuses a portion name outside the closed list of specs 6.1', () => {
    // food_portion.name carries NO CHECK, on purpose: widening the vocabulary
    // breaks no invariant, and SQLite cannot widen a CHECK without rebuilding
    // the table. This is where the list is actually enforced — and it names a
    // table, a row and a column, which a constraint violation would not.
    const one = aFood();
    const file = currentArchive();
    tablesOf(file)['food'] = [one];
    tablesOf(file)['food_portion'] = [
      { id: newId(), food_id: one['id'], name: 'sachet', quantity: 12, position: 0 },
    ];

    expect(problemsFor(file)).toContainEqual(
      expect.objectContaining({
        code: 'value_not_in_set',
        table: 'food_portion',
        column: 'name',
        found: 'sachet',
      }),
    );
  });

  it('accepts all eight portion names', () => {
    // The other side of the same constraint. A rule that only ever refuses is
    // indistinguishable from one that refuses everything.
    const one = aFood();
    const file = currentArchive();
    tablesOf(file)['food'] = [one];
    tablesOf(file)['food_portion'] = PORTION_NAMES.map((name, position) => ({
      id: newId(),
      food_id: one['id'],
      name,
      quantity: 10 + position,
      position,
    }));

    expect(problemsFor(file)).toEqual([]);
  });

  it('refuses a food whose favourite flag is neither 0 nor 1', () => {
    // Caught here as a malformed integer rather than by the CHECK, which would
    // only speak at INSERT time — past the point where a line number helps.
    const file = currentArchive();
    tablesOf(file)['food'] = [{ ...aFood(), is_favorite: 0.5 }];

    expect(problemsFor(file).map((problem) => problem.code)).toContain('value_malformed');
  });
});
