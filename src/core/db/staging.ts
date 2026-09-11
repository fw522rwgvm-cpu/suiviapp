import { Directory, File } from 'expo-file-system';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import { stagingFileNames } from './database-files';

/**
 * Clearing up after an interrupted import (D7).
 *
 * > A fresh database is built in a temporary file, validated completely, and
 * > only the final switch replaces the current database. A forced quit leaves
 * > nothing but a temporary file to clean up at the next startup.
 *
 * This is that cleanup. A forced quit is not a hypothesis here: the SideStore
 * certificate expires weekly and the application is expected to tolerate being
 * killed at any moment without loss.
 *
 * The filesystem-facing half only. Which names are the scaffolding's, and the
 * fact that none of them is ever the real database, live in database-files.ts
 * where they are tested.
 *
 * It lives beside the database rather than inside features/backup because the
 * startup sequence is what runs it, and the startup sequence must not depend
 * on a feature module to know how to start.
 */

export { STAGING_DATABASE_NAME, stagingFileNames } from './database-files';

/**
 * Removes every trace of a receiving database.
 *
 * Returns whether anything was actually there, which is how the startup report
 * can say an import was interrupted rather than silently tidying up.
 *
 * Deliberately forgiving, exactly like the backup rotation of D6/G1: losing
 * the ability to delete scaffolding is a nuisance, refusing to start is not.
 */
export function discardStagingDatabase(): boolean {
  let found = false;
  const directory = new Directory(String(defaultDatabaseDirectory));

  for (const name of stagingFileNames()) {
    try {
      const file = new File(directory, name);
      if (file.exists) {
        file.delete();
        found = true;
      }
    } catch {
      // ignored on purpose
    }
  }

  return found;
}
