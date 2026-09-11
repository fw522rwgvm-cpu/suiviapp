/**
 * Naming and rotation rules for the pre-migration backups (D6/G1) — pure, and
 * importing nothing native. The filesystem-facing half lives in backup.ts.
 */
import { formatInstantStamp } from '@/core/format';

export const BACKUP_DIRECTORY_NAME = 'backups';
const BACKUP_PREFIX = 'suivi-';
/**
 * Manual copies, from the "prepare a copy" button (specs 5.4, slice 2).
 *
 * Same folder, distinct prefix, and the two rotations are independent. Same
 * folder because 5.4 describes ONE second safety net, and a second folder
 * would double what the user has to remember to look in. Distinct prefix
 * because sharing the rotation would let three deliberate copies push the
 * pre-migration backup out of the window of three — and that one is the copy
 * nobody chose to take, which is exactly why it matters.
 *
 * English, like `backups` and like the rest of the code. That the folder is
 * visible in the Files app while being named in English is a known open point
 * of slice 0, left as it is rather than half-resolved here.
 */
const MANUAL_COPY_PREFIX = 'suivi-copy-';
const BACKUP_SUFFIX = '.db';
const KEEP = 3;

/**
 * A pre-migration backup, and NOT a manual copy — which also starts with
 * `suivi-`. Getting this wrong would let one rotation delete the other's
 * copies.
 */
function isBackup(name: string): boolean {
  return (
    name.startsWith(BACKUP_PREFIX) &&
    !name.startsWith(MANUAL_COPY_PREFIX) &&
    name.endsWith(BACKUP_SUFFIX)
  );
}

function isManualCopy(name: string): boolean {
  return name.startsWith(MANUAL_COPY_PREFIX) && name.endsWith(BACKUP_SUFFIX);
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

/**
 * Names a manual copy (specs 5.4: "a 'prepare a copy' button consolidates the
 * database to allow a manual copy of the file").
 *
 * Unlike the JSON export, this path carries the media, which is why 5.4 keeps
 * it as a second net rather than folding it into the first.
 */
export function manualCopyFileName(now: Date): string {
  return `${MANUAL_COPY_PREFIX}${formatInstantStamp(now)}${BACKUP_SUFFIX}`;
}

/** Rotation of the manual copies, independent of the automatic ones. */
export function selectManualCopiesToDelete(
  fileNames: readonly string[],
  keep = KEEP,
): string[] {
  return fileNames.filter(isManualCopy).sort().reverse().slice(keep);
}

/** Most recent manual copy, to be named back to the user after the gesture. */
export function selectLatestManualCopy(fileNames: readonly string[]): string | null {
  return fileNames.filter(isManualCopy).sort().at(-1) ?? null;
}
