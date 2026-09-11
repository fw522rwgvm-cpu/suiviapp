/**
 * Naming and rotation rules for the pre-migration backups (D6/G1) — pure,
 * and importing nothing. The filesystem-facing half lives in backup.ts.
 */

export const BACKUP_DIRECTORY_NAME = 'backups';
const BACKUP_PREFIX = 'suivi-';
const BACKUP_SUFFIX = '.db';
const KEEP = 3;

function isBackup(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

/**
 * Names a backup from the current instant. This reads the clock, never a civil
 * date string: D3 forbids parsing 'YYYY-MM-DD' through the Date constructor,
 * but turning an instant into a technical filename is what instants are for.
 * Every field is padded so that sorting by name is sorting by age.
 */
export function backupFileName(now: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const stamp =
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
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
