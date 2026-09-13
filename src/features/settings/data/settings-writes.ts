import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { setting } from '@/core/db/schema';
import { SETTING_KEYS } from './settings-reads';

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
