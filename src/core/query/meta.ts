import { getTableName, type Table } from 'drizzle-orm';

/**
 * How a query declares what it reads (D8).
 *
 * The dependency is written next to the SQL, in the query itself, because that
 * is where the knowledge actually is. The change bus then invalidates by
 * predicate and no list is maintained anywhere.
 *
 * Table names come from the schema objects rather than from strings, so
 * renaming a table moves the declaration with it instead of leaving a string
 * that silently matches nothing.
 */
export interface ReadsFromMeta extends Record<string, unknown> {
  tables: string[];
}

export function readsFrom(...tables: Table[]): ReadsFromMeta {
  return { tables: tables.map(getTableName) };
}
