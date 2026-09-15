import { sql } from 'drizzle-orm';
import { check, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { LocalDate } from '@/core/date';
import type { EntityId } from '@/core/id';

/**
 * Weight measurements and the weight goal (schema 2.5, specs 6.2, 9.1, 9.2).
 *
 * Its own module, on the precedent planning.ts and off.ts set: a domain with
 * its own vocabulary gets its own schema file. Nothing here imports any other
 * schema module and nothing imports this one, which is the shape of the domain
 * itself — a weight is not attached to anything.
 *
 * THE RULE THAT DECIDED WHAT SHIPS IN 0006, inherited from slice 3: a migration
 * carries what cannot be added later and defers what can. SQLite does ALTER
 * TABLE ADD COLUMN and CREATE/DROP INDEX freely; it cannot add a CHECK or a
 * foreign key without rebuilding the table. Everything irreversible in this
 * slice is in this file, and it is the two tables, their NOT NULL columns and
 * five CHECKs. The one index is not irreversible and is explained where it sits.
 *
 * ## WHAT IS DELIBERATELY NOT HERE
 *
 * `notification_setting`, which section 2.5 tabulates under "Poids (V2)".
 * Section 2.5 groups by VERSION; section 7 orders by SLICE, and it puts the
 * notifications in slice 9. They do not contradict each other.
 *
 * Deferring it costs nothing at all, which is the test that matters: the table
 * carries no foreign key in either direction, so 0007 can create it whole. This
 * is not a table held back despite a risk — there is no risk to hold back.
 * Creating it now would be a layer built "for later", which section 7 rules out
 * and which schema/index.ts restates in as many words.
 *
 * And the rule the whole schema obeys: EVERY COLUMN MUST MAP TO A JSON SCALAR.
 * The exporter reads columns straight off these objects and throws on anything
 * that is not a string, a finite number or null, so Drizzle's mode mappings are
 * excluded here as everywhere else — is_active is an integer typed 0 | 1, never
 * mode: 'boolean'.
 */

export type WeightGoalId = EntityId<'weight_goal'>;

/**
 * One weight measurement per civil date (specs 6.2, 9.1).
 *
 * > Une mesure au plus par date ; une nouvelle saisie sur une date existante
 * > écrase la précédente.
 *
 * ## THE DATE IS THE KEY, WHICH IS THE WHOLE RULE
 *
 * "At most one per date" is not enforced anywhere in the write layer: it is the
 * primary key. A second entry on the same date can only ever replace the first,
 * because there is nowhere else for it to go. Nothing has to remember to check.
 *
 * NO INDEX, AND NONE IS MISSING. The chart reads by date range, and `date` IS
 * the primary key — SQLite indexes it, so BETWEEN scans it. Section 2.5
 * declares none and is right to. This is worth stating rather than leaving to
 * be rediscovered by someone adding one "for the range queries".
 *
 * ## NO FOREIGN KEY TO `day`, AND THAT IS A DECISION RATHER THAN AN OMISSION
 *
 * The tempting shape is date REFERENCES day(date): both are civil dates, and a
 * weight belongs to a day in ordinary speech. It would be wrong. A day exists
 * only once MATERIALISED (specs 8.2), so the key would force a day into
 * existence to weigh on it — data created by consultation, which 8.2 forbids
 * outright. Weighing yourself on a day you logged no food is entirely ordinary.
 *
 * ## THE CHECK ON THE VALUE, WHERE THE MACROS GOT NONE
 *
 * Slice 3 refused every CHECK on the macros for one reason: specs 8.5 requires
 * Open Food Facts values to be FLAGGED AND EDITABLE, never refused, and slice 4
 * copies a scanned product into the database automatically. A CHECK there would
 * have turned a flaggable anomaly into a failed INSERT on that copy path.
 *
 * None of that holds here. There is no external source, no automatic copy, and
 * no path on which a value arrives without someone having typed it. And a
 * weight of zero or less is not a DOUBTFUL value to be corrected later — it is
 * an impossible one. Since value_kg is the only content this table has, a row
 * whose single value is absurd is not a degraded measurement; it is noise in a
 * regression specs 9.2 wants trustworthy.
 *
 * Precedent, so this is not an invention: ck_portion_quantity and
 * ck_recipe_yield_value are already positivity CHECKs on hand-typed values.
 *
 * NO UPPER BOUND. Inventing a maximum is legislating on what a body may weigh,
 * and a bound set too low refuses a legitimate measurement in silence.
 *
 * The cost, named: an archive repaired by hand carrying value_kg: 0 fails the
 * import on ck_weight_value rather than on a named row. That is the weaker
 * barrier by the food_portion.name argument — but the export catalogue has no
 * numeric rule at all (civil_date, entity_id, epoch_ms, one_of), and adding one
 * is the same deferral already taken for food.barcode's non_empty. The CHECK is
 * the net; the write boundary stays the first line, where it can say so in
 * French.
 */
export const weightMeasure = sqliteTable(
  'weight_measure',
  {
    date: text('date').$type<LocalDate>().primaryKey(),
    valueKg: real('value_kg').notNull(),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [check('ck_weight_value', sql`${table.valueKg} > 0`)],
);

/**
 * The closed set of goal modes (specs 6.2, schema 2.5).
 *
 * Declared ONCE, as data, with the type derived from it — the shape
 * PORTION_NAMES and YIELD_TYPES set. A union of literals cannot be walked at
 * runtime, so a hand-kept pair would be free to drift, and the place it would
 * drift is the import validator.
 *
 * Unlike the portion names these are NOT French: they are never displayed. The
 * screen says "par date cible" and "par rythme"; these are what the calculation
 * branches on.
 */
export const WEIGHT_GOAL_MODES = ['target_date', 'rate'] as const;

export type WeightGoalMode = (typeof WEIGHT_GOAL_MODES)[number];

/**
 * The weight goal (specs 6.2, 9.2, schema 2.5).
 *
 * > Poids cible. Défini au choix par date cible (le rythme en kg/semaine est
 * > calculé) ou par rythme visé (la date d'atteinte est estimée). Optionnel,
 * > modifiable, désactivable, supprimable.
 *
 * ## THE MODE CARRIES A CHECK, AND IT IS THE SAME CLASS AS journal_entry.kind
 *
 * The line is not how likely a set is to move but WHAT WIDENING IT WOULD BREAK.
 * `mode` drives the calculation: it decides which column is read and which
 * figure is derived from it. A third mode would fall through every branch and
 * produce a rate — a plausible, wrong one, with nothing to say so. That is
 * exactly why ck_entry_kind and ck_recipe_yield_type exist, and exactly why
 * food_portion.name has none: widening a vocabulary of labels breaks nothing.
 *
 * ## ck_weight_goal_terms IS THE DECISION OF THIS MIGRATION
 *
 * Specs 6.2 makes one of the two terms DERIVED from the other: give a target
 * date and the rate is calculated, give a rate and the date is estimated. D9
 * forbids storing what is derivable. So a row carrying both columns would be
 * either a breach of D9 or an ambiguity with no answer — which of the two is
 * authoritative? The CHECK makes that state INEXPRESSIBLE, which is strictly
 * better than a rule the write layer has to remember to apply.
 *
 * The other half matters just as much: a goal in 'rate' mode with no rate is a
 * goal NOBODY CAN READ, and nothing would report it. That is the defect the
 * four IS NOT NULL clauses of readDailyTargets exist to prevent, one table
 * over.
 *
 * Precedent: ck_ingredient_link, the one CHECK in this schema that is the only
 * barrier available, because a catalogue rule is per-column and this one spans
 * three.
 *
 * ck_weight_goal_mode is LOGICALLY IMPLIED by ck_weight_goal_terms — if the
 * mode is neither of the two, both branches are false. It is kept anyway: two
 * different facts deserve two different names in the error. "The mode is
 * unknown" and "the mode and its terms disagree" are not repaired the same way,
 * and D7 wants a file repairable by hand. It costs nothing.
 *
 * ## NO CHECK ON rate_kg_per_week, AND THAT IS A REFUSAL
 *
 * The rate is SIGNED: negative loses weight, positive gains it, and ZERO means
 * maintenance — "I want to stay at 75 kg" — which is a legitimate goal. There
 * is no bound that would not refuse a real case. A zero rate makes the
 * estimated date infinite, which is a case the calculation states rather than a
 * value the schema refuses.
 *
 * ## NO CHECK ON target_date
 *
 * Precedent planning_override.date: a civil date is not worth expressing as a
 * CHECK, and the export catalogue carries a civil_date rule that names the
 * table, the row index and the column instead of citing a constraint.
 *
 * ## NO INDEX ON defined_at
 *
 * Precedent day_template_meal: this table is bounded by the number of goals the
 * user sets, where an index buys nothing measurable — and an index is the one
 * part of a migration that can still be added later without rebuilding.
 */
export const weightGoal = sqliteTable(
  'weight_goal',
  {
    id: text('id').$type<WeightGoalId>().primaryKey(),
    targetKg: real('target_kg').notNull(),
    mode: text('mode').$type<WeightGoalMode>().notNull(),
    /** Set in 'target_date' mode only; the rate is then derived from it. */
    targetDate: text('target_date').$type<LocalDate>(),
    /** Set in 'rate' mode only; the date is then estimated from it. Signed. */
    rateKgPerWeek: real('rate_kg_per_week'),
    definedAt: integer('defined_at').notNull(),
    /** 0 or 1, never a boolean: every column must map to a JSON scalar. */
    isActive: integer('is_active').$type<0 | 1>().notNull().default(1),
  },
  (table) => [
    /**
     * AT MOST ONE ACTIVE GOAL, and the index is what makes it true.
     *
     * Specs 6.2 calls the goal "modifiable, désactivable, supprimable" without
     * saying how many may coexist, and 9.2 and 9.4 speak of it in the singular
     * throughout. Everything downstream assumes ONE: the gap to the target rate
     * compares against a rate, the curve carries a line. Two active goals would
     * need a tie-break nobody has written, and whichever one was picked would
     * produce a plausible figure against the wrong goal.
     *
     * PARTIAL, on the precedent of ux_food_barcode. Deactivated goals are kept
     * rather than deleted, because specs 6.2 lists "désactivable" and
     * "supprimable" as two different actions — so they must leave two different
     * traces — and they coexist freely outside the index.
     *
     * ## WHY THIS IS SAFE HERE AND WAS REFUSED ON day_meal
     *
     * Slice 5 refused a partial unique index on day_meal for a reason that does
     * not apply: a database in service already carries meals named by their
     * owner, so the index would have failed to build on exactly the data it
     * existed to protect. THIS TABLE IS NEW. No row exists anywhere, in any
     * database or any archive, so the index always builds.
     *
     * And it is the one part of a migration that is not irreversible: if a
     * history of goals ever needs several live at once, this is a DROP INDEX.
     */
    uniqueIndex('ux_weight_goal_active')
      .on(table.isActive)
      .where(sql`${table.isActive} = 1`),
    check('ck_weight_goal_mode', sql`${table.mode} IN ('target_date', 'rate')`),
    check(
      'ck_weight_goal_terms',
      sql`(${table.mode} = 'target_date' AND ${table.targetDate} IS NOT NULL AND ${table.rateKgPerWeek} IS NULL)
       OR (${table.mode} = 'rate' AND ${table.rateKgPerWeek} IS NOT NULL AND ${table.targetDate} IS NULL)`,
    ),
    check('ck_weight_goal_target', sql`${table.targetKg} > 0`),
    /** A boolean can never widen, so constraining it costs nothing, ever. */
    check('ck_weight_goal_active', sql`${table.isActive} IN (0, 1)`),
  ],
);

export type WeightMeasureRow = typeof weightMeasure.$inferSelect;
export type WeightGoalRow = typeof weightGoal.$inferSelect;
