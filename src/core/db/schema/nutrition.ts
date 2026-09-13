import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import type { LocalDate } from '@/core/date';
import type { EntityId } from '@/core/id';
import type { DayTemplateId } from './planning';

/**
 * Foods, days, meals and journal entries (schema 2.2 and 2.3).
 *
 * Only what a delivered slice uses. Day templates, planning and recipes arrive
 * with slices 5 and 6: creating their tables now would be a layer built "for
 * later", which section 7 rules out.
 *
 * One rule the whole schema obeys, discovered by reading the exporter rather
 * than by guessing: EVERY COLUMN MUST MAP TO A JSON SCALAR. The export reads
 * columns straight off these objects and throws on anything that is not a
 * string, a finite number or null. That rules out Drizzle's mode mappings —
 * mode: 'boolean' would hand the exporter true/false, mode: 'timestamp' a Date
 * — across this file and every domain schema still to come. Booleans are
 * therefore INTEGER 0/1, as section 2 of the schema says in as many words,
 * typed rather than mapped.
 */

export type FoodId = EntityId<'food'>;
export type FoodPortionId = EntityId<'food_portion'>;
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
 * Where a food came from (schema 2.2).
 *
 * Specs 6.1 spells the second one 'openfoodfacts'. Schema 2.2 spells it 'off',
 * and 2.2 wins: specs section 6 opens by declaring itself "conceptual, NOT
 * normative — the normative schema is in the architecture document". So this
 * is the hierarchy working, not a divergence from it. 'off' is also already
 * the project's spelling everywhere else — the off_cache table of 2.4, the
 * features/nutrition/off/ folder of section 3.
 *
 * The token is never displayed: the screen writes "Perso" and "Open Food
 * Facts".
 *
 * 'off' is allowed three slices before anything writes it, for the same reason
 * 'recipe' was allowed in JournalEntryKind: the CHECK that carries this set
 * cannot be widened without rebuilding the table.
 */
export type FoodSource = 'perso' | 'off';

/**
 * A food in the personal database (schema 2.2, specs 8.5).
 *
 * WHAT THIS TABLE CARRIES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * The rule that produced this column list: migration 0002 carries what cannot
 * be added later, and defers what can. SQLite does ALTER TABLE ADD COLUMN for
 * a nullable column or one with a default, and CREATE/DROP INDEX freely; it
 * cannot add a CHECK or a foreign key without rebuilding the table. So `source`
 * shipped in 0002 despite having no user before slice 4 — it is NOT NULL and
 * carries a CHECK, so it could not arrive later — while `barcode` and its
 * partial unique index waited for 0003 and the scan that uses them.
 *
 * THE DEFERRAL PAID OFF EXACTLY AS PREDICTED: 0003 is one ALTER TABLE and one
 * CREATE INDEX, on a table holding real data, with nothing rebuilt and nothing
 * rewritten. Corollary worth keeping: the indexes below are the one part of
 * this table that is not irreversible.
 *
 * NO CHECK ON THE MACROS, and that is a refusal rather than an omission. Specs
 * 8.5 requires Open Food Facts values to be treated as unreliable and shown
 * "marked and editable before validation", never refused; slice 4 then copies
 * every logged product into this table automatically. A CHECK (protein_100 >= 0)
 * would turn a markable oddity into a failed INSERT on that automatic copy
 * path — a blocked journey where the specs ask for a non-blocking mark.
 *
 * Macros are stored canonically, for 100 base units (specs 6.1 v2.2), so Open
 * Food Facts data lands without conversion and two foods compare directly.
 */
export const food = sqliteTable(
  'food',
  {
    id: text('id').$type<FoodId>().primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    /**
     * The product's barcode, when it has one (specs 6.1, slice 4).
     *
     * DEFERRED FROM 0002 ON PURPOSE, and 0003 is where the reasoning pays
     * off: a migration carries what cannot be added later and defers what
     * can. Nullable and unconstrained, so ALTER TABLE ADD COLUMN was always
     * going to be enough -- unlike `source`, which is NOT NULL with a CHECK
     * and therefore had to ship three slices before its first user.
     *
     * Null for the vast majority of personal foods, which are things rather
     * than products: an apple has no barcode, and neither does a portion of
     * rice weighed out of a bag.
     *
     * NO CHECK, for the reason that governs the whole of this table: a
     * barcode is an external identifier with no closed set to constrain, and
     * slice 4 copies every logged Open Food Facts product in here
     * automatically. A constraint on this path would turn a markable oddity
     * into a failed INSERT, which specs 8.5 forbids in as many words.
     */
    barcode: text('barcode'),
    source: text('source').$type<FoodSource>().notNull(),
    baseUnit: text('base_unit').$type<BaseUnit>().notNull(),
    protein100: real('protein_100').notNull(),
    carbs100: real('carbs_100').notNull(),
    fat100: real('fat_100').notNull(),
    /** Source value, kept as given, never recomputed from P/C/F (specs 5.1). */
    kcal100: real('kcal_100').notNull(),
    /**
     * The reference quantity the user thinks in — 30 for a food whose label
     * reads "per 30 g". A DISPLAY PREFERENCE, with no normative value
     * (schema 2.2, specs 6.1).
     *
     * It is not derived data and storing it does not breach D9: it is an input
     * captured at an instant, which D9 says in as many words is legitimate.
     * The risk runs the other way — that something starts deriving FROM it. So
     * the containment is structural: food-reads.ts always returns macros for
     * 100, nothing in domain/macros.ts accepts this value, and the only
     * function reading it returns a number bound for display. A test asserts
     * that changing it moves no journal total by so much as a bit.
     *
     * DEFAULT 100 diverges from 2.2, which gives no default. 100 is the
     * canonical form, so the default is the identity — and it makes the column
     * legitimately absent from a hand-repaired archive, since the validator
     * only refuses a missing column that is NOT NULL *without* a default.
     */
    displayRefQty: real('display_ref_qty').notNull().default(100),
    /**
     * INTEGER 0/1 (schema section 2), typed rather than mapped.
     *
     * Drizzle's mode: 'boolean' would read better and would break the export:
     * it hands back true/false, and the exporter throws on anything that is
     * not a string, a finite number or null. See the note at the top of this
     * file.
     */
    isFavorite: integer('is_favorite').$type<0 | 1>().notNull().default(0),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    /**
     * Honest accounting, because this index's name promises more than it
     * delivers: it serves ORDER BY, not the search.
     *
     * LIKE '%something%' uses no index, ever. Even LIKE 'something%' would not
     * use this one: SQLite applies its LIKE optimisation only when the index
     * collation matches the case_sensitive_like setting, which is off by
     * default, so a BINARY index is skipped. At the few hundred rows D16
     * budgets for, scanning costs nothing measurable anyway.
     *
     * It is created because 2.2 is normative, and because an index costs one
     * line and can be dropped later without rebuilding anything. NOCASE so
     * that 'abricot' sorts before 'Zucchini' rather than after it.
     *
     * The search itself is a pure function over a cached list — see
     * domain/food-search.ts — which is both faster per keystroke and the only
     * way to get accent-insensitive matching without storing a folded column,
     * which D9 would forbid.
     */
    index('ix_food_name').on(sql`${table.name} COLLATE NOCASE`),
    /**
     * One food per barcode, which is what makes the deduplication of specs 8.5
     * something the database guarantees rather than something a screen
     * remembers to do.
     *
     * > Corollary, compulsory: the unified search DEDUPLICATES BY BARCODE.
     *
     * PARTIAL, and the WHERE clause is documentation rather than mechanism.
     * SQLite already treats NULLs as distinct in a unique index, so every
     * barcode-less food would coexist either way; the clause says the
     * intention out loud and keeps the index to the rows that have one.
     *
     * WHAT THIS REINTRODUCES, AND HOW IT IS ANSWERED. Slice 3 refused every
     * CHECK on the macros so that the automatic copy could never fail on an
     * INSERT. A unique index reopens exactly that door: two Open Food Facts
     * products can share an EAN — reused codes, regional variants — and the
     * same product logged twice would collide with itself. The answer is not
     * to drop the index, which is the only thing making "one food per
     * barcode" true; it is that the copy path reads by barcode and updates,
     * inside its transaction, rather than blindly inserting. See
     * upsertOffFood in food-writes.ts.
     *
     * Indexes are the one part of a migration that is not irreversible, so
     * this can be dropped later without rebuilding anything.
     */
    uniqueIndex('ux_food_barcode')
      .on(table.barcode)
      .where(sql`${table.barcode} IS NOT NULL`),
    check('ck_food_source', sql`${table.source} IN ('perso', 'off')`),
    check('ck_food_base_unit', sql`${table.baseUnit} IN ('g', 'ml')`),
    /** A boolean can never widen, so constraining it costs nothing, ever. */
    check('ck_food_favorite', sql`${table.isFavorite} IN (0, 1)`),
  ],
);

/**
 * The closed list of portion names (specs 6.1).
 *
 * Declared ONCE, as data, and the type derived from it — rather than a type
 * union with the same words repeated in a runtime array beside it. A union
 * cannot be walked at runtime, so the pair would have to be kept in step by
 * hand, and the place it would drift is the import validator.
 *
 * It lives in the schema module, not in features/nutrition, because the export
 * catalogue needs it too and the catalogue is the one module that legitimately
 * knows every domain. Reaching into a feature from features/backup would break
 * the rule that each domain closes over its own; reaching into core does not.
 *
 * The values are French because they are stored verbatim and displayed
 * verbatim: freezing one into a journal entry is then a copy rather than a
 * translation. The convention reserving French for displayed strings governs
 * how code is NAMED, and day_meal.name has held 'Petit-dejeuner' since slice 1.
 */
export const PORTION_NAMES = [
  'tranche',
  'portion',
  'cuillère à soupe',
  'cuillère à café',
  'morceau',
  'entier',
  'bol',
  'verre',
] as const;

export type PortionName = (typeof PORTION_NAMES)[number];

/**
 * Named portions, each carrying its quantity in base units (specs 6.1 v2.2).
 *
 * > Each portion compulsorily carries a quantity in base units (one slice =
 * > 25 g). Without it, a portion is not calculable.
 *
 * NO CHECK ON THE NAME, where journal_entry.kind and base_unit got one. The
 * line is not how likely the set is to move but what widening it would break.
 * Widening `kind` breaks the aggregation invariant — the clause-free SUM holds
 * only because the set is closed. Widening `base_unit` breaks the
 * watertightness specs 5.1 requires. Widening the portion vocabulary breaks
 * nothing: it is a label with a number beside it, and eight French display
 * words are the likeliest thing in this schema to move.
 *
 * The slice-1 argument for a CHECK — "slice 2 will import arbitrary JSON into
 * this" — is already answered here, and answered better: table-catalog.ts
 * declares a one_of rule that validate-payload.ts applies BEFORE the first
 * insertion, naming the table, the row index and the column. A CHECK would
 * yield a SQLite error citing a constraint. D7 wants a file repairable by
 * hand, so here the CHECK is the weaker barrier, not the stronger one.
 *
 * Names are stored in French, exactly as displayed, because freezing one into
 * a journal entry is then a copy rather than a translation. Precedent in the
 * shipped schema: day_meal.name holds 'Petit-dejeuner', journal_entry.name
 * holds 'Saisie libre'. The convention reserving French for displayed strings
 * forbids naming code in French; it has never forbidden storing a label.
 *
 * No created_at / updated_at: 2.2 spells this table's columns out and omits
 * them, as it does for day and day_meal.
 */
export const foodPortion = sqliteTable(
  'food_portion',
  {
    id: text('id').$type<FoodPortionId>().primaryKey(),
    foodId: text('food_id')
      .$type<FoodId>()
      .notNull()
      .references(() => food.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** In base units, compulsory. A portion of zero is not calculable either. */
    quantity: real('quantity').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    uniqueIndex('ux_portion_food_name').on(table.foodId, table.name),
    check('ck_portion_quantity', sql`${table.quantity} > 0`),
  ],
);

/**
 * A day exists only once materialised (specs 8.2). Its absence is meaningful:
 * it is the difference between a day nobody touched and a day emptied on
 * purpose, and browsing three months of history must never create one.
 *
 * THE TWO SNAPSHOT COLUMNS ARE WHERE SLICE 1's PREDICTION PAID OFF. They
 * shipped nullable and stayed NULL for four slices; 0004 gave them templates
 * to point at and cost no schema change at all, exactly as predicted.
 *
 * They stay NULL for every day materialised before 0004, and that is the
 * truthful record rather than a gap to be filled: at the moment those days
 * were materialised no template existed, so "no template" is what happened.
 * Backfilling them would invent a fact, and specs 8.1 forbids a template
 * change from reaching a materialised day retroactively in any case.
 *
 * No created_at / updated_at here: section 2.3 spells this table's columns out
 * explicitly, and materialized_at is the creation stamp.
 */
export const day = sqliteTable('day', {
  date: text('date').$type<LocalDate>().primaryKey(),
  /**
   * Informative, WITHOUT A LIVE LINK, and deliberately carrying no foreign
   * key (schema 2.3). Marked in slice 4's successor exactly as source_food_id
   * was marked in slice 3: a TypeScript change with no SQL in it.
   *
   * The absence of a key here is the counterweight to the CASCADE on
   * planning_weekday and planning_override. Those are live configuration and a
   * dangling row there means nothing; this is history, and a cascade would
   * destroy it. Deleting a template therefore clears the planning and leaves
   * every past day exactly as it was — which is what specs 5.3 and 5.2
   * together require.
   */
  templateIdSnapshot: text('template_id_snapshot').$type<DayTemplateId>(),
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
     * Informative, WITHOUT A LIVE LINK. Marked in slice 3, which is a
     * TypeScript change with no SQL in it, exactly as slice 1 predicted.
     *
     * No foreign key, for three reasons of which the last one settles it:
     *
     *  - ON DELETE CASCADE would destroy history, where specs 5.3 requires
     *    that deleting a consumed food leave past entries intact;
     *  - ON DELETE RESTRICT would block the deletion, where specs 5.3 says no
     *    deletion is ever blocked;
     *  - it is impossible anyway. This table has been frozen since 0001 and
     *    SQLite has no ALTER TABLE ADD CONSTRAINT, so a foreign key here would
     *    mean rebuilding the table that carries the entire history.
     *
     * ON DELETE SET NULL was the only candidate that is not absurd — entries
     * survive, they merely lose the link — and it is refused because it would
     * erase the one trace tying an entry to its food, which is precisely what
     * "informative, without a live link" exists to keep.
     *
     * Consequence, accepted: the referential integrity barrier of the import
     * (foreign_key_check) will never see an entry pointing at a deleted food.
     * That is the specification, not a gap.
     */
    sourceFoodId: text('source_food_id').$type<FoodId>(),
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

export type FoodRow = typeof food.$inferSelect;
export type FoodPortionRow = typeof foodPortion.$inferSelect;
export type DayRow = typeof day.$inferSelect;
export type DayMealRow = typeof dayMeal.$inferSelect;
export type JournalEntryRow = typeof journalEntry.$inferSelect;
