import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { backupDatabaseSync, openDatabaseSync } from 'expo-sqlite';
import { announceFullReplacement } from '@/core/db/change-bus';
import { applyPragmas, checkpoint, createDrizzle, openDatabase } from '@/core/db/client';
import { STAGING_DATABASE_NAME } from '@/core/db/database-files';
import bundle from '@/core/db/migrations/bundle.generated';
import { discardStagingDatabase } from '@/core/db/staging';
import { buildDatabase, type BuildReport } from './domain/build-database';
import { bundleUpTo } from './domain/migration-prefix';
import type { Verdict } from './domain/problems';
import type { ValidatedPayload } from './domain/validate-payload';

/**
 * "Build alongside, validate, switch at the end" — the switch (D7).
 *
 * THIS IS THE ONE PART OF SLICE 2 THAT NO TEST REACHES. Everything upstream —
 * reading, validating, filling, checking — runs in Node against a real SQLite
 * file. This module imports expo-sqlite, so it runs on the phone and nowhere
 * else. It is also the only part capable of destroying the daily database.
 * Both facts are stated here so nobody reads a green suite as covering it.
 *
 * HOW THE SWITCH WORKS, and why the application does not restart.
 *
 * The obvious approach — close the connection, move the file over the real
 * one, reopen — runs into everything the running application is holding: the
 * module-level SQLiteDatabase, the Drizzle instance built on it, the change
 * bus subscribed to it, and React Query's cache. Restarting the application
 * would settle all of it, and no dependency in section 5 can restart an
 * application.
 *
 * expo-sqlite exposes backupDatabaseSync, which is SQLite's online backup API
 * (sqlite3_backup_*). It copies page by page from a source connection INTO AN
 * ALREADY OPEN destination connection. So the live SQLiteDatabase object stays
 * valid, the Drizzle instance stays valid, the change listener stays attached,
 * and there is nothing to replace and nothing to restart.
 *
 * What does NOT survive is React Query's cache, because the update hook does
 * not fire for pages written by the backup API. See announceFullReplacement.
 *
 * VERIFIED ON THE DEVICE, 12/09/2026: backupDatabaseSync does work with a
 * destination opened in WAL mode and with enableChangeListener. It was the one
 * thing about this slice that could not be settled off the phone — SQLite's
 * documented constraint is on page size, which matches because both files are
 * created by this application with the default, but a reasoning is not an
 * observation. The observation now exists: a full export from the daily
 * installation imported into the development one, same figures, no restart.
 */

export interface SwapOutcome extends BuildReport {
  /** Migration tags applied after the rows went in. Empty in the usual case. */
  migratedThrough: string[];
}

/**
 * Builds a receiving database from a validated payload and switches it in.
 *
 * The order is D7's, and none of it is negotiable:
 *   1. clear any leftover receiving database (a previous attempt, interrupted)
 *   2. open a NEW file, migrated to the schema the ARCHIVE declares
 *   3. fill it and run barrier three
 *   4. migrate it forward to the schema this BINARY carries
 *   5. only then, switch
 *
 * Steps 2 and 4 are the answer to an archive older than the binary: restore at
 * its own schema and migrate, rather than build straight at the current one.
 * D6 states that each migration carries its data backfill in the same
 * transaction, and building at the current schema throws that away — a column
 * added in slice 5 with a computed backfill would land on its default instead,
 * silently. It also means there is one migration path in the project rather
 * than two, on the only safety net there is.
 *
 * The current database is not touched until step 5, and if anything fails
 * before it, it is not touched at all.
 */
export async function replaceDatabase(
  payload: ValidatedPayload,
): Promise<Verdict<SwapOutcome>> {
  // A previous attempt may have been killed between building and switching.
  // Startup clears this too, but an import twice in one session would
  // otherwise open a file SQLite would recover rows into.
  discardStagingDatabase();

  const staging = openDatabaseSync(STAGING_DATABASE_NAME, {
    // No listener: the fill writes thousands of rows and not one of them is a
    // change to anything the application is showing. The bus hears about this
    // import exactly once, at the end, from announceFullReplacement.
    enableChangeListener: false,
  });

  try {
    // Same settings as the real connection, or the constraints exercised while
    // the database is built are not the ones it will live under.
    applyPragmas(staging);

    const stagingDb = createDrizzle(staging);

    // At the archive's own schema.
    await migrate(stagingDb, bundleUpTo(bundle, payload.schemaIndex));

    const built = buildDatabase(stagingDb, payload);
    if (!built.ok) return built;

    // Then forward to this binary's. The migrator reads __drizzle_migrations
    // and applies only what is missing, so handing it the whole bundle applies
    // exactly the remainder.
    const before = payload.schemaIndex;
    await migrate(stagingDb, bundle);
    const migratedThrough = bundle.journal.entries
      .filter((entry) => entry.idx > before)
      .map((entry) => entry.tag);

    // Consolidate the log into the main file first. The backup reads through
    // the connection and would see the WAL anyway; doing it here means the
    // source is self-sufficient at the moment that matters.
    checkpoint(staging);

    backupDatabaseSync({ sourceDatabase: staging, destDatabase: openDatabase() });

    // The update hook saw none of that: the backup writes pages, not rows.
    announceFullReplacement();

    return { ok: true, value: { ...built.value, migratedThrough } };
  } finally {
    // Whatever happened. A receiving database left behind would be picked up
    // by the next startup and reported as an interrupted import that was not.
    staging.closeSync();
    discardStagingDatabase();
  }
}
