import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { setting } from '@/core/db/schema';

/**
 * Reads of the key/value settings (schema 2.1).
 *
 * Plain functions taking the database as a parameter, like every access
 * function since slice 1, so they run in Node against a real SQLite file.
 *
 * The table is key/value rather than one column per preference, so that adding
 * a preference never costs a migration. The price is that everything is TEXT
 * and every read is a parse — which is why no caller ever sees a raw string
 * and every value has a typed reader with a fallback.
 *
 * A missing key and a corrupted value are the same thing to a caller: the
 * default. A settings row is never a reason to refuse to work.
 */

/**
 * Keys slice 2 actually uses.
 *
 * Section 2.1 lists eight; the other six arrive with their features (theme and
 * the day cutoff at slice 7, the default template at slice 5). Declaring them
 * now would be a layer built "for later", which section 7 rules out.
 */
export const SETTING_KEYS = {
  /** Instant of the last successful export, epoch ms (specs 5.4). */
  lastExportAt: 'last_export_at',
  /** How many days before the Settings screen highlights it (specs 5.4). */
  exportReminderDays: 'export_reminder_days',
  /**
   * Instant until which remote Open Food Facts calls are suspended, epoch ms
   * (D11, slice 4).
   *
   * THE ONE PIECE OF RATE-LIMITER STATE THAT IS PERSISTED, and it is here
   * rather than in a table of its own because `setting` exists precisely so
   * that remembering one value never costs a migration.
   *
   * Its counterpart — the per-minute sliding window — deliberately is NOT
   * stored: it expires in sixty seconds, and one SQLite write per remote
   * request to protect it would be a bad trade. This one is different because
   * losing it has a cost outside the phone: the server has said stop, and an
   * application killed and restarted that starts again is how an IP gets
   * banned (specs 2.2 requires surviving a forced quit at any moment).
   *
   * It rides along in an export, `setting` being an exported table. Harmless:
   * by the time an archive is imported the instant is long past, and a past
   * instant reads as expired. rate-limit.ts also refuses one too far ahead to
   * be anything but a clock that moved.
   */
  offSuspendedUntil: 'off_suspended_until',
} as const;

/**
 * Days before the export indicator is highlighted.
 *
 * ASSUMPTION, FLAGGED: the specs ask for the age to be "highlighted beyond a
 * delay" (5.4) and never give the delay. Seven days is chosen to coincide with
 * the SideStore certificate cycle, which already imposes a weekly rhythm on
 * this project: the reminder then lands on a day the phone is being handled
 * anyway. The value is a setting precisely so this guess can be corrected
 * without a migration.
 */
export const DEFAULT_EXPORT_REMINDER_DAYS = 7;

export function readSetting(db: AppDatabase, key: string): string | null {
  const rows = db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, key))
    .all();
  return rows[0]?.value ?? null;
}

/** A whole number, or the fallback. Never NaN, never a partial parse. */
export function readIntegerSetting(
  db: AppDatabase,
  key: string,
  fallback: number | null,
): number | null {
  const raw = readSetting(db, key);
  if (raw === null) return fallback;

  // Number('') is 0 and Number('4 h') is NaN, so the shape is checked first.
  // A settings row written by hand, or by a botched import, must not decide
  // that the last export happened at the epoch.
  if (!/^-?\d+$/.test(raw.trim())) return fallback;

  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : fallback;
}

/** Instant of the last successful export, or null if there has never been one. */
export function readLastExportAt(db: AppDatabase): number | null {
  const value = readIntegerSetting(db, SETTING_KEYS.lastExportAt, null);
  // A negative instant would be a date before 1970: a corrupted row, not a
  // very old export.
  return value !== null && value >= 0 ? value : null;
}

export function readExportReminderDays(db: AppDatabase): number {
  const value = readIntegerSetting(
    db,
    SETTING_KEYS.exportReminderDays,
    DEFAULT_EXPORT_REMINDER_DAYS,
  );
  return value !== null && value > 0 ? value : DEFAULT_EXPORT_REMINDER_DAYS;
}
