/**
 * Naming an export file (D7: "file name dated and sortable").
 *
 * Same stamp grammar as the pre-migration backups, from the same function in
 * core/format. The two land in different places — backups in Documents, where
 * the Files app shows them, exports in the cache on their way to the share
 * sheet — but they are the same kind of object to whoever is looking for one,
 * and they sort together when they end up in the same folder.
 *
 * The prefix is deliberately distinct from the backups' `suivi-`, and the
 * distinction is load-bearing twice over: `.gitignore` refuses these files by
 * name (D15 — no real export ever joins the repository), and the backup
 * rotation only ever deletes names it would itself have produced.
 */

import { formatInstantStamp } from '@/core/format';

export const EXPORT_FILE_PREFIX = 'suivi-export-';
export const EXPORT_FILE_SUFFIX = '.json';

/** 'suivi-export-20260912-143200.json' */
export function exportFileName(now: Date): string {
  return `${EXPORT_FILE_PREFIX}${formatInstantStamp(now)}${EXPORT_FILE_SUFFIX}`;
}

/**
 * Recognises a name this module would have produced.
 *
 * Not used to decide whether a file may be imported — a file renamed by the
 * user, or handed over by the share sheet under a name of its own, must still
 * import. The header is what identifies an archive (see envelope.ts); the name
 * is a convenience. This exists for the one honest use: telling our own
 * leftovers apart from everything else in a directory.
 */
export function isExportFileName(name: string): boolean {
  return name.startsWith(EXPORT_FILE_PREFIX) && name.endsWith(EXPORT_FILE_SUFFIX);
}
