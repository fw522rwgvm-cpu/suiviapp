import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The database handle the domain writes against.
 *
 * D15 asks for the access layer's invariants to be exercised "against a real
 * SQLite file in Node". A function that imports drizzle-orm/expo-sqlite cannot
 * be: expo-sqlite is a native module. So the write functions take their handle
 * as a parameter, typed on the ancestor the two drivers share.
 *
 * ExpoSQLiteDatabase and BetterSQLite3Database both extend
 * BaseSQLiteDatabase<'sync', TRunResult, TSchema> and differ only in
 * TRunResult, which widens to unknown here. The consequence to live with: the
 * result of .run() is unknown and must not be read. It never needs to be —
 * identifiers are minted by the application (D4), so lastInsertRowid is of no
 * use, and anything a write has to hand back comes from .returning().
 *
 * This module imports nothing native, which is the whole point: it is
 * importable from a Node test.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
