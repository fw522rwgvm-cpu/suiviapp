import { createDrizzle, openDatabase } from './client';
import type { AppDatabase } from './database';

/**
 * The application's single database handle.
 *
 * One connection, one writer (D2). The domain functions take their handle as a
 * parameter so they can be run against a test database; this is where the real
 * one comes from, and it is the only thing that knows about expo-sqlite on the
 * read and write paths.
 *
 * Only reachable below the database gate, where the startup sequence has
 * already opened, checked and migrated (D6).
 */
let instance: AppDatabase | null = null;

export function getAppDatabase(): AppDatabase {
  if (instance === null) {
    instance = createDrizzle(openDatabase());
  }
  return instance;
}
