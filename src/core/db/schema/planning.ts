import { sql } from 'drizzle-orm';
import { check, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { LocalDate } from '@/core/date';
import type { EntityId } from '@/core/id';

/**
 * Day templates and the planning that assigns them (schema 2.3, specs 8.1).
 *
 * Its own module rather than more of nutrition.ts, on the precedent off.ts
 * set: a nutrition sub-domain with its own vocabulary gets its own schema
 * file. Nothing here imports nutrition.ts, so there is no cycle — the arrow
 * runs the other way, day.template_id_snapshot borrowing DayTemplateId from
 * here.
 *
 * THE RULE THAT DECIDED WHAT SHIPS IN 0004, inherited from slice 3: a
 * migration carries what cannot be added later and defers what can. SQLite
 * does ALTER TABLE ADD COLUMN and CREATE/DROP INDEX freely; it cannot add a
 * CHECK or a foreign key without rebuilding the table. Everything irreversible
 * in this slice is in this file, and it is only the two foreign keys and one
 * CHECK.
 *
 * And the rule the whole schema obeys: EVERY COLUMN MUST MAP TO A JSON SCALAR.
 * The exporter reads columns straight off these objects and throws on anything
 * that is not a string, a finite number or null, so Drizzle's mode mappings are
 * excluded here as everywhere else.
 */

export type DayTemplateId = EntityId<'day_template'>;
export type DayTemplateMealId = EntityId<'day_template_meal'>;

/**
 * A day template (specs 8.1, schema 2.3).
 *
 * > Creation of an unlimited number of day templates. Each template meal
 * > carries its own macro targets. The template's targets are the sum of its
 * > meals', read only.
 *
 * So the template itself stores NO targets: a day's are the sum of its meals'
 * and are never stored (D9). Only the leaves carry numbers, which is the same
 * shape the journal already uses for grouped blocks.
 *
 * NO UNIQUE INDEX ON THE NAME. Section 2.3 declares none, and specs 5.3 blocks
 * nothing anywhere in this application; two templates called "Test" are the
 * user's business. Same unequal rigour already followed for (date, position)
 * on day_meal.
 *
 * created_at / updated_at are here because 2.3 spells them out for this table
 * and omits them for the other three, exactly as it does for day, day_meal and
 * food_portion.
 */
export const dayTemplate = sqliteTable('day_template', {
  id: text('id').$type<DayTemplateId>().primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

/**
 * The ordered meals of a template, each with its own targets (specs 8.1).
 *
 * The column list is deliberately day_meal's, because materialisation copies
 * one onto the other (D5/R4). A column here that day_meal lacked would be a
 * target the snapshot could not carry.
 *
 * Targets stay nullable, as 2.3 declares them: a "Collation" with no goal is
 * legitimate, and the day's targets sum only the meals that carry one. They
 * are read all-four-or-none, the rule day-reads.ts already applies to day_meal
 * — a partial set would be a target nobody could read.
 *
 * NO INDEX ON template_id, and that is a deferral rather than an omission.
 * Section 2.3 declares indexes where it wants them — ix_day_meal_date exists —
 * and day_meal grows without bound, one row per meal per materialised day, for
 * ever. This table is bounded by the number of templates the user creates. At
 * that scale an index buys nothing measurable, and an index is the one part of
 * a migration that can still be added later without rebuilding anything.
 */
export const dayTemplateMeal = sqliteTable('day_template_meal', {
  id: text('id').$type<DayTemplateMealId>().primaryKey(),
  templateId: text('template_id')
    .$type<DayTemplateId>()
    .notNull()
    .references(() => dayTemplate.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  targetProtein: real('target_protein'),
  targetCarbs: real('target_carbs'),
  targetFat: real('target_fat'),
  targetKcal: real('target_kcal'),
});

/**
 * The weekly recurrence: one template per weekday (specs 8.1, schema 2.3).
 *
 * ## THE FOREIGN KEY IS A DIVERGENCE FROM 2.3, AND IT IS THE DECISION OF 0004
 *
 * Section 2.3 declares template_id NOT NULL with no REFERENCES clause. SQLite
 * has no ALTER TABLE ADD CONSTRAINT, so what does not ship here can never ship
 * at all: the choice had to be made now or abandoned for good.
 *
 * ON DELETE CASCADE, and the asymmetry that settles it is already written into
 * 2.3 by someone else. day.template_id_snapshot is declared "informative, no
 * live link" and carries NO foreign key, because a cascade there would destroy
 * history. This table is the opposite: it is LIVE CONFIGURATION. A row naming
 * a template that no longer exists means nothing at all — it cannot render and
 * it cannot resolve. Removing it is the only coherent semantics, not a loss.
 *
 * ON DELETE RESTRICT was excluded by specs 5.3, which says no deletion is ever
 * blocked. CASCADE blocks nothing, so 5.3 is satisfied rather than bent.
 *
 * What it costs, paid at the interface and not in the schema: deleting a
 * template silently drops the weekdays it was assigned to. The confirmation
 * names the count, which is exactly the pattern specs 5.3 v2.2 sets for
 * deleting an exercise — a warning naming what goes, never a refusal.
 *
 * What NO foreign key would have cost, and this is what decided it: the import
 * would lose a barrier. foreign_key_check is barrier 3 of slice 2, and with no
 * key declared it could no longer tell a sound archive from one whose planning
 * points nowhere.
 *
 * THE CHECK exists for the reason ck_food_favorite does: a week will never
 * have an eighth day, so constraining it costs nothing, ever. It is also the
 * only barrier available — the export catalogue's one_of rule takes strings,
 * and this column is an integer. Not shipped here, never shipped.
 */
export const planningWeekday = sqliteTable(
  'planning_weekday',
  {
    /** ISO weekday: 1 is Monday (schema 2.3, specs 8.1 "the week starts on Monday"). */
    weekday: integer('weekday').primaryKey(),
    templateId: text('template_id')
      .$type<DayTemplateId>()
      .notNull()
      .references(() => dayTemplate.id, { onDelete: 'cascade' }),
  },
  (table) => [check('ck_planning_weekday', sql`${table.weekday} BETWEEN 1 AND 7`)],
);

/**
 * One-off overrides, taking precedence over the recurrence (specs 8.1).
 *
 * > Assignment to a date: weekly recurrence, with the ability to override a
 * > single date without breaking the recurrence.
 *
 * Keyed by civil date, so overriding the same date twice replaces rather than
 * accumulates — and "without breaking the recurrence" becomes structural:
 * deleting the override row restores the weekday's template with nothing to
 * undo and nothing to remember.
 *
 * Same foreign key, same reasoning as planning_weekday. No CHECK on the date:
 * a civil date is not expressible as one worth writing, day.date has none
 * either, and the export catalogue carries a civil_date rule that names the
 * table, the row index and the column instead of citing a constraint.
 */
export const planningOverride = sqliteTable('planning_override', {
  date: text('date').$type<LocalDate>().primaryKey(),
  templateId: text('template_id')
    .$type<DayTemplateId>()
    .notNull()
    .references(() => dayTemplate.id, { onDelete: 'cascade' }),
});

export type DayTemplateRow = typeof dayTemplate.$inferSelect;
export type DayTemplateMealRow = typeof dayTemplateMeal.$inferSelect;
export type PlanningWeekdayRow = typeof planningWeekday.$inferSelect;
export type PlanningOverrideRow = typeof planningOverride.$inferSelect;
