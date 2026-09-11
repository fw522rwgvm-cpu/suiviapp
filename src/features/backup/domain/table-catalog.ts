/**
 * What the export carries, derived from the schema rather than restated (D7).
 *
 * THIS IS THE MODULE THAT MAKES THE SLICE AGE CORRECTLY.
 *
 * The schema gains tables at slices 3, 5, 6, 8, 10, 11 and 13. Every one of
 * them is a chance to ship an export that silently leaves something out — and
 * an incomplete safety net is discovered exactly once, on the day it is
 * needed. So nothing here is a hand-written list of columns. The columns come
 * from the Drizzle table objects, which are the same objects the migrations
 * are generated from, and a table that is neither exported nor explicitly
 * excluded fails the build (see tests/backup/table-catalog.test.ts).
 *
 * The one thing that cannot be derived is the domain constraints SQL does not
 * carry: that a TEXT column holds a civil date, or a ULID, or one of a closed
 * set. Those are declared below. They can be incomplete — which only ever
 * makes validation weaker, never wrong — and a test refuses any rule naming a
 * column that no longer exists, so a rename breaks the build instead of
 * quietly disabling a check.
 *
 * __drizzle_migrations is absent without being excluded, because it is not in
 * the schema: the migrator creates it. That is correct — the receiving
 * database mints its own bookkeeping, and importing someone else's would make
 * the archive's schema version outrank the binary's.
 */

import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { day, dayMeal, journalEntry, setting } from '@/core/db/schema';
import * as schema from '@/core/db/schema';

/** SQLite storage classes this schema uses. No BLOB, and never will be. */
export type ColumnKind = 'text' | 'integer' | 'real';

/** A constraint the column type does not express. Declared, not derived. */
export type ValueRule =
  | { rule: 'civil_date' }
  | { rule: 'entity_id' }
  | { rule: 'epoch_ms' }
  | { rule: 'one_of'; allowed: readonly string[] };

export interface ExportColumn {
  /** SQL column name — the key used in the file (snake_case). */
  name: string;
  /** Drizzle property name (camelCase). Kept for readable diagnostics. */
  property: string;
  kind: ColumnKind;
  notNull: boolean;
  isPrimaryKey: boolean;
  value: ValueRule | null;
}

export interface ExportedTable {
  /** SQL table name — the key used in the file. */
  name: string;
  columns: readonly ExportColumn[];
  /** SQL names of the primary key columns. Used to order and to deduplicate. */
  primaryKey: readonly string[];
}

export interface TableExclusion {
  name: string;
  reason: string;
}

/**
 * Insertion order: parents before children.
 *
 * The importer follows THIS order, never the key order of the file it is
 * reading. A file whose keys someone reordered by hand must still import —
 * D7 refuses compression precisely so that hand editing stays possible.
 *
 * journal_entry references itself through parent_entry_id, so no ordering of
 * tables can satisfy every row. Foreign keys are therefore switched off during
 * the fill and checked afterwards, which is the procedure D6 already prescribes
 * for table rebuilds.
 */
const EXPORT_ORDER = [setting, day, dayMeal, journalEntry] as const;

/**
 * Tables deliberately left out of the export, each with its reason (D7).
 *
 * Named rather than omitted. Without this list, forgetting to export a table
 * added in slice 8 would be indistinguishable from having decided not to.
 *
 * Entries may name a table that does not exist yet: the decision is taken
 * once, here, and applies the day the table lands.
 */
export const EXCLUDED_TABLES: readonly TableExclusion[] = [
  {
    name: 'off_cache',
    reason:
      'Open Food Facts cache, entirely rebuildable from the network ' +
      '(D7, specs 5.4). Arrives with slice 4.',
  },
];

/**
 * Domain constraints SQL does not carry.
 *
 * Keyed by SQL table name, then SQL column name. The CHECK constraints on
 * journal_entry.kind and base_unit would catch two of these at INSERT time,
 * but with a SQLite error instead of a line number — and specs 5.4 wants a
 * file that can be repaired by hand.
 */
const VALUE_RULES: Record<string, Record<string, ValueRule>> = {
  day: {
    date: { rule: 'civil_date' },
    materialized_at: { rule: 'epoch_ms' },
  },
  day_meal: {
    id: { rule: 'entity_id' },
    date: { rule: 'civil_date' },
  },
  journal_entry: {
    id: { rule: 'entity_id' },
    day_meal_id: { rule: 'entity_id' },
    date: { rule: 'civil_date' },
    parent_entry_id: { rule: 'entity_id' },
    kind: { rule: 'one_of', allowed: ['food', 'recipe', 'recipe_item', 'free'] },
    base_unit: { rule: 'one_of', allowed: ['g', 'ml'] },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
};

function toKind(columnType: string): ColumnKind {
  switch (columnType) {
    case 'SQLiteInteger':
      return 'integer';
    case 'SQLiteReal':
      return 'real';
    default:
      // Every other SQLite column type in Drizzle stores as TEXT here. A
      // column type this schema does not use would land here and be treated
      // as text, which the round-trip test would catch immediately.
      return 'text';
  }
}

function describe(table: SQLiteTable): ExportedTable {
  const name = getTableName(table);
  const rules = VALUE_RULES[name] ?? {};

  const columns: ExportColumn[] = Object.entries(getTableColumns(table)).map(
    ([property, column]) => ({
      name: column.name,
      property,
      kind: toKind(column.columnType),
      notNull: column.notNull,
      isPrimaryKey: column.primary,
      value: rules[column.name] ?? null,
    }),
  );

  return {
    name,
    columns,
    primaryKey: columns.filter((column) => column.isPrimaryKey).map((column) => column.name),
  };
}

/** The tables the export carries, in insertion order. */
export function exportedTables(): readonly ExportedTable[] {
  return EXPORT_ORDER.map(describe);
}

/** Every table the schema declares, whatever its fate. For the coverage test. */
export function allSchemaTableNames(): readonly string[] {
  const names: string[] = [];
  // Widened to unknown on purpose: Object.values gives a union of the precise
  // table types, and a type predicate narrowing to the general SQLiteTable is
  // not assignable to it. `is` does the narrowing here, which is exactly what
  // it is for — and the alternative would be an assertion, which conventions
  // section 4 rules out.
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, SQLiteTable)) {
      names.push(getTableName(value));
    }
  }
  return names.sort();
}

export function isExcluded(tableName: string): boolean {
  return EXCLUDED_TABLES.some((exclusion) => exclusion.name === tableName);
}

/** Rules declared for columns, for the test that refuses a stale rule. */
export function declaredValueRules(): readonly { table: string; column: string }[] {
  return Object.entries(VALUE_RULES).flatMap(([table, columns]) =>
    Object.keys(columns).map((column) => ({ table, column })),
  );
}
