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
import { getTableConfig, SQLiteTable, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  day,
  dayMeal,
  dayTemplate,
  dayTemplateMeal,
  food,
  foodPortion,
  journalEntry,
  planningOverride,
  planningWeekday,
  recipe,
  recipeIngredient,
  recipeStep,
  recipeTag,
  setting,
  PORTION_NAMES,
  YIELD_TYPES,
} from '@/core/db/schema';
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
  /**
   * Whether SQLite fills this column on its own.
   *
   * Read by the validator, not by the exporter: SQLite cannot ALTER TABLE ADD
   * COLUMN a NOT NULL column without a default, so "NOT NULL and no default"
   * is exactly the set of columns an old archive cannot legitimately be
   * missing. The database's own rule does the reasoning.
   */
  hasDefault: boolean;
  /**
   * Whether this column is PART OF the primary key — single or composite.
   *
   * Composite keys are the reason this is not simply Drizzle's column.primary.
   * A key declared with primaryKey({ columns: [...] }) leaves that flag FALSE
   * on every column and lives on the table instead, so reading the column
   * alone reported recipe_tag as having no key at all. That failed the
   * coverage test loudly and would have dropped this table's ORDER BY
   * silently, which is the half that matters: two exports of the same data
   * would have stopped being the same file.
   */
  isPrimaryKey: boolean;
  value: ValueRule | null;
  /**
   * The Drizzle column itself.
   *
   * Carried so the exporter can build a projection keyed by SQL name —
   * db.select({ day_meal_id: journalEntry.dayMealId }) — and get rows already
   * spelled the way the file spells them. Without it there would be a second
   * camelCase-to-snake_case mapping somewhere, free to disagree with this one.
   */
  column: SQLiteColumn;
}

export interface ExportedTable {
  /** SQL table name — the key used in the file. */
  name: string;
  /** The Drizzle table, to select from and to insert into. */
  table: SQLiteTable;
  /**
   * Migration tag that created this table.
   *
   * This is what lets an old archive be read without inventing tables it could
   * not possibly have carried. An archive written at 0001_journal has no
   * `food` key, and that is not a corrupt file — `food` did not exist. Without
   * this field the importer would have to choose between refusing every old
   * archive and accepting a truncated one in silence, and the second is how a
   * safety net turns into a trap.
   */
  introducedIn: string;
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
const EXPORT_ORDER: readonly { table: SQLiteTable; introducedIn: string }[] = [
  { table: setting, introducedIn: '0000_initial_setting' },
  /**
   * The planning block sits here, between the settings and the reference data,
   * so the order reads top-down as configuration, then reference data, then
   * journal. day_template leads it because the other three reference it.
   *
   * The order is documentation rather than mechanism during the fill —
   * foreign keys are switched off for it, since journal_entry references
   * itself and no ordering of rows could satisfy that. It becomes mechanism
   * again at barrier 3, where foreign_key_check runs with them back on.
   */
  { table: dayTemplate, introducedIn: '0004_templates_planning' },
  { table: dayTemplateMeal, introducedIn: '0004_templates_planning' },
  { table: planningWeekday, introducedIn: '0004_templates_planning' },
  { table: planningOverride, introducedIn: '0004_templates_planning' },
  { table: food, introducedIn: '0002_food' },
  { table: foodPortion, introducedIn: '0002_food' },
  /**
   * Recipes sit AFTER the foods and before the journal, because that is the
   * only position the dependencies allow: recipe_ingredient.food_id carries a
   * real foreign key to food, so food must land first, and nothing in the
   * journal block references a recipe by key — source_recipe_id is
   * informative, without a live link.
   *
   * recipe leads its own block, the other three referencing it, exactly as
   * day_template leads the planning block.
   */
  { table: recipe, introducedIn: '0005_recipes' },
  { table: recipeTag, introducedIn: '0005_recipes' },
  { table: recipeStep, introducedIn: '0005_recipes' },
  { table: recipeIngredient, introducedIn: '0005_recipes' },
  { table: day, introducedIn: '0001_journal' },
  { table: dayMeal, introducedIn: '0001_journal' },
  { table: journalEntry, introducedIn: '0001_journal' },
];

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
      '(D7, specs 5.4). Declared here in slice 2, before the table existed; ' +
      'the table landed in 0003 and the decision held without being retaken.',
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
  food: {
    id: { rule: 'entity_id' },
    source: { rule: 'one_of', allowed: ['perso', 'off'] },
    base_unit: { rule: 'one_of', allowed: ['g', 'ml'] },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
  food_portion: {
    id: { rule: 'entity_id' },
    food_id: { rule: 'entity_id' },
    /**
     * THE CLOSED LIST OF SPECS 6.1, ENFORCED HERE RATHER THAN AS A CHECK.
     *
     * food_portion.name deliberately carries no CHECK: eight French display
     * words are the likeliest thing in this schema to move, and SQLite cannot
     * widen a CHECK without rebuilding the table. Widening the vocabulary
     * breaks no invariant — unlike journal_entry.kind, whose closed set is
     * what makes the clause-free macro SUM correct.
     *
     * So the constraint lives where it can name a table, a row index and a
     * column instead of citing a constraint — and that is the stronger barrier
     * here, not the weaker one, since D7 wants a file repairable by hand.
     */
    name: { rule: 'one_of', allowed: PORTION_NAMES },
  },
  day_template: {
    id: { rule: 'entity_id' },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
  day_template_meal: {
    id: { rule: 'entity_id' },
    template_id: { rule: 'entity_id' },
  },
  /**
   * weekday carries NO rule, and that is the CHECK doing its job rather than
   * an omission. The one_of rule takes strings, and this column is an integer;
   * ck_planning_weekday constrains it in SQL instead, which it can afford to
   * because a week will never have an eighth day.
   */
  planning_weekday: {
    template_id: { rule: 'entity_id' },
  },
  planning_override: {
    date: { rule: 'civil_date' },
    template_id: { rule: 'entity_id' },
  },
  recipe: {
    id: { rule: 'entity_id' },
    /**
     * The closed set of YIELD_TYPES, named from the schema rather than
     * respelled — the shape PORTION_NAMES set in slice 3.
     *
     * Unlike food_portion.name this one ALSO carries a CHECK, and the two
     * barriers answer different questions. The CHECK exists because widening
     * this set breaks a calculation rather than a label; the rule exists
     * because D7 wants a hand-repaired file to be told the table, the row and
     * the column instead of being handed a constraint name.
     */
    yield_type: { rule: 'one_of', allowed: YIELD_TYPES },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
  recipe_tag: {
    recipe_id: { rule: 'entity_id' },
    /**
     * `tag` carries no rule, and there is none to give: specs 8.6 states no
     * vocabulary because the whole point of a tag is that the user invents it.
     * This is food_portion.name's argument with nothing left to weigh.
     */
  },
  recipe_step: {
    id: { rule: 'entity_id' },
    recipe_id: { rule: 'entity_id' },
  },
  recipe_ingredient: {
    id: { rule: 'entity_id' },
    recipe_id: { rule: 'entity_id' },
    food_id: { rule: 'entity_id' },
    unit: { rule: 'one_of', allowed: ['g', 'ml'] },
    frozen_base_unit: { rule: 'one_of', allowed: ['g', 'ml'] },
    frozen_at: { rule: 'epoch_ms' },
    /**
     * WHAT NO RULE HERE CAN EXPRESS, stated so the gap is deliberate rather
     * than forgotten: that food_id and the frozen columns are exclusive
     * (D5/R3). Rules are per-column, and this one spans two. ck_ingredient_link
     * carries it in SQL instead — the one place in this schema where the CHECK
     * is the only barrier available and therefore the stronger one.
     */
  },
  day: {
    date: { rule: 'civil_date' },
    /**
     * Declarable only now that DayTemplateId exists, and strictly stronger
     * than before. It stays a rule rather than becoming a foreign key: the
     * column is informative, without a live link, so that deleting a template
     * leaves every materialised day intact (specs 5.2, 8.1).
     */
    template_id_snapshot: { rule: 'entity_id' },
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
    /**
     * Declarable only now that FoodId exists, and strictly stronger than
     * before: nothing in the application has ever written anything but a ULID
     * here, so no archive can hold anything else legitimately.
     *
     * It stays a rule rather than becoming a foreign key: the column is
     * informative, without a live link, so that deleting a consumed food
     * leaves past entries intact (specs 5.3).
     */
    source_food_id: { rule: 'entity_id' },
    /**
     * Declarable only now that RecipeId exists, and strictly stronger than
     * before — the third time this exact pattern runs, after source_food_id in
     * slice 3 and template_id_snapshot in slice 5.
     *
     * It stays a rule rather than becoming a foreign key: the column is
     * informative, without a live link, so that deleting a recipe leaves every
     * grouped block that came from it intact (specs 5.2, 5.3).
     */
    source_recipe_id: { rule: 'entity_id' },
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

/**
 * The SQL names making up a table's primary key, single or composite.
 *
 * Drizzle states the two forms in two places and neither knows about the
 * other: a single-column key sets column.primary, and a composite one lands in
 * getTableConfig().primaryKeys with column.primary left false throughout.
 * Reading only the first is what made recipe_tag look keyless.
 */
function primaryKeyNames(table: SQLiteTable): Set<string> {
  const names = new Set<string>();

  for (const column of Object.values(getTableColumns(table))) {
    if (column.primary) names.add(column.name);
  }
  for (const key of getTableConfig(table).primaryKeys) {
    for (const column of key.columns) names.add(column.name);
  }

  return names;
}

function describe(entry: { table: SQLiteTable; introducedIn: string }): ExportedTable {
  const { table, introducedIn } = entry;
  const name = getTableName(table);
  const rules = VALUE_RULES[name] ?? {};
  const keyColumns = primaryKeyNames(table);

  const columns: ExportColumn[] = Object.entries(getTableColumns(table)).map(
    ([property, column]) => ({
      name: column.name,
      property,
      kind: toKind(column.columnType),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      isPrimaryKey: keyColumns.has(column.name),
      value: rules[column.name] ?? null,
      column,
    }),
  );

  return {
    name,
    table,
    introducedIn,
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
