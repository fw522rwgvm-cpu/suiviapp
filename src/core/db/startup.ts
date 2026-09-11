import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import {
  backupBeforeMigration,
  BACKUP_DIRECTORY_NAME,
  latestBackupName,
  type BackupOutcome,
} from './backup';
import { createDrizzle, openDatabase } from './client';
import bundle from './migrations/bundle.generated';
import { checkDatabaseVersion } from './version-guard';

/**
 * Startup sequence of the database.
 *
 * Order matters and is normative:
 *   1. open and apply the pragmas (D2)
 *   2. refuse outright if the database is newer than the binary (D6/G3)
 *   3. back up before touching anything, when migrations are pending (D6/G1)
 *   4. migrate
 *
 * Step 2 comes before step 3 on purpose: a database written by a newer binary
 * must not be copied, migrated or otherwise touched, only reported.
 *
 * Lives outside any component: D10 keeps logic out of the render path, and this
 * way the sequence stays readable as a sequence.
 */

export type StartupState =
  | { status: 'ready' }
  | {
      status: 'blocked';
      reason: 'database_too_recent';
      backupDirectoryName: string;
      /** Most recent copy on disk, named so the user can go and get it (G3). */
      backupFileName: string | null;
    }
  | { status: 'failed'; message: string };

export interface SchemaInfo {
  /** Number of migrations the binary carries. Shown in Settings (specs 8.8). */
  migrationCount: number;
  lastTag: string | null;
}

export interface StartupReport {
  state: StartupState;
  backup: BackupOutcome | null;
  schema: SchemaInfo;
}

function describeSchema(): SchemaInfo {
  const entries = [...bundle.journal.entries].sort((a, b) => a.idx - b.idx);
  return {
    migrationCount: entries.length,
    lastTag: entries.at(-1)?.tag ?? null,
  };
}

export async function prepareDatabase(): Promise<StartupReport> {
  try {
    const database = openDatabase();
    const version = checkDatabaseVersion(database);

    if (version.status === 'too_recent') {
      return {
        state: {
          status: 'blocked',
          reason: 'database_too_recent',
          backupDirectoryName: BACKUP_DIRECTORY_NAME,
          backupFileName: latestBackupName(),
        },
        backup: null,
        schema: describeSchema(),
      };
    }

    if (version.status === 'up_to_date') {
      return { state: { status: 'ready' }, backup: null, schema: describeSchema() };
    }

    // A fresh database has nothing worth copying; an existing one always does.
    const backup = version.status === 'pending' ? backupBeforeMigration(database) : null;

    await migrate(createDrizzle(database), bundle);

    return { state: { status: 'ready' }, backup, schema: describeSchema() };
  } catch (error) {
    return {
      state: {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
      backup: null,
      schema: describeSchema(),
    };
  }
}
