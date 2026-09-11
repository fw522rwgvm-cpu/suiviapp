import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import type { LocalDate } from '@/core/date';
import type { EntityId } from '@/core/id';

/**
 * Days, meals and journal entries (schema 2.3).
 *
 * Only what slice 1 uses. Day templates, planning, foods and recipes arrive
 * with slices 5, 3 and 6: creating their tables now would be a layer built
 * "for later", which section 7 rules out.
 */

export type DayMealId = EntityId<'day_meal'>;
export type JournalEntryId = EntityId<'journal_entry'>;

/** Base units are watertight: no conversion, no density (specs 5.1). */
export type BaseUnit = 'g' | 'ml';

/**
 * 'recipe' is the empty parent of a grouped block; 'recipe_item' are the
 * ingredient lines that carry everything (D5/R2). Neither exists before
 * slice 6, but the column shape does, because widening it later would mean
 * rebuilding the table.
 */
export type JournalEntryKind = 'food' | 'recipe' | 'recipe_item' | 'free';

/**
 * A day exists only once materialised (specs 8.2). Its absence is meaningful:
 * it is the difference between a day nobody touched and a day emptied on
 * purpose, and browsing three months of history must never create one.
 *
 * Both snapshot columns stay NULL until slice 5, when templates exist. That
 * they are nullable is what lets slice 1 ship without a schema change later.
 *
 * No created_at / updated_at here: section 2.3 spells this table's columns out
 * explicitly, and materialized_at is the creation stamp.
 */
export const day = sqliteTable('day', {
  date: text('date').$type<LocalDate>().primaryKey(),
  /** Informative, no live link: a template can be edited or deleted freely. */
  templateIdSnapshot: text('template_id_snapshot'),
  templateNameSnapshot: text('template_name_snapshot'),
  materializedAt: integer('materialized_at').notNull(),
});

/**
 * Meals copied onto the day at materialisation (D5/R4).
 *
 * Targets are per-meal; the day's targets are their sum and are never stored
 * (specs 8.1, D9). They stay NULL until slice 5.
 *
 * No unique constraint on (date, position), following section 2.3: reordering
 * meals under one would need a temporary slot to shuffle through.
 */
export const dayMeal = sqliteTable(
  'day_meal',
  {
    id: text('id').$type<DayMealId>().primaryKey(),
    date: text('date')
      .$type<LocalDate>()
      .notNull()
      .references(() => day.date, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    targetProtein: real('target_protein'),
    targetCarbs: real('target_carbs'),
    targetFat: real('target_fat'),
    targetKcal: real('target_kcal'),
  },
  (table) => [index('ix_day_meal_date').on(table.date)],
);

/**
 * A journal entry freezes the reference, never the total (D5/R1).
 *
 * It carries the macros for 100 base units, the quantity and the unit. The
 * consumed total is derived, never stored (D9). That is what makes editing
 * without any time limit actually possible: an entry is a closed capsule that
 * never consults the food database again.
 *
 * > Aggregation invariant: every macro sum runs over childless rows. A
 * > 'recipe' parent has its macro columns NULL, so SUM ignores it and double
 * > counting is structurally impossible rather than conditionally avoided.
 *
 * A free entry is stored as quantity 100 of a virtual food whose macros for
 * 100 are the values typed in, so it needs no special case in any aggregation
 * (D5/R2). It is presentation, not SQL, that must avoid showing it as "100 g".
 */
export const journalEntry = sqliteTable(
  'journal_entry',
  {
    id: text('id').$type<JournalEntryId>().primaryKey(),
    dayMealId: text('day_meal_id')
      .$type<DayMealId>()
      .notNull()
      .references(() => dayMeal.id, { onDelete: 'cascade' }),
    /**
     * Denormalised on purpose: immutable, and it keeps the statistics of
     * slice 7 index-only rather than joining back through day_meal.
     */
    date: text('date').$type<LocalDate>().notNull(),
    parentEntryId: text('parent_entry_id')
      .$type<JournalEntryId>()
      .references((): AnySQLiteColumn => journalEntry.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind').$type<JournalEntryKind>().notNull(),
    /**
     * Informative, without a live link, and deliberately untyped for now: the
     * food and recipe tables arrive in slices 3 and 6, and marking these
     * columns then is a TypeScript change with no SQL in it.
     */
    sourceFoodId: text('source_food_id'),
    sourceRecipeId: text('source_recipe_id'),
    name: text('name').notNull(),
    brand: text('brand'),
    baseUnit: text('base_unit').$type<BaseUnit>(),
    quantity: real('quantity'),
    portionName: text('portion_name'),
    portionQuantity: real('portion_quantity'),
    protein100: real('protein_100'),
    carbs100: real('carbs_100'),
    fat100: real('fat_100'),
    /** Source value, kept as given, never recomputed from P/C/F (specs 5.1). */
    kcal100: real('kcal_100'),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    index('ix_entry_date').on(table.date),
    index('ix_entry_meal').on(table.dayMealId),
    index('ix_entry_parent').on(table.parentEntryId),
    /** Serves "last quantity consumed for this food" (specs 8.4), slice 3. */
    index('ix_entry_source_food').on(table.sourceFoodId, table.createdAt),
    /**
     * Section 2.3 states these value sets as comments. They are written as
     * constraints instead, with one explicit divergence accepted: SQLite
     * cannot add a CHECK later without rebuilding the table, and slice 2 will
     * import arbitrary JSON straight into here.
     */
    check('ck_entry_kind', sql`${table.kind} IN ('food', 'recipe', 'recipe_item', 'free')`),
    check(
      'ck_entry_base_unit',
      sql`${table.baseUnit} IS NULL OR ${table.baseUnit} IN ('g', 'ml')`,
    ),
  ],
);

export type DayRow = typeof day.$inferSelect;
export type DayMealRow = typeof dayMeal.$inferSelect;
export type JournalEntryRow = typeof journalEntry.$inferSelect;
