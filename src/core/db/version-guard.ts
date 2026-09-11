import type { SQLiteDatabase } from 'expo-sqlite';
import bundle from './migrations/bundle.generated';
import { compareVersions, type DatabaseVersion } from './version-rules';

/**
 * SQLite-facing half of the G3 guard. The rules it applies are in
 * version-rules.ts, which stays testable in Node.
 */

export const MIGRATIONS_TABLE = '__drizzle_migrations';

export type { DatabaseVersion };

export function journalTimestamps(): number[] {
  return bundle.journal.entries.map((entry) => entry.when);
}

function migrationsTableExists(database: SQLiteDatabase): boolean {
  const row = database.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    MIGRATIONS_TABLE,
  );
  return row !== null;
}

function readAppliedWhen(database: SQLiteDatabase): number | null {
  if (!migrationsTableExists(database)) {
    return null;
  }
  const row = database.getFirstSync<{ applied: number | null }>(
    `SELECT MAX(created_at) AS applied FROM ${MIGRATIONS_TABLE}`,
  );
  // An empty table reads as null, indistinguishable from a fresh database for
  // our purposes: there is nothing applied to be ahead of.
  return row?.applied ?? null;
}

export function checkDatabaseVersion(database: SQLiteDatabase): DatabaseVersion {
  return compareVersions(readAppliedWhen(database), journalTimestamps());
}
