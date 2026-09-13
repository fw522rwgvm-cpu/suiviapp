import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import bundle from '../../src/core/db/migrations/bundle.generated';
import { setting } from '../../src/core/db/schema';
import { buildDatabase } from '../../src/features/backup/domain/build-database';
import type { BinarySchema } from '../../src/features/backup/domain/envelope';
import { buildExportFile } from '../../src/features/backup/domain/export-payload';
import {
  bundleUpTo,
  journalTags,
  tagsAfter,
} from '../../src/features/backup/domain/migration-prefix';
import { validateImportFile } from '../../src/features/backup/domain/validate-payload';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { seedJournal } from '../../src/dev/seed';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';
import { tableNames } from '../helpers/migrations';

/**
 * Building the receiving database, and barrier three of D7.
 *
 * This is the "build alongside" half of "build alongside, validate, switch at
 * the end". The switch itself is native and lives in swap.ts, where no test
 * can reach it — which is stated plainly here so nobody reads a green run as
 * proof that an import is safe on the phone.
 */

const BINARY: BinarySchema = { tags: journalTags(bundle) };
const DAY = toLocalDate('2026-09-11');

let source: TestDatabase;
let receiving: TestDatabase;

beforeEach(() => {
  source = openTestDatabase();
  receiving = openTestDatabase();
});

afterEach(() => {
  source.close();
  receiving.close();
});

function exported(db: TestDatabase): unknown {
  return JSON.parse(
    JSON.stringify(
      buildExportFile(db.db, {
        schemaVersion: '0001_journal',
        schemaMigrationCount: 2,
        appVersion: '0.1.0',
        appVariant: 'production',
        exportedAt: 1_789_243_920_000,
      }),
    ),
  );
}

function validated(file: unknown) {
  const verdict = validateImportFile(file, BINARY);
  if (!verdict.ok) {
    throw new Error(`fixture did not validate: ${JSON.stringify(verdict.problems)}`);
  }
  return verdict.value;
}

describe('building the receiving database', () => {
  it('writes every row of a validated payload', () => {
    source.db.insert(setting).values({ key: 'theme', value: 'dark' }).run();
    addFreeEntry(source.db, {
      date: DAY,
      mealPosition: 0,
      name: 'Poulet',
      macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
    });

    const verdict = buildDatabase(receiving.db, validated(exported(source)));

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.value.written['setting']).toBe(1);
    expect(verdict.value.written['day']).toBe(1);
    expect(verdict.value.written['journal_entry']).toBe(1);
    expect(verdict.value.total).toBe(verdict.value.written['day_meal']! + 3);
  });

  it('leaves foreign keys enforced once it is done', () => {
    // The receiving database is about to become the application's database.
    // One left with its constraints off would enforce nothing for the rest of
    // its life, and D5's freezing rules rest on links SQLite actually checks.
    buildDatabase(receiving.db, validated(exported(source)));

    expect(receiving.raw.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('restores them even when the fill throws', () => {
    // A kind outside the closed set. Validation refuses it long before this
    // point, so getting here means the payload was built by hand — but the
    // CHECK constraint is the last line of defence and it fires during the
    // transaction, which is exactly when the pragma must still be put back.
    // Switching foreign keys off and leaving them off would hand the
    // application a database that enforces nothing ever again.
    const payload = validated(exported(openTestDatabaseWith(DAY)));
    const entries = [...(payload.rows['journal_entry'] ?? [])];
    entries[0] = { ...entries[0]!, kind: 'snack' };

    const broken = {
      ...payload,
      rows: { ...payload.rows, journal_entry: entries },
    };

    expect(() => buildDatabase(receiving.db, broken)).toThrow();
    expect(receiving.raw.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('carries a history of several months without tripping the variable limit', () => {
    // SQLITE_MAX_VARIABLE_NUMBER is 999 on older builds. Getting the chunking
    // wrong is an import that works on one device's history and fails on
    // another's, which is the worst possible day to find out.
    const report = seedJournal(source.db, { endDate: DAY, days: 120, seed: 7 });
    expect(report.entries).toBeGreaterThan(200);

    const verdict = buildDatabase(receiving.db, validated(exported(source)));

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.value.written['journal_entry']).toBe(report.entries);
  });
});

describe('an archive written before the food tables existed', () => {
  /**
   * THE UPGRADE PATH EVERY EXISTING ARCHIVE WILL TAKE.
   *
   * Slice 2 shipped and archives have been taken since. Every one of them
   * declares 0001_journal and has no food tables in it — the database it was
   * read from had none. What must happen: the receiving database is built at
   * 0001, filled, and then migrated through 0002, which creates the two tables
   * empty. Not built at the current schema and filled, which D6 rules out
   * because a later migration's data backfill would be thrown away.
   */
  it('imports, then gains the food tables empty, keeping every row', () => {
    source.db.insert(setting).values({ key: 'theme', value: 'dark' }).run();
    const report = seedJournal(source.db, { endDate: DAY, days: 40, seed: 3 });

    const file = exported(source) as Record<string, unknown>;
    const tables = file['tables'] as Record<string, unknown>;
    // Written by a binary that had never heard of them.
    delete tables['food'];
    delete tables['food_portion'];

    const verdict = buildDatabase(receiving.db, validated(file));
    expect(verdict.ok, JSON.stringify(verdict.ok ? [] : verdict.problems)).toBe(true);
    if (!verdict.ok) return;

    // The journal came through whole.
    expect(verdict.value.written['journal_entry']).toBe(report.entries);
    expect(countRows(receiving.raw, 'journal_entry')).toBe(report.entries);

    // And the tables the archive could not carry exist, empty, created by the
    // migration rather than by the importer.
    expect(tableNames(receiving.raw)).toContain('food');
    expect(countRows(receiving.raw, 'food')).toBe(0);
    expect(countRows(receiving.raw, 'food_portion')).toBe(0);

    // Fully migrated: the CHECK from 0002 is live on the database that is
    // about to become the application's.
    expect(() =>
      receiving.raw
        .prepare(
          `INSERT INTO food (id, name, source, base_unit,
                             protein_100, carbs_100, fat_100, kcal_100)
           VALUES ('x', 'x', 'openfoodfacts', 'g', 0, 0, 0, 0)`,
        )
        .run(),
    ).toThrow();
  });
});

describe('barrier three — referential integrity', () => {
  it('refuses a portion attached to a food that is not in the file', () => {
    // The first real foreign key the food domain brings, and the first time
    // barrier three has anything to say about it. Caught BEFORE the switch,
    // which is the whole shape of D7: the current database stays intact.
    const payload = validated(exported(openTestDatabaseWith(DAY)));
    const orphan = {
      id: '01JZZZZZZZZZZZZZZZZZZZZZZY',
      food_id: '01JZZZZZZZZZZZZZZZZZZZZZZZ',
      name: 'tranche',
      quantity: 25,
      position: 0,
    };

    const verdict = buildDatabase(receiving.db, {
      ...payload,
      rows: { ...payload.rows, food_portion: [orphan] },
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems).toContainEqual(
      expect.objectContaining({ code: 'foreign_key_violated', table: 'food_portion' }),
    );
  });

  it('refuses an entry whose meal does not exist', () => {
    const payload = validated(exported(openTestDatabaseWith(DAY)));
    const entries = [...(payload.rows['journal_entry'] ?? [])];
    entries[0] = { ...entries[0]!, day_meal_id: '01JZZZZZZZZZZZZZZZZZZZZZZZ' };

    const verdict = buildDatabase(receiving.db, {
      ...payload,
      rows: { ...payload.rows, journal_entry: entries },
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems).toContainEqual(
      expect.objectContaining({ code: 'foreign_key_violated', table: 'journal_entry' }),
    );
  });

  it('refuses a denormalised date that disagrees with its meal', () => {
    // journal_entry.date is denormalised so slice 7's statistics stay
    // index-only. A denormalised column can disagree with its source without
    // anything complaining — and on an archive edited by hand, which D7
    // expects, that makes a day's totals quietly wrong.
    const payload = validated(exported(openTestDatabaseWith(DAY)));
    const entries = [...(payload.rows['journal_entry'] ?? [])];
    entries[0] = { ...entries[0]!, date: '2026-09-12' };

    const verdict = buildDatabase(receiving.db, {
      ...payload,
      rows: { ...payload.rows, journal_entry: entries },
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems).toContainEqual(
      expect.objectContaining({ code: 'denormalised_date_mismatch', count: 1 }),
    );
  });

  it('accepts a self-referencing chain that no insertion order could satisfy', () => {
    // journal_entry references itself through parent_entry_id. This is the
    // reason foreign keys are switched off for the fill rather than the rows
    // being sorted cleverly: with a parent later in the array than its child,
    // no ordering works and constraint checking has to be deferred.
    const payload = validated(exported(openTestDatabaseWith(DAY)));
    const entries = [...(payload.rows['journal_entry'] ?? [])];
    const parent = entries[0]!;
    const child = {
      ...parent,
      id: '01JZZZZZZZZZZZZZZZZZZZZZZY',
      parent_entry_id: parent['id'] ?? null,
      position: 1,
    };

    const verdict = buildDatabase(receiving.db, {
      ...payload,
      // Child first, parent second.
      rows: { ...payload.rows, journal_entry: [child, parent] },
    });

    expect(verdict.ok).toBe(true);
  });
});

describe('slicing the migration journal', () => {
  it('keeps the prefix up to the archive, renumbered from zero', () => {
    // The migrator reads idx as a position in the list it is given, not as an
    // identity, so a slice that kept the original numbering would skip.
    const sliced = bundleUpTo(bundle, 0);

    expect(sliced.journal.entries.map((entry) => entry.tag)).toEqual([
      '0000_initial_setting',
    ]);
    expect(sliced.journal.entries.map((entry) => entry.idx)).toEqual([0]);
  });

  it('names what is left to apply after the rows are in', () => {
    expect(tagsAfter(bundle, 0)).toEqual([
      '0001_journal',
      '0002_food',
      '0003_barcode_off_cache',
      '0004_templates_planning',
    ]);
    // An archive from this binary has nothing left, which is the ordinary case.
    expect(tagsAfter(bundle, bundle.journal.entries.length - 1)).toEqual([]);
  });

  it('splits the journal in two without a gap or an overlap, at every point', () => {
    // The property the whole "restore at the archive's schema, then migrate"
    // decision rests on, asserted rather than illustrated: what goes in before
    // the rows and what goes in after must together be the journal, exactly
    // once each, in order. A gap would leave the database short of a table; an
    // overlap would replay a migration over its own result.
    //
    // Written over every index so it needs no edit at the next slice — which
    // is the point, since the case that will actually break is the one nobody
    // thought to enumerate.
    const all = journalTags(bundle);

    for (let index = 0; index < all.length; index += 1) {
      const before = bundleUpTo(bundle, index).journal.entries.map((entry) => entry.tag);
      expect([...before, ...tagsAfter(bundle, index)]).toEqual(all);
      // Re-indexed from zero: the migrator reads idx as a position in the list
      // it was handed, not as an identity.
      expect(bundleUpTo(bundle, index).journal.entries.map((entry) => entry.idx)).toEqual(
        before.map((_, position) => position),
      );
    }
  });
});

/** A source database holding one day with one entry. */
function openTestDatabaseWith(date: ReturnType<typeof toLocalDate>): TestDatabase {
  addFreeEntry(source.db, {
    date,
    mealPosition: 0,
    name: 'Poulet',
    macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
  });
  return source;
}
