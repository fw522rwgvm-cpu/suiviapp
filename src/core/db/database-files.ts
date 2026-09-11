/**
 * The names of the files SQLite keeps in the container — pure, importing
 * nothing native.
 *
 * Same split as version-rules.ts / version-guard.ts and backup-rules.ts /
 * backup.ts: the part that decides WHICH file is which is testable in Node,
 * and only the part that touches the filesystem needs a device.
 *
 * The property worth isolating is small and absolute: no cleanup routine may
 * ever name the real database. Clearing up after an interrupted import (D7) by
 * deleting the database would be the single worst bug this project could ship.
 */

/** The application's database. Changing it strands the daily container. */
export const DATABASE_NAME = 'suivi.db';

/**
 * The receiving database of an import (D7, "build alongside").
 *
 * Deliberately not suffixed '.db' the way the real one is, and deliberately
 * not in the backups folder: it is neither a database the user has, nor a copy
 * they might want. It is scaffolding, and it is named so that anyone finding
 * it in the container can tell.
 */
export const STAGING_DATABASE_NAME = 'suivi.import.staging';

/**
 * The three files SQLite can leave behind in WAL mode.
 *
 * Deleting only the main file would leave a -wal holding committed pages of a
 * half-built import. The next import opens the same name, SQLite finds an
 * orphaned log, and recovers rows from the previous attempt into what is
 * supposed to be an empty database.
 */
export const STAGING_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

export function stagingFileNames(): string[] {
  return STAGING_FILE_SUFFIXES.map((suffix) => `${STAGING_DATABASE_NAME}${suffix}`);
}
