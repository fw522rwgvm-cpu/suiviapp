import { sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { allSchemaTableNames } from '@/features/backup/domain/table-catalog';

/**
 * Empties the database, on the development installation only (D15).
 *
 * ## IT DELETES ROWS, NOT THE FILE — AND THAT IS FORCED
 *
 * Deleting `Documents/SQLite/suivi.db` would be the obvious reset and it cannot
 * be done from inside: the connection is a singleton opened once by client.ts,
 * and nothing in section 5 can restart an application — slice 2 established
 * that when it had to swap a database in place rather than reopen one. Pulling
 * the file out from under an open handle leaves a WAL nobody reads and a
 * process holding a descriptor to a file that no longer exists.
 *
 * So the rows go and the schema stays. The result is what a fresh install
 * reaches after its migrations, which is the state this is for.
 *
 * ## THE TABLE LIST IS DERIVED, NEVER WRITTEN DOWN
 *
 * allSchemaTableNames() walks the Drizzle objects, so a table added in slice 12
 * is cleared without anybody remembering. A hand-kept list here would be the
 * defect the export catalogue exists to prevent, in the one place where being
 * wrong is invisible: a reset that silently left a table behind would look like
 * it worked, and the stale rows would surface as impossible data days later.
 *
 * `off_cache` is included, unlike in the export where it is deliberately
 * excluded. That exclusion is about what an ARCHIVE should carry; here the
 * question is what a fresh install has, and a fresh install has no cache.
 *
 * ## ONE TRANSACTION, WITH THE FOREIGN KEYS OFF
 *
 * Off because journal_entry references itself and session_set references
 * exercise: no order of DELETEs satisfies every row, which is the same reason
 * the import fill turns them off (slice 2). And the PRAGMA has to sit OUTSIDE
 * the transaction — SQLite documents that it is silently ignored inside one,
 * which slice 2 also found the hard way.
 */
export function resetDatabase(db: AppDatabase): { tables: number } {
  const names = allSchemaTableNames();

  db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    db.transaction((tx) => {
      for (const name of names) {
        tx.run(sql.raw(`DELETE FROM "${name}"`));
      }
    });
  } finally {
    // Restored whatever happened: a failed reset must not leave the connection
    // without the barrier every other write relies on.
    db.run(sql`PRAGMA foreign_keys = ON`);
  }

  return { tables: names.length };
}
