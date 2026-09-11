import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_REMINDER_DAYS,
  readExportReminderDays,
  readIntegerSetting,
  readLastExportAt,
  readSetting,
  SETTING_KEYS,
} from '../../src/features/settings/data/settings-reads';
import {
  recordExport,
  recordImportedArchive,
  writeSetting,
} from '../../src/features/settings/data/settings-writes';
import { exportFreshness } from '../../src/features/backup/domain/export-age';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The first real writes into `setting` (schema 2.1).
 *
 * The table has existed since migration 0000 and nothing had ever put a row in
 * it. What makes these worth testing is not the upsert — it is the parsing: a
 * key/value table is all TEXT, so every read is a parse, and a parse that
 * returns NaN or a partial number would let one bad row decide that the last
 * export happened at the epoch. That is a plausible and wrong result, which is
 * D15's criterion exactly.
 */

const MS_PER_DAY = 86_400_000;
const NOW = 1_789_243_920_000;

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('settings storage', () => {
  it('writes a preference and reads it back', () => {
    writeSetting(database.db, 'theme', 'dark');
    expect(readSetting(database.db, 'theme')).toBe('dark');
  });

  it('upserts, so a caller never has to know whether the key existed', () => {
    writeSetting(database.db, 'theme', 'dark');
    writeSetting(database.db, 'theme', 'light');

    expect(readSetting(database.db, 'theme')).toBe('light');
    expect(database.raw.prepare('SELECT COUNT(*) AS n FROM setting').get()).toEqual({
      n: 1,
    });
  });

  it('falls back rather than returning a half-parsed number', () => {
    // Number('') is 0 and Number('4 h') is NaN. A row written by hand, or by a
    // botched import, must not become a value the application then trusts.
    for (const bad of ['', '   ', '4 h', 'hier', '3.5', '0x10', '1e3', '--2']) {
      writeSetting(database.db, 'probe', bad);
      expect(readIntegerSetting(database.db, 'probe', 99), bad).toBe(99);
    }

    writeSetting(database.db, 'probe', ' 42 ');
    expect(readIntegerSetting(database.db, 'probe', 99)).toBe(42);
  });

  it('treats a missing key and a corrupted value the same way', () => {
    // A settings row is never a reason to refuse to work.
    expect(readExportReminderDays(database.db)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);

    writeSetting(database.db, SETTING_KEYS.exportReminderDays, 'beaucoup');
    expect(readExportReminderDays(database.db)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);

    writeSetting(database.db, SETTING_KEYS.exportReminderDays, '0');
    expect(readExportReminderDays(database.db)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);

    writeSetting(database.db, SETTING_KEYS.exportReminderDays, '3');
    expect(readExportReminderDays(database.db)).toBe(3);
  });
});

describe('the record of the last export', () => {
  it('is absent until an export actually succeeds', () => {
    expect(readLastExportAt(database.db)).toBeNull();
  });

  it('records the instant of a successful export', () => {
    recordExport(database.db, NOW);
    expect(readLastExportAt(database.db)).toBe(NOW);
  });

  it('refuses a negative instant as corruption, not as a very old export', () => {
    writeSetting(database.db, SETTING_KEYS.lastExportAt, '-5');
    expect(readLastExportAt(database.db)).toBeNull();
  });

  it('dates an imported database by the archive it came from', () => {
    // `setting` is itself imported, so the archive carries the exporting
    // device's value — and since recordExport runs after the file is built,
    // that value is one export cycle stale. The archive's own timestamp is the
    // truthful answer to "when was this data last outside the device".
    recordImportedArchive(database.db, NOW);
    expect(readLastExportAt(database.db)).toBe(NOW);
  });
});

describe('export freshness indicator (specs 5.4)', () => {
  it('reports never when nothing has been exported', () => {
    expect(exportFreshness(null, NOW, 7)).toEqual({ state: 'never' });
  });

  it('counts elapsed days, not civil days', () => {
    // An export at 23:50 and a glance at 00:10 are one civil day apart and
    // twenty minutes apart. Twenty minutes is the honest answer to "is my
    // data safe", and it raises no timezone question at all (D3).
    expect(exportFreshness(NOW - 20 * 60_000, NOW, 7)).toMatchObject({
      state: 'fresh',
      days: 0,
    });
  });

  it('highlights past the reminder delay, and not before', () => {
    expect(exportFreshness(NOW - 6 * MS_PER_DAY, NOW, 7).state).toBe('fresh');
    expect(exportFreshness(NOW - 7 * MS_PER_DAY, NOW, 7).state).toBe('stale');
    expect(exportFreshness(NOW - 40 * MS_PER_DAY, NOW, 7)).toMatchObject({
      state: 'stale',
      days: 40,
    });
  });

  it('never reads as fresh forever because a clock moved backwards', () => {
    // A timezone change or a manual correction can put the recorded instant
    // ahead of now. This is the one number in the application that must never
    // err in the reassuring direction.
    expect(exportFreshness(NOW + 10 * MS_PER_DAY, NOW, 7)).toMatchObject({
      state: 'fresh',
      days: 0,
    });
  });
});
