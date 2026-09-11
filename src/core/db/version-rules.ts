/**
 * Version comparison rules (D6/G3) — pure, and importing nothing.
 *
 * Kept free of expo-sqlite and of the generated migrations bundle on purpose:
 * D15 wants these rules exercised in Node, and a module that reaches for a
 * native binding cannot be. The SQLite-facing wrapper lives in version-guard.ts.
 */

export type DatabaseVersion =
  /** No migrations table: a brand new database, nothing to lose. */
  | { status: 'fresh'; pending: number }
  /** Existing database, migrations to apply. A backup is due first (G1). */
  | { status: 'pending'; pending: number }
  | { status: 'up_to_date' }
  /** Written by a newer binary. Refuse, and say where the backup is (G3). */
  | { status: 'too_recent'; databaseWhen: number; binaryWhen: number };

/**
 * Drizzle keeps its bookkeeping in __drizzle_migrations(hash, created_at). With
 * the expo driver the hash is always the empty string, so created_at is the only
 * usable marker: it holds the `when` timestamp of the journal entry applied.
 * Comparing the highest applied `when` with the highest the binary carries
 * therefore answers the question exactly.
 *
 * Drizzle's own migrator makes no such comparison. Faced with a database
 * migrated by a newer binary it applies nothing and reports success, after which
 * an older binary writes into newer tables and nothing crashes at the time.
 *
 * @param appliedWhen highest created_at in the migrations table, or null when
 *   the table does not exist yet.
 * @param knownWhen every `when` the binary carries, in any order.
 */
export function compareVersions(
  appliedWhen: number | null,
  knownWhen: readonly number[],
): DatabaseVersion {
  const binaryWhen = knownWhen.length === 0 ? 0 : Math.max(...knownWhen);

  if (appliedWhen === null) {
    return { status: 'fresh', pending: knownWhen.length };
  }

  if (appliedWhen > binaryWhen) {
    return { status: 'too_recent', databaseWhen: appliedWhen, binaryWhen };
  }

  const pending = knownWhen.filter((when) => when > appliedWhen).length;
  return pending === 0 ? { status: 'up_to_date' } : { status: 'pending', pending };
}
