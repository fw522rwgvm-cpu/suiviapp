/**
 * Naming and rotation rules for the pre-migration backups (D6/G1) — pure, and
 * importing nothing native. The filesystem-facing half lives in backup.ts.
 */
import { formatInstantStamp } from '@/core/format';

export const BACKUP_DIRECTORY_NAME = 'backups';
const BACKUP_PREFIX = 'suivi-';
const BACKUP_SUFFIX = '.db';
const KEEP = 3;

function isBackup(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

/**
 * Names a backup from the current instant. The stamp now comes from
 * core/format, which the export naming of D7 shares: two padding loops would
 * be two loops free to drift, and a backup that stops sorting next to an
 * export is a folder the user has to think about.
 */
export function backupFileName(now: Date): string {
  return `${BACKUP_PREFIX}${formatInstantStamp(now)}${BACKUP_SUFFIX}`;
}

/**
 * Names to delete, keeping the most recent copies.
 *
 * Only ever returns names this module would itself have produced: the Documents
 * folder is open to the user through the Files app, so it may hold an export, a
 * note, or anything else they put there.
 */
export function selectBackupsToDelete(fileNames: readonly string[], keep = KEEP): string[] {
  return fileNames.filter(isBackup).sort().reverse().slice(keep);
}

/** Most recent copy, to be named on the G3 refusal screen. */
export function selectLatestBackup(fileNames: readonly string[]): string | null {
  return fileNames.filter(isBackup).sort().at(-1) ?? null;
}
