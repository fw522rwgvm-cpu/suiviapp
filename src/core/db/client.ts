import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'suivi.db';

/**
 * Single write connection (D2). Holding one module-level instance is what makes
 * "one writer" a property of the process rather than a convention every caller
 * has to remember.
 */
let instance: SQLiteDatabase | null = null;

/**
 * Normative pragmas (D2).
 *
 * WAL so reads never block writes and a committed transaction survives the
 * process dying. synchronous=NORMAL because under WAL it only loses committed
 * transactions on a system crash, not on a forced quit of the app, and the
 * forced quit is the threat here: the SideStore certificate expires weekly.
 * foreign_keys is per-connection and off by default in SQLite, so it has to be
 * set on every open or the freezing rules of D5 rest on links SQLite does not
 * actually enforce.
 */
function applyPragmas(database: SQLiteDatabase): void {
  database.execSync('PRAGMA journal_mode = WAL;');
  database.execSync('PRAGMA synchronous = NORMAL;');
  database.execSync('PRAGMA foreign_keys = ON;');
}

export function openDatabase(): SQLiteDatabase {
  if (instance === null) {
    instance = openDatabaseSync(DATABASE_NAME);
    applyPragmas(instance);
  }
  return instance;
}

/**
 * Consolidates the write-ahead log into the main file. Without this, copying
 * the database file yields an incomplete copy: the most recent transactions
 * still live in the -wal sidecar. TRUNCATE empties the log afterwards, so the
 * single .db file is self-sufficient (D2, D6/G1).
 */
export function checkpoint(database: SQLiteDatabase): void {
  database.execSync('PRAGMA wal_checkpoint(TRUNCATE);');
}

export function getDatabaseFilePath(database: SQLiteDatabase): string {
  return database.databasePath;
}

export function createDrizzle(database: SQLiteDatabase) {
  return drizzle(database, { schema });
}

export type Drizzle = ReturnType<typeof createDrizzle>;
