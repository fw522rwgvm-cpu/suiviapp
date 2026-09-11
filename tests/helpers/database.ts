import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { AppDatabase } from '../../src/core/db/database';
import * as schema from '../../src/core/db/schema';
import { applyAllMigrations, applyMigrationsUpTo, openEmptyDatabase } from './migrations';

/**
 * A real SQLite database, migrated, for the access layer tests (D15, fifth by
 * value: "the invariants of the access layer, against a real SQLite file in
 * Node").
 *
 * The domain writes against BaseSQLiteDatabase, the ancestor expo-sqlite and
 * better-sqlite3 share, which is what lets the very same functions run here and
 * on the device. Nothing is mocked: the foreign keys, the cascades and the
 * CHECK constraints exercised here are the ones the iPhone will enforce.
 */
export interface TestDatabase {
  db: AppDatabase;
  /** Raw handle, for assertions that are clearer written as SQL. */
  raw: Database.Database;
  close(): void;
}

export function openTestDatabase(): TestDatabase {
  const raw = openEmptyDatabase();
  applyAllMigrations(raw);
  const db = drizzle(raw, { schema });

  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

/**
 * A database migrated only as far as `index` — the receiving database of an
 * import, built at the schema its archive declares (D7, slice 2).
 *
 * Foreign keys start ON, as they do on the device: the import switches them
 * off itself for the fill, which is the behaviour worth exercising.
 */
export function openDatabaseAtMigration(index: number): TestDatabase {
  const raw = openEmptyDatabase();
  applyMigrationsUpTo(raw, index);
  const db = drizzle(raw, { schema });

  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

export function countRows(raw: Database.Database, table: string): number {
  const row = raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}
