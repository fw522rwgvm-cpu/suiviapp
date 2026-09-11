import { describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  columnNames,
  openEmptyDatabase,
  readJournal,
  readMigrationSql,
  tableNames,
} from '../helpers/migrations';

/**
 * Migration replay (D6/G4).
 *
 * Replaying every migration in Node takes under a second. The same mistake
 * caught on the device costs a fifteen-minute build plus a sideload, and is
 * discovered while holding real data.
 *
 * This suite grows with the schema. From slice 1 onward it also replays
 * against a populated database, once the demo data generator exists (D15).
 */

describe('migration replay', () => {
  it('builds the schema from an empty database', () => {
    const db = openEmptyDatabase();
    try {
      const applied = applyAllMigrations(db);
      expect(applied.length).toBeGreaterThan(0);
      expect(tableNames(db)).toContain('setting');
    } finally {
      db.close();
    }
  });

  it('produces the settings table described by section 2.1', () => {
    const db = openEmptyDatabase();
    try {
      applyAllMigrations(db);
      expect(columnNames(db, 'setting')).toEqual(['key', 'value']);

      // key is the primary key, value is mandatory.
      db.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'system')").run();
      expect(() =>
        db.prepare("INSERT INTO setting (key, value) VALUES ('theme', 'dark')").run(),
      ).toThrow();
      expect(() => db.prepare("INSERT INTO setting (key) VALUES ('orphan')").run()).toThrow();
    } finally {
      db.close();
    }
  });

  it('keeps the journal and the sql files in agreement', () => {
    // A migration listed but missing, or present but unlisted, would apply a
    // different schema on the device than in this test.
    for (const entry of readJournal()) {
      expect(() => readMigrationSql(entry.tag)).not.toThrow();
    }
  });

  it('numbers migrations contiguously from zero', () => {
    // A hole in the sequence means a delivered migration was removed, which
    // D6/G2 forbids outright once real data exists.
    const indexes = readJournal().map((entry) => entry.idx);
    expect(indexes).toEqual(indexes.map((_, position) => position));
  });

  it('replays identically twice over, on two separate databases', () => {
    // Guards against a migration that depends on leftover state rather than on
    // the database it claims to build.
    const first = openEmptyDatabase();
    const second = openEmptyDatabase();
    try {
      applyAllMigrations(first);
      applyAllMigrations(second);
      expect(tableNames(first)).toEqual(tableNames(second));
      expect(columnNames(first, 'setting')).toEqual(columnNames(second, 'setting'));
    } finally {
      first.close();
      second.close();
    }
  });
});
