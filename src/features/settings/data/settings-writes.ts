import { eq } from 'drizzle-orm';
import { normalizeCutoffHour } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { setting } from '@/core/db/schema';
import type { ThemePreference } from '@/core/theme/tokens';
import { normalizeAdherenceTolerance } from '../domain/preferences';
import { normalizeExportReminderDays, SETTING_KEYS } from './settings-reads';

/**
 * Writes to the key/value settings (schema 2.1).
 *
 * THE FIRST REAL WRITE INTO `setting`. The table has existed since migration
 * 0000 and nothing has ever put a row in it: slice 2 is where the first
 * genuine preference is stored, because the age of the last export (specs 5.4)
 * is the first thing the application has to remember about itself.
 *
 * Nothing here imports a native module, and nothing enumerates a query to
 * invalidate: the write touches `setting`, SQLite reports it, and the change
 * bus invalidates whatever declared reading that table (D8).
 */

/**
 * Upsert, so a caller never has to know whether the preference existed.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one. The rule that every multi-row operation is explicitly
 * transactional is about operations touching more than one row.
 */
export function writeSetting(db: AppDatabase, key: string, value: string): void {
  db.insert(setting)
    .values({ key, value })
    .onConflictDoUpdate({ target: setting.key, set: { value } })
    .run();
}

/**
 * Removes a preference, rather than storing an empty string for "none".
 *
 * The distinction matters for a pointer: default_template_id holding '' would
 * be a value that parses to nothing, and every reader would have to know that
 * the empty string means unset. An absent key already means exactly that, and
 * settings-reads.ts already treats a missing key and a corrupt value alike.
 *
 * One statement, so no explicit transaction — but callers that clear a pointer
 * BECAUSE something was deleted must wrap both, and deleteTemplate does.
 */
export function clearSetting(db: AppDatabase, key: string): void {
  db.delete(setting).where(eq(setting.key, key)).run();
}

/**
 * Records that an export succeeded.
 *
 * Called only after the file has actually been written and handed to the share
 * sheet. Recording it earlier would let a cancelled export reset the age
 * indicator — which would mean the one number telling the user their data is
 * unprotected would be lying, in the reassuring direction.
 *
 * An instant, never a civil date (D3): "how long since" is a duration, and
 * durations are what instants are for.
 */
export function recordExport(db: AppDatabase, at: number): void {
  writeSetting(db, SETTING_KEYS.lastExportAt, String(Math.trunc(at)));
}

/**
 * Dates the freshly imported database by the archive it came from.
 *
 * Called after a successful import, and it is the truthful answer rather than
 * a convenient one. The indicator means "how long since this data last existed
 * in a file outside the device" — and for data that has just come OUT of such
 * a file, the answer is the archive's own timestamp.
 *
 * Leaving the imported row alone would be wrong twice over. `setting` is one
 * of the imported tables, so the archive carries the EXPORTING device's
 * last_export_at — and since recordExport runs after the file is built, that
 * value is one export cycle stale. The user would be told their data is
 * protected as of a date earlier than the archive they are literally holding.
 */
export function recordImportedArchive(db: AppDatabase, exportedAt: number): void {
  recordExport(db, exportedAt);
}

/**
 * The theme preference (specs 8.8).
 *
 * The value is narrowed by its type rather than validated here: a
 * ThemePreference cannot be anything else. Reading is where the checking
 * happens, because reading is the side that faces an imported archive or a row
 * repaired by hand.
 */
export function writeThemePreference(db: AppDatabase, preference: ThemePreference): void {
  writeSetting(db, SETTING_KEYS.theme, preference);
}

/**
 * The hour at which the day turns over (specs 8.2, 8.8).
 *
 * Normalised on the way IN as well as on the way out, which is not a belt and
 * braces: the two sides answer different questions. Clamping on read protects
 * against a row this application did not write; clamping on write means the
 * stored value is the one the user will be shown, so a setting can never read
 * back as something other than what was chosen.
 */
export function writeCutoffHour(db: AppDatabase, hour: number): void {
  writeSetting(db, SETTING_KEYS.dayCutoffHour, String(normalizeCutoffHour(hour)));
}

/**
 * How many days before the export counts as stale (specs 5.4, 9.3).
 *
 * ## THE SECOND USER THIS KEY WAS WAITING FOR
 *
 * The value has been readable since slice 2 and settable from nowhere. Slice 7
 * recorded why: the indicator on the Settings screen highlights itself past the
 * delay, and until the export REMINDER existed there was nothing a user could
 * do with the number that they could not do by looking. Slice 9 is that
 * reminder, and a delay that decides when a notification fires is a delay worth
 * choosing.
 *
 * The seven it defaults to remains the flagged assumption it always was — specs
 * 5.4 asks for the age to be highlighted "beyond a delay" and never gives one,
 * and seven coincides with the SideStore certificate cycle. It is a setting
 * precisely so the guess can be corrected without a migration, and now it can.
 */
export function writeExportReminderDays(db: AppDatabase, days: number): void {
  writeSetting(
    db,
    SETTING_KEYS.exportReminderDays,
    String(normalizeExportReminderDays(days)),
  );
}

/** Slack allowed on each of the four macros, in percent (specs 8.7). */
export function writeAdherenceTolerancePct(db: AppDatabase, percent: number): void {
  writeSetting(
    db,
    SETTING_KEYS.adherenceTolerancePct,
    String(normalizeAdherenceTolerance(percent)),
  );
}
