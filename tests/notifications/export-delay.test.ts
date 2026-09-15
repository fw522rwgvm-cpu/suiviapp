import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_REMINDER_DAYS,
  MAX_EXPORT_REMINDER_DAYS,
  MIN_EXPORT_REMINDER_DAYS,
  normalizeExportReminderDays,
  readExportReminderDays,
} from '../../src/features/settings/data/settings-reads';
import { writeExportReminderDays } from '../../src/features/settings/data/settings-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * export_reminder_days gets its second user (specs 5.4, 9.3).
 *
 * Readable since slice 2, settable from nowhere until now. Slice 7 recorded
 * why: until the export REMINDER existed, the number only decided when an
 * indicator changed colour — which you can see by looking. It decides when a
 * notification fires now.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('the export reminder delay', () => {
  it('defaults to the SideStore week when nothing is stored', () => {
    // The flagged assumption, unchanged and still flagged: specs 5.4 asks for
    // the age to be highlighted "beyond a delay" and never gives one. Seven
    // coincides with the certificate cycle, which already imposes a weekly
    // rhythm on this project.
    expect(readExportReminderDays(database.db)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);
  });

  it('clamps rather than refusing, on both sides of the column', () => {
    expect(normalizeExportReminderDays(0)).toBe(MIN_EXPORT_REMINDER_DAYS);
    expect(normalizeExportReminderDays(9999)).toBe(MAX_EXPORT_REMINDER_DAYS);
    expect(normalizeExportReminderDays(Number.NaN)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);
    expect(normalizeExportReminderDays(null)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);
  });

  it('stores the clamped value, so a setting reads back as what was chosen', () => {
    writeExportReminderDays(database.db, 99);
    expect(readExportReminderDays(database.db)).toBe(MAX_EXPORT_REMINDER_DAYS);

    writeExportReminderDays(database.db, 3);
    expect(readExportReminderDays(database.db)).toBe(3);
  });

  it('never returns zero, which would make every day overdue', () => {
    // A zero delay means "remind me about an export I made a moment ago", every
    // day of the horizon. The reader has always refused non-positive values;
    // this pins it now that a control can reach the column.
    database.raw
      .prepare("INSERT INTO setting (key, value) VALUES ('export_reminder_days', '0')")
      .run();
    expect(readExportReminderDays(database.db)).toBe(DEFAULT_EXPORT_REMINDER_DAYS);
  });
});
