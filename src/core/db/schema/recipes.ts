import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import type { EntityId } from '@/core/id';
import { food, type BaseUnit, type FoodId } from './nutrition';

/**
 * Recipes, their tags, their steps and their ingredients (schema 2.2, specs
 * 8.6, slice 6).
 *
 * Its own module rather than more of nutrition.ts, on the precedent planning.ts
 * and off.ts set: a nutrition sub-domain with its own vocabulary gets its own
 * schema file.
 *
 * THE ARROW RUNS ONE WAY AT RUNTIME. This module imports the `food` table
 * object, because recipe_ingredient references it. nutrition.ts imports only
 * the TYPE RecipeId from here, and a type-only import is erased before the
 * bundler ever sees it — so the module graph has one edge, not a cycle. It is
 * the same shape nutrition.ts already uses for DayTemplateId, except that
 * planning.ts imports nothing back; this is the first place the two directions
 * meet, so it is verified by `npm run bundle:ios` rather than assumed.
 *
 * And the rule the whole schema obeys, unchanged: EVERY COLUMN MUST MAP TO A
 * JSON SCALAR. The exporter reads columns straight off these objects and
 * throws on anything that is not a string, a finite number or null, so
 * Drizzle's mode mappings are excluded here as everywhere else. is_favorite is
 * an INTEGER typed 0 | 1, never mode: 'boolean'.
 *
 * WHAT SHIPS IN 0005 AND WHY, by the rule slice 3 settled: a migration carries
 * what cannot be added later and defers what can. SQLite does ALTER TABLE ADD
 * COLUMN (nullable, or NOT NULL with a default) and CREATE/DROP INDEX freely;
 * it cannot add a CHECK or a foreign key without rebuilding the table. So
 * every CHECK and every foreign key below had to be decided now or abandoned
 * for good. The one index is the reversible part, and two others are
 * deliberately deferred — see the notes at the foot of this file.
 */

export type RecipeId = EntityId<'recipe'>;
export type RecipeStepId = EntityId<'recipe_step'>;
export type RecipeIngredientId = EntityId<'recipe_ingredient'>;

/**
 * How a recipe states what it makes (schema 2.2, specs 6.1, 8.6).
 *
 * > Rendement en portions ou en poids total, ce dernier saisi manuellement.
 *
 * Declared ONCE, as data, with the type derived from it — the shape
 * PORTION_NAMES established in slice 3, and for the same reason: a union of
 * literals cannot be walked at runtime, so a type beside a hand-kept array
 * would drift, and the place it would drift is the import validator.
 *
 * 'weight' ALWAYS MEANS GRAMS, and there is no second column saying so. A
 * recipe mixes both base units by nature — 300 g of tomatoes and 200 ml of
 * stock — so there is no unit in which their sum would mean anything, and the
 * yield cannot be derived from the ingredients at all. A finished dish is
 * weighed. Specs 5.1 also settles it from the other end: food weights are
 * always "cru et non préparé" and "l'écart est absorbé par le rendement des
 * recettes" — cooking loss is water, and water is measured by weight.
 *
 * Consequence, accepted and worth stating: a recipe logged by weight always
 * produces a journal parent whose base_unit is 'g', whatever its ingredients
 * were measured in.
 */
export const YIELD_TYPES = ['portions', 'weight'] as const;

export type YieldType = (typeof YIELD_TYPES)[number];

/**
 * A recipe (schema 2.2, specs 8.6).
 *
 * IT STORES NO MACROS AT ALL, and that is specs 8.6 in as many words —
 * "macros toujours calculées depuis les ingrédients". D9 forbids storing what
 * derives, and this is the purest instance of it in the schema: a recipe's
 * macros are a function of rows in another table, which specs 5.3 says must
 * follow a food's edits because "une recette est un objet vivant, pas de
 * l'historique".
 *
 * That sentence needs no code to be true. It is a property of NOT STORING: the
 * total is summed from the live food rows on every read, so correcting a food
 * moves every recipe using it and moves nothing already eaten. A test states
 * it rather than a comment, because it is the whole of D5 in one assertion.
 *
 * ## ck_recipe_yield_value, WHICH IS NOT TIDINESS
 *
 * Schema 2.2 declares yield_value NOT NULL and constrains it no further. A
 * zero would make every derived macro infinite — total / yield_value — and an
 * infinity does not stop at the screen: logging the recipe freezes the scaled
 * quantity into journal_entry.quantity, which IS exported, and
 * toExportValue THROWS on a non-finite number. A single zero here would
 * therefore break the export, which is the only safety net this project has.
 *
 * So the constraint is the same class as ck_portion_quantity, for a stronger
 * reason: a portion of zero is merely uncalculable, a yield of zero is
 * contagious.
 *
 * ## ck_recipe_yield_type, WHERE food_portion.name REFUSED ONE
 *
 * The line is not how likely a set is to move, it is what widening it would
 * break. Widening the portion vocabulary breaks nothing — it is a label with a
 * number beside it. Widening this set breaks a CALCULATION: a third yield type
 * would fall through recipe-macros.ts and produce a plausible wrong number
 * rather than an unknown label. Same class as journal_entry.kind, whose closed
 * set is what makes the clause-free macro SUM correct.
 */
export const recipe = sqliteTable(
  'recipe',
  {
    id: text('id').$type<RecipeId>().primaryKey(),
    name: text('name').notNull(),
    /** Nullable, as 2.2 declares it: a recipe with no stated time is a recipe. */
    prepMinutes: integer('prep_minutes'),
    yieldType: text('yield_type').$type<YieldType>().notNull(),
    /** Servings when yieldType is 'portions', grams when it is 'weight'. */
    yieldValue: real('yield_value').notNull(),
    /**
     * INTEGER 0/1 (schema section 2), typed rather than mapped — see the note
     * at the top of this file.
     */
    isFavorite: integer('is_favorite').$type<0 | 1>().notNull().default(0),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    check('ck_recipe_yield_type', sql`${table.yieldType} IN ('portions', 'weight')`),
    check('ck_recipe_yield_value', sql`${table.yieldValue} > 0`),
    /** A boolean can never widen, so constraining it costs nothing, ever. */
    check('ck_recipe_favorite', sql`${table.isFavorite} IN (0, 1)`),
  ],
);

/**
 * A recipe's tags (schema 2.2, specs 8.6 "recherche, filtrage par tag").
 *
 * ## NO id COLUMN, AND A COMPOSITE PRIMARY KEY
 *
 * Schema 2.2 declares PRIMARY KEY(recipe_id, tag) and no identifier, and that
 * is the right model: a tag is not an entity, it is the fact that this recipe
 * carries this word. Nothing references a tag row, so nothing needs to name
 * one, and the composite key makes "the same tag twice on one recipe"
 * impossible rather than merely avoided.
 *
 * It cost the export catalogue a fix to accept, and that is worth recording
 * because the failure was silent in one half and loud in the other: Drizzle
 * leaves column.primary FALSE on every column of a composite key — the key
 * lives in getTableConfig(table).primaryKeys instead. So the catalogue saw a
 * table with no primary key at all, which failed its coverage test (loud) and
 * would have dropped the deterministic ORDER BY from the export (silent, and
 * two exports of the same data would have stopped being the same file).
 * table-catalog.ts now reads both, once, for every table that will ever have
 * one.
 *
 * ## NO CHECK ON THE TAG
 *
 * Specs 8.6 gives no vocabulary and there is none to give: the whole point of
 * a tag is that the user invents it. This is food_portion.name's argument with
 * nothing left to weigh.
 *
 * ## THE FOREIGN KEY IS A DIVERGENCE FROM 2.2
 *
 * Section 2.2 declares this table with no REFERENCES clause. SQLite has no
 * ALTER TABLE ADD CONSTRAINT, so what does not ship here can never ship. The
 * asymmetry that settles it is already written into the schema by someone
 * else, and slice 5 applied it to the planning: day.template_id_snapshot
 * carries no key because a cascade there would destroy HISTORY. A tag is not
 * history — it is a property of a live object, and a tag naming a recipe that
 * no longer exists cannot render and cannot resolve. Removing it is the only
 * coherent semantics.
 *
 * RESTRICT was excluded by specs 5.3, which blocks no deletion anywhere.
 * CASCADE blocks nothing either, so 5.3 is satisfied rather than bent. And
 * with no key declared at all, foreign_key_check — barrier 3 of the import —
 * could no longer tell a sound archive from one whose tags point nowhere.
 */
export const recipeTag = sqliteTable(
  'recipe_tag',
  {
    recipeId: text('recipe_id')
      .$type<RecipeId>()
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.tag] })],
);

/**
 * The preparation steps, in order (schema 2.2, specs 8.6).
 *
 * TWO DIVERGENCES FROM 2.2, both irreversible and therefore both decided here.
 *
 * 1. The foreign key, for the reason recipe_tag states above.
 *
 * 2. position and text are NOT NULL, where 2.2 leaves them nullable. A step
 *    with no text is not a step, and a step with no position has no place in
 *    an ordered list — the two columns are the whole of what this table is.
 *    Every comparable table in the schema already agrees: food_portion.position,
 *    day_meal.position and day_template_meal.position are all NOT NULL. And a
 *    NOT NULL column without a default is precisely what SQLite cannot add
 *    later, so leaving them nullable would have been permanent.
 *
 * No created_at / updated_at: 2.2 spells this table's columns out and omits
 * them, as it does for food_portion, day and day_meal.
 *
 * The Drizzle property is named `text` and so is the column. It shadows
 * nothing — the `text()` builder is called before the object is constructed.
 */
export const recipeStep = sqliteTable('recipe_step', {
  id: text('id').$type<RecipeStepId>().primaryKey(),
  recipeId: text('recipe_id')
    .$type<RecipeId>()
    .notNull()
    .references(() => recipe.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
});

/**
 * One ingredient line: a link to a food, a quantity, and the columns that
 * freeze it when that food is deleted (schema 2.2, D5/R3, specs 5.3).
 *
 * ## THE FOREIGN KEY ON food_id HAS NO ON DELETE CLAUSE, AND THAT IS THE POINT
 *
 * Section 2.2 declares `food_id TEXT REFERENCES food(id)` and stops there,
 * which means NO ACTION — and NO ACTION in SQLite is IMMEDIATE, not deferred.
 * Read on its own, that contradicts specs 5.3: deleting a food used as an
 * ingredient would fail, where 5.3 says no deletion is ever blocked.
 *
 * It does not contradict it once D5/R3 is obeyed:
 *
 * > R3 — Le figeage à la suppression est atomique. La suppression d'un aliment
 * > remplit ces colonnes et rompt le lien DANS UNE TRANSACTION UNIQUE.
 *
 * By the time the DELETE runs, no ingredient references the food, so NO ACTION
 * is never reached. The constraint is therefore not a hazard, it is the ONE
 * THING THAT PROVES THE FREEZE RAN. Simplify deleteFood back to a single
 * statement one day and the database refuses loudly, rather than losing a
 * recipe's macros quietly. That is the whole of why it is kept rather than
 * softened.
 *
 * ON DELETE SET NULL was the tempting alternative and is refused for the
 * reason D5/R3 exists: it breaks the link WITHOUT freezing, so the ingredient
 * survives with no name and no macros. Specs 5.3 promises the opposite — "la
 * ligne d'ingrédient est conservée sous forme figée : nom et macros gelés,
 * plus de lien vers la base". Declaring no key at all was refused for slice
 * 5's reason: it would cost the import barrier that foreign_key_check is.
 *
 * ## ck_ingredient_link, THE CROSS-COLUMN CHECK
 *
 * Either the link is live, or the capsule is filled. A row with neither
 * carries NULL macros, and a NULL is what SUM IGNORES — so such an ingredient
 * would contribute nothing to the recipe's total, silently, and the total
 * would still look like a number. That is the "plausible and wrong" class this
 * project refuses everywhere else.
 *
 * Its cost is named rather than hidden: the export catalogue's rules are
 * per-column, so it cannot express this one, and a hand-repaired archive that
 * broke it would meet a SQLite error citing a constraint instead of a sentence
 * naming the table, the row and the column. That is the exact complaint slice
 * 3 made against putting a CHECK on food_portion.name. The difference is what
 * the two failures cost: an unknown portion label is visible, a silently
 * skipped ingredient is not. The catalogue can grow a cross-column rule later
 * — a catalogue is not a schema, it can be changed.
 *
 * ## unit IS 'g' | 'ml', SO AN INGREDIENT IS NEVER "2 tranches"
 *
 * Specs 6.1 says "référence à un Aliment + quantité + unité" and leaves the
 * unit open, and this table has no portion_name / portion_quantity pair beside
 * the quantity — unlike journal_entry, which does. So a portion could only be
 * expressed by making `unit` hold a portion name and `quantity` a count of
 * them, which breaks the rule slice 3 settled and wrote down:
 *
 * > Une quantité stockée est toujours en unité de base. Jamais un nombre de
 * > portions.
 *
 * A recipe's macros are the same clause-free SUM the journal uses. If quantity
 * could mean "2 slices" that sum would be wrong in a PLAUSIBLE way. So
 * portions stay what they are in the journal: a convenience on the way in. The
 * editor may offer a food's portions and convert to base units at capture,
 * exactly as QuantityChoice already does; what lands here is always g or ml.
 *
 * ## AND ONE RULE NO CHECK CAN CARRY
 *
 * `unit` must equal the food's own base_unit. An ingredient in ml pointing at
 * a food stored per 100 g would pair millilitres with per-gram macros — false,
 * and perfectly plausible. It is cross-table, so SQLite cannot express it; it
 * lives at the write boundary with a test, like every other rule of that
 * shape.
 */
export const recipeIngredient = sqliteTable(
  'recipe_ingredient',
  {
    id: text('id').$type<RecipeIngredientId>().primaryKey(),
    recipeId: text('recipe_id')
      .$type<RecipeId>()
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** NULL once frozen (D5/R3). See the long note above. */
    foodId: text('food_id')
      .$type<FoodId>()
      .references(() => food.id),
    /** Always in base units. Never a count of portions. */
    quantity: real('quantity').notNull(),
    unit: text('unit').$type<BaseUnit>().notNull(),
    /**
     * Freeze columns: empty while the link lives, filled in the same
     * transaction that breaks it (D5/R3).
     *
     * They are nullable because they are empty for the whole normal life of a
     * row, which is also what lets 0005 ship them at all — and the pair with
     * food_id is held together by ck_ingredient_link rather than by hope.
     */
    frozenName: text('frozen_name'),
    frozenBaseUnit: text('frozen_base_unit').$type<BaseUnit>(),
    frozenProtein100: real('frozen_protein_100'),
    frozenCarbs100: real('frozen_carbs_100'),
    frozenFat100: real('frozen_fat_100'),
    /** Source value, kept as given, never recomputed from P/C/F (specs 5.1). */
    frozenKcal100: real('frozen_kcal_100'),
    frozenAt: integer('frozen_at'),
  },
  (table) => [
    /**
     * Declared by 2.2. It serves the freeze UPDATE's WHERE food_id = ?, and
     * the count of affected recipes the deletion warning names.
     *
     * An index is the one part of a migration that stays reversible, so it
     * costs nothing to ship and nothing to drop.
     */
    index('ix_ingredient_food').on(table.foodId),
    check('ck_ingredient_unit', sql`${table.unit} IN ('g', 'ml')`),
    check(
      'ck_ingredient_frozen_base_unit',
      sql`${table.frozenBaseUnit} IS NULL OR ${table.frozenBaseUnit} IN ('g', 'ml')`,
    ),
    /** An ingredient of zero is not an ingredient. Same class as a portion. */
    check('ck_ingredient_quantity', sql`${table.quantity} > 0`),
    check(
      'ck_ingredient_link',
      sql`${table.foodId} IS NOT NULL OR ${table.frozenKcal100} IS NOT NULL`,
    ),
  ],
);

/**
 * TWO INDEXES DELIBERATELY NOT SHIPPED, both deferrable and therefore deferred.
 *
 * ix_recipe_name — schema 2.2 declares none, and slice 3 already wrote the
 * reasoning for ix_food_name: LIKE '%x%' uses no index ever, and the search is
 * a pure function over a cached list rather than SQL. It would serve an ORDER
 * BY over a handful of hundreds of rows, which is nothing measurable.
 *
 * ix_entry_source_recipe on journal_entry(source_recipe_id, created_at) — it
 * would serve a "last quantity for this recipe" pre-fill, which slice 6 does
 * not build (see the note on the quick-access rows). If that becomes wanted,
 * the window function of lastEntriesByFood generalises to it with no schema
 * change at all — an index, and indexes are the reversible part.
 */

export type RecipeRow = typeof recipe.$inferSelect;
export type RecipeTagRow = typeof recipeTag.$inferSelect;
export type RecipeStepRow = typeof recipeStep.$inferSelect;
export type RecipeIngredientRow = typeof recipeIngredient.$inferSelect;
