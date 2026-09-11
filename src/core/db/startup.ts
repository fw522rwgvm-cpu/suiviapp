import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import {
  backupBeforeMigration,
  BACKUP_DIRECTORY_NAME,
  latestBackupName,
  type BackupOutcome,
} from './backup';
import { createDrizzle, openDatabase } from './client';
import bundle from './migrations/bundle.generated';
import { discardStagingDatabase } from './staging';
import { checkDatabaseVersion } from './version-guard';

/**
 * Startup sequence of the database.
 *
 * Order matters and is normative:
 *   1. open and apply the pragmas (D2)
 *   2. refuse outright if the database is newer than the binary (D6/G3)
 *   3. clear up the receiving database of an interrupted import (D7)
 *   4. back up before touching anything, when migrations are pending (D6/G1)
 *   5. migrate
 *
 * Step 2 comes before step 3 on purpose: a database written by a newer binary
 * must not be copied, migrated or otherwise touched, only reported.
 *
 * Step 3 is new with slice 2 and sits exactly there, not earlier. D7 asks for
 * the leftover temporary file to be cleared at the next startup, and a forced
 * quit mid-import is the case it is for. But that leftover may have been
 * written by the very binary G3 is refusing to run behind — deleting it from
 * an older binary would destroy evidence, and possibly a half-built import the
 * newer one could still finish. So the refusal keeps coming first, and the
 * invariant "the refusal precedes the backup" is untouched.
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
  /**
   * Whether an interrupted import left a receiving database behind (D7).
   * Reported rather than swallowed: it is the only trace the user gets that
   * an import did not finish.
   */
  interruptedImport: boolean;
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
        interruptedImport: false,
      };
    }

    // Never a reason not to start: discardStagingDatabase swallows its own
    // failures, exactly as the backup rotation of G1 does.
    const interruptedImport = discardStagingDatabase();

    if (version.status === 'up_to_date') {
      return {
        state: { status: 'ready' },
        backup: null,
        schema: describeSchema(),
        interruptedImport,
      };
    }

    // A fresh database has nothing worth copying; an existing one always does.
    const backup = version.status === 'pending' ? backupBeforeMigration(database) : null;

    await migrate(createDrizzle(database), bundle);

    return { state: { status: 'ready' }, backup, schema: describeSchema(), interruptedImport };
  } catch (error) {
    return {
      state: {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
      backup: null,
      schema: describeSchema(),
      interruptedImport: false,
    };
  }
}
