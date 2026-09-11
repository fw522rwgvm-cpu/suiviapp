import { describe, expect, it } from 'vitest';
import bundle from '../../src/core/db/migrations/bundle.generated';
import {
  allSchemaTableNames,
  declaredValueRules,
  EXCLUDED_TABLES,
  exportedTables,
  isExcluded,
} from '../../src/features/backup/domain/table-catalog';

/**
 * The tests that make the export outlive this slice.
 *
 * D15 puts the round trip first by value, but the round trip only proves that
 * what the exporter knows about survives. It says nothing about what the
 * exporter has never heard of. The schema gains tables at slices 3, 5, 6, 8,
 * 10, 11 and 13, and an export that quietly leaves one out is discovered once,
 * on the day it is needed.
 *
 * So these are the assertions that fail on a future branch, before anyone has
 * had the chance to ship an incomplete safety net.
 */

describe('table catalog', () => {
  it('classifies every table of the schema — exported or explicitly excluded', () => {
    // THE LOAD-BEARING ASSERTION OF THE WHOLE SLICE.
    // When `food` arrives in slice 3, this fails until somebody decides.
    const exported = new Set(exportedTables().map((table) => table.name));
    const unclassified = allSchemaTableNames().filter(
      (name) => !exported.has(name) && !isExcluded(name),
    );

    expect(unclassified).toEqual([]);
  });

  it('carries the tables of slices 0 and 1, parents before children', () => {
    // The importer follows this order, never the file's key order.
    expect(exportedTables().map((table) => table.name)).toEqual([
      'setting',
      'day',
      'day_meal',
      'journal_entry',
    ]);
  });

  it('names the Open Food Facts cache as excluded before it exists', () => {
    // D7 and specs 5.4 exclude it because it is rebuildable. Deciding now is
    // what keeps slice 4 from having to rediscover the reasoning.
    expect(EXCLUDED_TABLES.map((exclusion) => exclusion.name)).toContain('off_cache');
    expect(isExcluded('off_cache')).toBe(true);
  });

  it('derives column names from the schema, in SQL spelling', () => {
    const journal = exportedTables().find((table) => table.name === 'journal_entry');
    const names = journal?.columns.map((column) => column.name) ?? [];

    // snake_case, not the camelCase of the Drizzle properties: the file is a
    // database artefact, and renaming a TypeScript property must stay a pure
    // refactor that invalidates no archive.
    expect(names).toContain('day_meal_id');
    expect(names).toContain('protein_100');
    expect(names).not.toContain('dayMealId');
  });

  it('reads nullability and storage class off the schema', () => {
    const journal = exportedTables().find((table) => table.name === 'journal_entry');
    const byName = new Map(journal?.columns.map((column) => [column.name, column]));

    expect(byName.get('name')?.notNull).toBe(true);
    expect(byName.get('brand')?.notNull).toBe(false);
    expect(byName.get('quantity')?.kind).toBe('real');
    expect(byName.get('created_at')?.kind).toBe('integer');
    expect(byName.get('kind')?.kind).toBe('text');
  });

  it('finds a primary key for every exported table', () => {
    // Ordering and duplicate detection both rest on it. A table arriving
    // without one is a decision to take, not a default to inherit.
    for (const table of exportedTables()) {
      expect(table.primaryKey.length).toBeGreaterThan(0);
    }
  });

  it('dates every table by a migration tag the binary actually carries', () => {
    // A tag nobody recognises would make the "is this archive older than that
    // table?" comparison fall through, and an old archive would start
    // importing tables it never carried as missing ones.
    const tags = new Set(bundle.journal.entries.map((entry) => entry.tag));

    for (const table of exportedTables()) {
      expect(tags.has(table.introducedIn)).toBe(true);
    }
  });

  it('refuses a value rule that names a column the schema no longer has', () => {
    // Rules may be incomplete — that only makes validation weaker. A stale
    // rule is different: it silently stops checking anything.
    const columns = new Map(
      exportedTables().map((table) => [
        table.name,
        new Set(table.columns.map((column) => column.name)),
      ]),
    );

    const stale = declaredValueRules().filter(
      ({ table, column }) => !columns.get(table)?.has(column),
    );

    expect(stale).toEqual([]);
  });

  it('constrains the columns SQL cannot constrain', () => {
    const journal = exportedTables().find((table) => table.name === 'journal_entry');
    const byName = new Map(journal?.columns.map((column) => [column.name, column]));

    expect(byName.get('date')?.value).toEqual({ rule: 'civil_date' });
    expect(byName.get('id')?.value).toEqual({ rule: 'entity_id' });
    expect(byName.get('base_unit')?.value).toEqual({
      rule: 'one_of',
      allowed: ['g', 'ml'],
    });
    // Not everything is constrained, and that is fine: a free-text name is
    // free text.
    expect(byName.get('name')?.value).toBeNull();
  });
});
