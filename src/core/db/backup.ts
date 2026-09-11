import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  BACKUP_DIRECTORY_NAME,
  backupFileName,
  selectBackupsToDelete,
  selectLatestBackup,
} from './backup-rules';
import { checkpoint } from './client';

/**
 * Automatic backup before any migration (D6/G1).
 *
 * Described by the architecture as the most profitable measure of the whole
 * project, and also the cheapest: consolidate, copy, keep three.
 *
 * The copies land in Documents, which UIFileSharingEnabled and
 * LSSupportsOpeningDocumentsInPlace expose in the Files app. A backup the user
 * cannot reach by hand is not a backup: the G3 refusal screen names this file
 * precisely so it can be fetched from there.
 *
 * Naming and rotation rules live in backup-rules.ts, where they are tested.
 */

export { BACKUP_DIRECTORY_NAME };

export interface BackupOutcome {
  fileName: string;
  directoryName: string;
}

function backupDirectory(): Directory {
  return new Directory(Paths.document, BACKUP_DIRECTORY_NAME);
}

function toFile(path: string): File {
  // expo-sqlite reports an absolute filesystem path; File expects a file:// URI.
  return new File(path.startsWith('file://') ? path : `file://${path}`);
}

function listFileNames(directory: Directory): string[] {
  return directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((entry) => entry.name);
}

export function backupBeforeMigration(
  database: SQLiteDatabase,
  now: Date = new Date(),
): BackupOutcome {
  // Consolidate first: without this the copy misses whatever is still in -wal.
  checkpoint(database);

  const directory = backupDirectory();
  directory.create({ intermediates: true, idempotent: true });

  const fileName = backupFileName(now);
  toFile(database.databasePath).copySync(new File(directory, fileName));

  rotate(directory);

  return { fileName, directoryName: BACKUP_DIRECTORY_NAME };
}

function rotate(directory: Directory): void {
  for (const name of selectBackupsToDelete(listFileNames(directory))) {
    // Rotation must never be the reason a migration fails. Losing the oldest
    // copy is a nuisance; refusing to start is not.
    try {
      new File(directory, name).delete();
    } catch {
      // ignored on purpose
    }
  }
}

/**
 * Names the most recent copy, for the refusal screen of G3, which must name a
 * file and say where to find it. The copy it names is the one taken by the
 * previous migration: when the binary refuses, it creates nothing.
 *
 * Deliberately forgiving. If the directory is unreadable the refusal still has
 * to render, just with less to say.
 */
export function latestBackupName(): string | null {
  try {
    const directory = backupDirectory();
    if (!directory.exists) return null;
    return selectLatestBackup(listFileNames(directory));
  } catch {
    return null;
  }
}
