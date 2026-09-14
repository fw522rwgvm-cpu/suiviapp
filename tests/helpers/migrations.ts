import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Node-side reader for the generated migrations (D6/G4).
 *
 * At runtime the application cannot read these files: React Native has no
 * filesystem, so it consumes the bundled migrations.js instead. Tests, running
 * in Node against a real SQLite file, read the same .sql from disk. Both paths
 * therefore replay byte-identical statements.
 */

export const MIGRATIONS_DIR = join(process.cwd(), 'src/core/db/migrations');

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Journal {
  entries: JournalEntry[];
}

export function readJournal(): JournalEntry[] {
  const raw = readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8');
  const journal = JSON.parse(raw) as Journal;
  // Order is the whole point: a migration set is a sequence, not a set.
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

export function readMigrationSql(tag: string): string {
  return readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
}

/**
 * Applies one migration. drizzle separates statements with an explicit
 * breakpoint marker rather than on semicolons, because a semicolon inside a
 * trigger body would otherwise split a statement in half.
 */
export function applyMigration(db: Database.Database, sql: string): void {
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  // Each migration carries its data backfill in the same transaction (D6),
  // so a forced quit mid-migration leaves the database as it was before.
  const run = db.transaction(() => {
    for (const statement of statements) {
      db.exec(statement);
    }
  });
  run();
}

export function applyAllMigrations(db: Database.Database): string[] {
  const applied: string[] = [];
  for (const entry of readJournal()) {
    applyMigration(db, readMigrationSql(entry.tag));
    applied.push(entry.tag);
  }
  return applied;
}

/**
 * Applies migrations 0 through `index` inclusive — the schema an archive
 * written at that tag was produced under (D7, slice 2).
 *
 * The device does this with drizzle's expo migrator over a sliced bundle; here
 * the .sql are read from disk. Both replay byte-identical statements, which is
 * the property the whole "restore then migrate" decision rests on.
 */
export function applyMigrationsUpTo(db: Database.Database, index: number): string[] {
  const applied: string[] = [];
  for (const entry of readJournal().slice(0, index + 1)) {
    applyMigration(db, readMigrationSql(entry.tag));
    applied.push(entry.tag);
  }
  return applied;
}

/**
 * The journal position of a tag, so a test can name the migration it is about
 * instead of counting.
 *
 * A literal index would be right until the day a migration is inserted before
 * it, and then wrong everywhere at once — silently, since every index would
 * still resolve to a migration that exists.
 */
export function indexOfTag(tag: string): number {
  const index = readJournal().findIndex((entry) => entry.tag === tag);
  if (index === -1) throw new Error(`No migration tagged ${tag} in the journal.`);
  return index;
}

/**
 * Applies exactly ONE named migration, and nothing else.
 *
 * The primitive for "what does this migration create?". applyMigrationsAfter
 * cannot answer that question — it is unbounded above, so it silently starts
 * including the next migration the day one is added. Slice 5 asked it that
 * question anyway and slice 6 collected the bill: `0005` made "0004 adds the
 * four tables and nothing else" fail by adding four tables of its own.
 */
export function applyOneMigration(db: Database.Database, tag: string): void {
  applyMigration(db, readMigrationSql(tag));
}

/** Applies everything after `index`, over a database that already holds rows. */
export function applyMigrationsAfter(db: Database.Database, index: number): string[] {
  const applied: string[] = [];
  for (const entry of readJournal().slice(index + 1)) {
    applyMigration(db, readMigrationSql(entry.tag));
    applied.push(entry.tag);
  }
  return applied;
}

export function openEmptyDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

export function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

export function columnNames(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name).sort();
}
