import { describe, expect, it } from 'vitest';
import bundle from '../../src/core/db/migrations/bundle.generated';
import {
  applyAllMigrations,
  columnNames,
  applyMigration,
  openEmptyDatabase,
  readJournal,
  readMigrationSql,
  tableNames,
} from '../helpers/migrations';

/**
 * The device applies the generated TypeScript bundle; these tests replay the
 * .sql files from disk. That is only evidence if the two are the same bytes.
 *
 * Without this suite, every other migration test would be checking something
 * the phone never runs.
 */

function key(idx: number): string {
  return `m${String(idx).padStart(4, '0')}`;
}

describe('generated migration bundle', () => {
  it('carries exactly the migrations the journal lists', () => {
    const entries = readJournal();
    expect(bundle.journal.entries.map((entry) => entry.tag)).toEqual(
      entries.map((entry) => entry.tag),
    );
    expect(Object.keys(bundle.migrations).sort()).toEqual(entries.map((e) => key(e.idx)).sort());
  });

  it('carries the sql byte for byte', () => {
    for (const entry of readJournal()) {
      expect(bundle.migrations[key(entry.idx)]).toBe(readMigrationSql(entry.tag));
    }
  });

  it('keeps the timestamps drizzle uses as the version marker', () => {
    // created_at in __drizzle_migrations is this `when`. If the bundle drifted
    // from the journal, the G3 guard would compare against the wrong number.
    for (const entry of readJournal()) {
      const bundled = bundle.journal.entries.find((candidate) => candidate.idx === entry.idx);
      expect(bundled?.when).toBe(entry.when);
    }
  });

  it('builds the same schema as the files on disk', () => {
    const fromDisk = openEmptyDatabase();
    const fromBundle = openEmptyDatabase();
    try {
      applyAllMigrations(fromDisk);
      for (const entry of bundle.journal.entries) {
        const sql = bundle.migrations[key(entry.idx)];
        expect(sql).toBeDefined();
        applyMigration(fromBundle, sql as string);
      }
      expect(tableNames(fromBundle)).toEqual(tableNames(fromDisk));
      expect(columnNames(fromBundle, 'setting')).toEqual(columnNames(fromDisk, 'setting'));
    } finally {
      fromDisk.close();
      fromBundle.close();
    }
  });
});
