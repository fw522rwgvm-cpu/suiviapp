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
  exercise,
  exerciseNote,
  exerciseSecondaryMuscle,
  food,
  foodPortion,
  journalEntry,
  planningOverride,
  planningWeekday,
  recipe,
  recipeIngredient,
  recipeStep,
  recipeTag,
  routine,
  routineBlock,
  routineLine,
  routineWarmupStep,
  session,
  sessionBlock,
  sessionSegment,
  sessionSet,
  notificationSetting,
  setting,
  weightGoal,
  weightMeasure,
  EQUIPMENT,
  MUSCLES,
  NOTIFICATION_KINDS,
  PORTION_NAMES,
  SESSION_STATUSES,
  SET_STATUSES,
  SET_TYPES,
  WEIGHT_GOAL_MODES,
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
   * Notification settings sit beside `setting`, and the position is genuinely
   * free — the table carries no foreign key in either direction, which is the
   * same freedom the weight block has at the bottom.
   *
   * Filed WITH the configuration rather than as a domain of its own, because
   * that is what a reader repairing this file by hand (D7) would expect: the
   * two tables holding what the user chose about the application read together,
   * at the top, before any data. The weight block is kept together for the
   * opposite reason — it is a domain with measurements of its own, and one
   * table of four rows is not.
   *
   * WHAT IT CARRIES IS WORTH STATING: only the enabled flags and the hours.
   * What iOS holds pending is not here and is not anywhere, being derivable
   * from this plus the clock (D9). So importing an archive restores the
   * CHOICES, and the schedule is rebuilt from them on the next foreground —
   * which is exactly what happens after any reinstall.
   */
  { table: notificationSetting, introducedIn: '0007_notifications' },
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
  /**
   * The weight block sits last, and it is the one block whose position is
   * genuinely free: neither table carries a foreign key, in either direction.
   *
   * Kept together rather than filed by kind — the goal with the configuration
   * at the top, the measurements with the journal at the bottom — because
   * weight is a domain of its own with nothing joining it to nutrition. A
   * reader repairing this file by hand (D7) finds the whole of it in one place.
   *
   * The goal leads its own block, the way day_template and recipe lead theirs,
   * even though nothing here requires it: an ordering that reads the same
   * everywhere is one less thing to check.
   *
   * ## SPECS 9.1 MAKES THIS THE MOST IMPORTANT BLOCK IN THE FILE
   *
   * > La double saisie est définitive. intervals.icu n'expose pas le poids
   * > remonté par COROS. La saisie manuelle dans cette application est donc la
   * > seule source, sans échappatoire technique, et pour toutes les versions.
   * > Cela renforce encore la criticité de l'export : LE POIDS N'EXISTE QU'ICI.
   *
   * Every other table in this export could in principle be reconstructed from
   * something — a food from its barcode, a recipe from a photograph of a note.
   * These two cannot be reconstructed from anything at all.
   */
  { table: weightGoal, introducedIn: '0006_weight' },
  { table: weightMeasure, introducedIn: '0006_weight' },
  /**
   * The strength block closes the file, and its internal order is forced from
   * end to end — the first block in this export where that is true.
   *
   * `exercise` leads, because exercise_secondary_muscle AND routine_line both
   * reference it. `routine` follows, because its three children reference it.
   * routine_block precedes routine_line, which references the block it sits in.
   * So this is not the readable ordering the planning and recipe blocks chose
   * for a reader repairing the file by hand — here the dependencies chose it,
   * and any other order would need foreign keys off to load. They are off
   * during the fill anyway, journal_entry referencing itself; this matters at
   * barrier 3, where foreign_key_check runs with them back on.
   *
   * Placed AFTER the weight block rather than anywhere else because V3 joins
   * nothing above it: no table here references nutrition, planning, recipes or
   * weight, and none of those references these. The file therefore reads as
   * configuration, then nutrition, then journal, then weight, then strength —
   * each domain whole, in the order the versions arrived.
   *
   * ## THE MECHANISM WORKED, AND HERE IS WHAT IT CAUGHT
   *
   * This comment used to say the five session tables "are not exclusions and
   * must not become entries here before they exist: the day 0009 lands, that
   * test goes red and somebody decides". It landed as `0010` and four tests
   * went red at once — this catalogue's coverage, the export order, the tags
   * left to apply, and the round trip's inventory against PRAGMA table_info.
   * Same four as when 0002 brought `food`, and for the same reason.
   */
  { table: exercise, introducedIn: '0008_strength' },
  { table: exerciseSecondaryMuscle, introducedIn: '0008_strength' },
  { table: routine, introducedIn: '0008_strength' },
  { table: routineWarmupStep, introducedIn: '0008_strength' },
  { table: routineBlock, introducedIn: '0008_strength' },
  { table: routineLine, introducedIn: '0008_strength' },
  /**
   * The session block, and its internal order is forced from end to end the
   * way the routine block's is.
   *
   * `session` leads, because its three children reference it. session_block
   * precedes session_set, which references the block it sits in. exercise_note
   * hangs off `exercise`, already loaded far above.
   *
   * session_set also references `exercise`, which is why the whole strength
   * block sits together rather than the sessions being filed under the journal:
   * the file reads as configuration, then nutrition, then journal, then weight,
   * then strength — each domain whole, in the order the versions arrived.
   *
   * ## A SESSION IS EXPORTED, AND THE ONE THING THAT MIGHT SUGGEST OTHERWISE
   *
   * Specs 5.4 excludes exercise MEDIA from the export, not sessions. A session
   * is the history of what was lifted, which is exactly the class of data the
   * export exists to protect — and unlike weight, it is also the only place it
   * exists. Nothing here is rebuildable.
   */
  { table: session, introducedIn: '0010_session' },
  { table: sessionSegment, introducedIn: '0010_session' },
  { table: sessionBlock, introducedIn: '0010_session' },
  { table: sessionSet, introducedIn: '0010_session' },
  { table: exerciseNote, introducedIn: '0010_session' },
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
  weight_measure: {
    date: { rule: 'civil_date' },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
    /**
     * value_kg CARRIES NO RULE, AND THERE IS NONE TO GIVE IT YET.
     *
     * ck_weight_value holds it to a positive number in SQL, which makes this
     * the one column in the export whose only barrier is a CHECK citing a
     * constraint rather than a rule naming a row — the weaker form by the
     * food_portion.name argument, and D7 wants a file repairable by hand.
     *
     * The reason it stays that way: every rule here is either a shape
     * (civil_date, entity_id, epoch_ms) or a closed set (one_of). There is no
     * numeric rule at all, and adding one is exactly the deferral already taken
     * for food.barcode's non_empty — the catalogue assumes its rules may be
     * incomplete, which only ever makes validation weaker, never wrong.
     */
  },
  notification_setting: {
    /**
     * THE ONLY BARRIER THIS COLUMN HAS, and that is deliberate rather than an
     * omission.
     *
     * notification_setting.kind carries NO CHECK, unlike journal_entry.kind and
     * weight_goal.mode, because widening it breaks no calculation: nothing is
     * summed and nothing is derived from it, and the Settings screen enumerates
     * the four kinds from the CODE, reading this table by key. A row with an
     * unknown kind is a row nothing reads.
     *
     * So this rule is the whole barrier, and it is the STRONGER form by the
     * food_portion.name argument: it runs before the first insert and names the
     * table, the row index and the column, where a CHECK would cite a
     * constraint. D7 wants a file repairable by hand.
     *
     * Named from the schema rather than respelled, the shape PORTION_NAMES set.
     *
     * THIS COMMENT USED TO SAY "slice 11 adds a kind here for the rest timer".
     * It did not, and the correction matters more than the prediction did: the
     * rest timer has no setting to store, and adding a kind would have made the
     * daily planner claim its identifier and cancel it mid-workout. It lives in
     * its own `rest:` namespace instead. See the note on notification_setting.
     */
    kind: { rule: 'one_of', allowed: NOTIFICATION_KINDS },
    /**
     * enabled, hour and minute carry NO rule, for the reason
     * planning_weekday.weekday carries none: the one_of rule takes strings and
     * these are integers.
     *
     * enabled is held by ck_notification_enabled in SQL, which it can afford
     * because a boolean will never widen. hour and minute are held by NEITHER,
     * and that is the refusal written up in the schema module: this project
     * answers a bad settings value by CLAMPING it, on the way in and on the way
     * out, exactly as normalizeCutoffHour does. An hour of 25 in a
     * hand-repaired archive imports, reads back as 23, and breaks nothing — a
     * settings row is never a reason to refuse to work.
     */
  },
  /**
   * THE STRENGTH TABLES PUT MORE WEIGHT ON THESE RULES THAN ANY BLOCK BEFORE.
   *
   * Three closed vocabularies land in 0008 and NONE of them carries a CHECK —
   * muscles, equipment and set types. So for all three this rule is not one
   * barrier of two, it is the only one, which is the food_portion.name position
   * and the STRONGER form by that argument: it runs before the first insert and
   * names the table, the row index and the column, where a CHECK would cite a
   * constraint name. D7 wants a file repairable by hand.
   *
   * Two of the three are worse than food_portion.name ever was, and that is
   * exactly why they are held here rather than in SQL: neither document gives
   * these lists. They are chosen in schema/strength.ts, have never met a real
   * exercise, and are the likeliest thing in this schema to move. A CHECK would
   * make widening them a table rebuild.
   *
   * All three named from the schema rather than respelled, the shape
   * PORTION_NAMES set in slice 3.
   */
  exercise: {
    id: { rule: 'entity_id' },
    primary_muscle: { rule: 'one_of', allowed: MUSCLES },
    equipment: { rule: 'one_of', allowed: EQUIPMENT },
    /**
     * media_uri carries NO rule, and there is none to give it.
     *
     * It holds a file NAME relative to the application's media folder, never an
     * absolute URI — an iOS container is named by a UUID that changes on
     * reinstall, so an absolute path dies on its own. No rule here is a shape
     * (civil_date, entity_id, epoch_ms) or a closed set, and "some file name"
     * is neither. Same deferral already taken for food.barcode's non_empty: the
     * catalogue assumes its rules may be incomplete, which only ever makes
     * validation weaker, never wrong.
     *
     * What matters is stated where it can be enforced — specs 5.4 no 3 requires
     * a missing medium to show a substitute and never crash, so a dead name
     * imports and displays a placeholder, which is the specified behaviour
     * rather than a failure to validate.
     *
     * increment_kg carries none either: ck_exercise_increment holds it above
     * zero in SQL, and there is no numeric rule in this catalogue at all.
     * is_favorite likewise — the one_of rule takes strings, and
     * ck_exercise_favorite constrains it, which it can afford because a boolean
     * will never widen.
     */
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
  exercise_secondary_muscle: {
    exercise_id: { rule: 'entity_id' },
    muscle: { rule: 'one_of', allowed: MUSCLES },
  },
  routine: {
    id: { rule: 'entity_id' },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
  },
  routine_warmup_step: {
    id: { rule: 'entity_id' },
    routine_id: { rule: 'entity_id' },
    /**
     * `text` carries no rule, and there is none to give: specs 10.2 says "une
     * étape par ligne saisie", so the whole point is that the user writes it.
     * recipe_step.text and recipe_tag.tag are in the same position.
     */
  },
  routine_block: {
    id: { rule: 'entity_id' },
    routine_id: { rule: 'entity_id' },
    /**
     * rest_seconds and position are integers, which the one_of rule cannot
     * take — planning_weekday.weekday's position. ck_block_rest holds the rest
     * above zero in SQL.
     */
  },
  routine_line: {
    id: { rule: 'entity_id' },
    block_id: { rule: 'entity_id' },
    /**
     * A real foreign key backs this one, unlike journal_entry.source_food_id —
     * a routine is a living object, not history, so the link is live. The rule
     * is still worth declaring: barrier 3 runs foreign_key_check and would
     * report a violation citing a constraint, where this names the row.
     */
    exercise_id: { rule: 'entity_id' },
    set_type: { rule: 'one_of', allowed: SET_TYPES },
    /**
     * What NO rule here can express, stated so the gap is deliberate rather
     * than forgotten: that reps_min must not exceed reps_max. Rules are
     * per-column and that one spans two, so ck_line_reps carries it in SQL —
     * the same position as ck_ingredient_link and ck_weight_goal_terms.
     */
  },
  weight_goal: {
    id: { rule: 'entity_id' },
    /**
     * The closed set named from the schema rather than respelled, the shape
     * PORTION_NAMES set in slice 3.
     *
     * Like recipe.yield_type — and unlike food_portion.name — this one ALSO
     * carries a CHECK, and the two barriers answer different questions. The
     * CHECK exists because widening this set breaks a CALCULATION rather than a
     * label: `mode` decides which column is read and which figure is derived
     * from it, so a third mode falls through every branch and produces a
     * plausible, wrong rate. The rule exists because D7 wants a hand-repaired
     * file told the table, the row and the column.
     */
    mode: { rule: 'one_of', allowed: WEIGHT_GOAL_MODES },
    target_date: { rule: 'civil_date' },
    defined_at: { rule: 'epoch_ms' },
    /**
     * is_active carries NO rule, for the reason planning_weekday.weekday
     * carries none: the one_of rule takes strings and this column is an
     * integer. ck_weight_goal_active constrains it in SQL instead, which it can
     * afford to because a boolean will never widen.
     *
     * And what NO rule here can express, stated so the gap is deliberate rather
     * than forgotten: that the mode and its two terms must agree — target_date
     * set in one mode, rate_kg_per_week in the other, never both.
     * ck_weight_goal_terms carries that in SQL, because rules are per-column
     * and this one spans three. Same position as ck_ingredient_link.
     */
  },
  session: {
    id: { rule: 'entity_id' },
    date: { rule: 'civil_date' },
    /**
     * Informative, without a live link — a session is a snapshot of the routine
     * it came from (specs 5.2), so deleting the routine must leave it intact.
     * The rule is the fourth run of the pattern source_food_id started:
     * declarable because nothing has ever written anything but a ULID here.
     */
    routine_id: { rule: 'entity_id' },
    /**
     * The closed set named from the schema, and it ALSO carries a CHECK — the
     * third column in this catalogue to do both, after recipe.yield_type and
     * weight_goal.mode, and the only one whose second barrier is an INDEX.
     *
     * ux_session_active is partial, `WHERE status = 'in_progress'`, so it
     * constrains nothing about a row whose status says something else. Without
     * ck_session_status an archive carrying two sessions at status 'running'
     * would import cleanly and leave the application holding two live sessions
     * — the exact thing D12 requires the database to make impossible.
     *
     * So this rule and that CHECK and that index are one barrier in three
     * pieces, and this is the piece that runs FIRST, before any insert, naming
     * the table and the row. The other two report a column.
     */
    status: { rule: 'one_of', allowed: SESSION_STATUSES },
    started_at: { rule: 'epoch_ms' },
    ended_at: { rule: 'epoch_ms' },
    created_at: { rule: 'epoch_ms' },
    updated_at: { rule: 'epoch_ms' },
    /**
     * routine_name_snapshot and notes carry no rule, and there is none to give:
     * one is a name frozen from whatever the routine was called, the other is
     * what the user typed. routine_warmup_step.text is in the same position.
     */
  },
  session_segment: {
    id: { rule: 'entity_id' },
    session_id: { rule: 'entity_id' },
    started_at: { rule: 'epoch_ms' },
    ended_at: { rule: 'epoch_ms' },
    /**
     * What NO rule here can express, stated so the gap is deliberate: that a
     * segment must not end before it starts. Rules are per-column and that one
     * spans two, so ck_segment_order carries it in SQL. It matters more here
     * than the shape of either instant does — the session duration is the SUM
     * of these rows, so an inverted pair makes a workout quietly shorter rather
     * than visibly wrong.
     */
  },
  session_block: {
    id: { rule: 'entity_id' },
    session_id: { rule: 'entity_id' },
    /**
     * position and rest_seconds are integers, which the one_of rule cannot
     * take — routine_block's position exactly. ck_session_block_rest holds the
     * rest at or above zero in SQL.
     */
  },
  session_set: {
    id: { rule: 'entity_id' },
    session_block_id: { rule: 'entity_id' },
    /**
     * A real foreign key backs this one, and it is the only LIVE link in this
     * catalogue pointing at something the user can delete (D5/R4). The rule is
     * still worth declaring for the reason routine_line.exercise_id's is:
     * barrier 3 runs foreign_key_check and reports a constraint, where this
     * names the row.
     *
     * NULL is legitimate and is not damage: it is what deleteExercise() leaves
     * behind, with exercise_name_frozen carrying what was performed. An archive
     * whose sets have no exercise_id is an archive from someone who deleted an
     * exercise, which specs 5.3 explicitly permits.
     */
    exercise_id: { rule: 'entity_id' },
    set_type: { rule: 'one_of', allowed: SET_TYPES },
    /**
     * A closed set with NO CHECK beside it, unlike `session.status` one table
     * up, and the asymmetry is the point rather than an oversight.
     *
     * Nothing enforces anything about a set by partial index, and the volume of
     * specs 10.1 is a POSITIVE clause — "sur les séries de travail validées
     * uniquement" — so a fifth status is simply not counted. Widening it breaks
     * no calculation and escapes no invariant, which is precisely the test
     * slice 3 set and slice 10 applied to set_type.
     *
     * So this rule is the whole barrier, and it is the stronger form: it runs
     * before the first insert and names table, row and column.
     */
    status: { rule: 'one_of', allowed: SET_STATUSES },
    completed_at: { rule: 'epoch_ms' },
    /**
     * What NO rule here can express, stated so the gaps are deliberate: that
     * target_reps_min must not exceed target_reps_max (ck_set_target_reps
     * carries it, spanning two columns), and that a status of 'done' ought to
     * come with a completed_at. The second is NOT constrained anywhere, on
     * purpose — it is a rule of the write path, and an archive repaired by hand
     * that lost one timestamp should import and read as done rather than fail.
     * Slice 4's line: too permissive costs a refused row, too strict costs a
     * feature that never works again.
     *
     * exercise_name_frozen carries no rule either. It is a name copied from
     * whatever the exercise was called at the time, and the whole reason it
     * exists is that no live value can be consulted for it any more.
     */
  },
  exercise_note: {
    id: { rule: 'entity_id' },
    exercise_id: { rule: 'entity_id' },
    created_at: { rule: 'epoch_ms' },
    /**
     * consumed_at is an instant like any other; NULL is the note still waiting
     * for its session. `text` carries no rule — it is what the user wrote.
     */
    consumed_at: { rule: 'epoch_ms' },
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
