/**
 * Importing an archive older than the binary: restore at its schema, then
 * migrate forward.
 *
 * D7 does not settle this on its own. The alternative was to build the
 * receiving database straight at the current schema and drop the old rows in.
 * It is rejected, for three reasons:
 *
 *  - D6 states that each migration carries its data backfill in the same
 *    transaction. Building at the current schema throws that away: a column
 *    added in slice 5 with a computed backfill would land on its default
 *    instead of its computed value, silently.
 *  - Replaying migrations over a populated database is already the tested
 *    path — it is literally G4, and tests/migrations/replay-journal.test.ts
 *    exercises it on every run.
 *  - One migration logic in the project instead of two. On the only safety net
 *    there is, that is what counts.
 *
 * So the receiving database is built at the archive's schema tag, filled, and
 * then migrated through the remaining migrations exactly as a real database
 * would be at startup.
 *
 * This module is the pure half: slicing the journal. Applying the slices is
 * the caller's, because the migrator differs between expo-sqlite and
 * better-sqlite3 and neither belongs in a module that must import nothing
 * native.
 */

import type { MigrationBundle } from '@/core/db/migrations/bundle.generated';

/**
 * The migrations to apply BEFORE the rows go in: entries 0 through
 * schemaIndex, which is the schema the archive was written under.
 *
 * The bundle keeps its own shape so drizzle's migrate() takes it unchanged.
 * Entries are re-indexed from zero because the migrator reads idx as a
 * position in the list it was given, not as an identity.
 */
export function bundleUpTo(bundle: MigrationBundle, schemaIndex: number): MigrationBundle {
  const ordered = [...bundle.journal.entries].sort((a, b) => a.idx - b.idx);
  const kept = ordered.slice(0, schemaIndex + 1);

  return {
    journal: { ...bundle.journal, entries: kept.map((entry, idx) => ({ ...entry, idx })) },
    migrations: bundle.migrations,
  };
}

/**
 * The tags still to apply AFTER the rows are in, oldest first.
 *
 * Empty when the archive comes from this same binary, which is the ordinary
 * case and costs nothing.
 */
export function tagsAfter(bundle: MigrationBundle, schemaIndex: number): string[] {
  return [...bundle.journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .slice(schemaIndex + 1)
    .map((entry) => entry.tag);
}

/** Every tag the binary carries, oldest first. The binary's journal order. */
export function journalTags(bundle: MigrationBundle): string[] {
  return [...bundle.journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.tag);
}
