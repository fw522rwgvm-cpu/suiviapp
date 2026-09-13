import { describe, expect, it } from 'vitest';
import bundle from '../../src/core/db/migrations/bundle.generated';
import { PORTION_NAMES } from '../../src/core/db/schema';
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

  it('carries the tables of slices 0 to 3, parents before children', () => {
    // The importer follows this order, never the file's key order.
    expect(exportedTables().map((table) => table.name)).toEqual([
      'setting',
      'food',
      'food_portion',
      'day',
      'day_meal',
      'journal_entry',
    ]);
  });

  it('dates the food tables to 0002, which is what makes a slice-2 archive readable', () => {
    // An archive written by slice 2 declares schemaVersion '0001_journal' and
    // carries no `food` key at all. That is not corruption — the table did not
    // exist — and this field is the whole of how the importer knows.
    //
    // The comparison in validate-payload.ts is on JOURNAL POSITION: a table is
    // only required when it was introduced at or before the archive's schema.
    // food sits at index 2, the archive at index 1, so its absence passes and
    // the table arrives empty, created afterwards by 0002 itself.
    const byName = new Map(exportedTables().map((table) => [table.name, table]));
    expect(byName.get('food')?.introducedIn).toBe('0002_food');
    expect(byName.get('food_portion')?.introducedIn).toBe('0002_food');
    expect(byName.get('journal_entry')?.introducedIn).toBe('0001_journal');
  });

  it('constrains the origin to the schema spelling, not the specs spelling', () => {
    // Schema 2.2 writes 'off'; specs 6.1 writes 'openfoodfacts'. Section 6 of
    // the specs opens by declaring itself non-normative on the data model, so
    // 2.2 governs — and this is the assertion that keeps the decision from
    // being quietly re-taken by whoever next reads 6.1.
    const byName = new Map(
      exportedTables()
        .find((table) => table.name === 'food')
        ?.columns.map((column) => [column.name, column]),
    );

    expect(byName.get('source')?.value).toEqual({
      rule: 'one_of',
      allowed: ['perso', 'off'],
    });
  });

  it('enforces the closed portion list where SQL deliberately does not', () => {
    // food_portion.name carries no CHECK, on purpose: widening the vocabulary
    // breaks no invariant, and SQLite cannot widen a CHECK without rebuilding
    // the table. The list is enforced here instead, where a violation names a
    // row rather than a constraint.
    const portions = exportedTables().find((table) => table.name === 'food_portion');
    const rule = portions?.columns.find((column) => column.name === 'name')?.value;

    expect(rule).toEqual({ rule: 'one_of', allowed: PORTION_NAMES });
    // The eight of specs 6.1, no more and no fewer.
    expect(PORTION_NAMES).toHaveLength(8);
    expect(PORTION_NAMES).toContain('cuillère à soupe');
  });

  it('excludes the Open Food Facts cache, now that the table actually exists', () => {
    // D7 and specs 5.4 exclude it because it is rebuildable. The decision was
    // taken in slice 2, before the table existed, so that slice 4 would not
    // have to rediscover the reasoning — and it did not.
    expect(EXCLUDED_TABLES.map((exclusion) => exclusion.name)).toContain('off_cache');
    expect(isExcluded('off_cache')).toBe(true);

    // THE ASSERTION THAT KEEPS THE ONE ABOVE HONEST. Until 0003 the exclusion
    // was true of nothing: "classifies every table" passed because off_cache
    // was not in the schema at all, not because it was excluded. Naming it in
    // the schema list is what makes the exclusion load-bearing, and what would
    // fail if someone deleted the table and left the exclusion behind.
    expect(allSchemaTableNames()).toContain('off_cache');
    expect(exportedTables().map((table) => table.name)).not.toContain('off_cache');
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
