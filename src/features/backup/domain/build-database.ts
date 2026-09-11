/**
 * Filling the receiving database, and barrier three of D7.
 *
 * > Import mechanics: build alongside, validate, switch at the end. Never
 * > erase first. A fresh database is built in a temporary file, validated
 * > completely, and only the final switch replaces the current database.
 *
 * This module is the "build alongside" and the last of the three barriers. It
 * knows nothing about files, about expo-sqlite, or about which database it is
 * handed: it takes an AppDatabase like every access function since slice 1, so
 * the whole of it runs in Node against a real SQLite file (D15).
 *
 * What it is NOT is the switch. The switch is native, it is in swap.ts, and it
 * is the one part of this slice no test can reach.
 */

import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { dayMeal, journalEntry } from '@/core/db/schema';
import type { ExportRow } from './envelope-types';
import { accept, type ImportProblem, type Verdict } from './problems';
import { exportedTables, type ExportedTable } from './table-catalog';
import type { ValidatedPayload } from './validate-payload';

/**
 * Variables per INSERT statement.
 *
 * SQLITE_MAX_VARIABLE_NUMBER is 32766 on current SQLite and 999 on older
 * builds. Two drivers and two platforms are involved here, and the failure
 * mode of getting it wrong is an import that works on the whole history of
 * one device and fails on another. 900 is below every version's floor, and
 * the extra statements cost milliseconds on a job that runs twice a year.
 */
const VARIABLE_BUDGET = 900;

export interface BuildReport {
  /** Rows written, by SQL table name. Shown after the import. */
  written: Record<string, number>;
  total: number;
}

function chunkSize(columnCount: number): number {
  return Math.max(1, Math.floor(VARIABLE_BUDGET / Math.max(1, columnCount)));
}

/**
 * Turns rows keyed by SQL name into rows keyed by Drizzle property.
 *
 * The file speaks SQL (snake_case), Drizzle's insert builder speaks TypeScript
 * (camelCase), and the catalogue holds both spellings for the same column —
 * which is precisely why the translation happens here and exists nowhere else.
 *
 * A column absent from the row is left out of the object entirely rather than
 * set to null, so SQLite applies its default. That is what makes an archive
 * older than the binary land correctly on a column added since.
 */
function toInsertValues(
  descriptor: ExportedTable,
  rows: readonly ExportRow[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const values: Record<string, unknown> = {};
    for (const column of descriptor.columns) {
      if (Object.prototype.hasOwnProperty.call(row, column.name)) {
        values[column.property] = row[column.name];
      }
    }
    return values;
  });
}

/**
 * Extra invariants the foreign keys do not express.
 *
 * journal_entry.date is denormalised — schema 2.3 keeps it so the statistics
 * of slice 7 stay index-only — and a denormalised column is a column that can
 * disagree with its source without anything complaining. On an archive edited
 * by hand, which D7 expects, it is exactly the kind of mistake that makes a
 * day's totals silently wrong.
 */
function checkDenormalisedDates(db: AppDatabase): ImportProblem | null {
  const rows = db
    .select({ mismatches: sql<number>`count(*)` })
    .from(journalEntry)
    .innerJoin(dayMeal, eq(dayMeal.id, journalEntry.dayMealId))
    .where(sql`${journalEntry.date} <> ${dayMeal.date}`)
    .all();

  const count = rows[0]?.mismatches ?? 0;
  return count > 0 ? { code: 'denormalised_date_mismatch', count } : null;
}

/**
 * Fills a receiving database with a validated payload, then checks it.
 *
 * The database handed in must already be migrated to the schema the archive
 * declares. Migrating it, before and after, is the caller's job: on the device
 * that is drizzle's expo migrator with a sliced bundle, in Node it is the test
 * helper replaying the .sql from disk. Neither belongs in a module that has to
 * stay free of native imports.
 *
 * Foreign keys are switched OFF for the fill and checked afterwards. Two
 * reasons, and the first is not optional: journal_entry references itself
 * through parent_entry_id, so no ordering of tables or of rows can satisfy
 * every row as it goes in. The second is that this is already the procedure
 * D6 prescribes for table rebuilds, so it is a reflex the project has.
 *
 * PRAGMA foreign_keys is SILENTLY IGNORED inside a transaction — SQLite
 * documents this and does not raise — which is why the toggling brackets the
 * transaction instead of living inside it. Getting that backwards would leave
 * the constraints on during the fill and the import would fail on the first
 * child row, with an error naming a constraint rather than the real problem.
 */
export function buildDatabase(
  db: AppDatabase,
  payload: ValidatedPayload,
): Verdict<BuildReport> {
  const catalogue = exportedTables();

  db.run(sql.raw('PRAGMA foreign_keys = OFF'));

  try {
    db.transaction((tx) => {
      for (const descriptor of catalogue) {
        const rows = payload.rows[descriptor.name] ?? [];
        if (rows.length === 0) continue;

        const values = toInsertValues(descriptor, rows);
        const size = chunkSize(descriptor.columns.length);

        for (let start = 0; start < values.length; start += size) {
          tx.insert(descriptor.table).values(values.slice(start, start + size)).run();
        }
      }
    });
  } finally {
    // Restored whatever happened. A receiving database left with its foreign
    // keys off would enforce nothing for the rest of its life, and this one is
    // about to become the application's database.
    db.run(sql.raw('PRAGMA foreign_keys = ON'));
  }

  // Barrier three, once every row is in place. Asking earlier would only
  // report the rows whose parent had not been written yet.
  const problems: ImportProblem[] = [];

  for (const descriptor of catalogue) {
    // Per table, and only the row count is read: the shape of a PRAGMA result
    // differs between drivers, its length does not.
    const violations = db.all(
      sql.raw(`PRAGMA foreign_key_check(${descriptor.name})`),
    );
    if (violations.length > 0) {
      problems.push({
        code: 'foreign_key_violated',
        table: descriptor.name,
        count: violations.length,
      });
    }
  }

  const denormalised = checkDenormalisedDates(db);
  if (denormalised !== null) {
    problems.push(denormalised);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const written: Record<string, number> = {};
  let total = 0;
  for (const descriptor of catalogue) {
    const count = payload.rows[descriptor.name]?.length ?? 0;
    written[descriptor.name] = count;
    total += count;
  }

  return accept({ written, total });
}
