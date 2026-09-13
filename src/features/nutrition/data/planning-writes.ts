import { eq } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  day,
  dayMeal,
  dayTemplate,
  dayTemplateMeal,
  planningOverride,
  planningWeekday,
  type DayTemplateId,
  type DayTemplateMealId,
} from '@/core/db/schema';
import { newId } from '@/core/id';
import { SETTING_KEYS } from '@/features/settings/data/settings-reads';
import { clearSetting, writeSetting } from '@/features/settings/data/settings-writes';
import { readDayPlan, readDefaultTemplateId } from './planning-reads';
import type { Macros } from '../domain/macros';

/**
 * Writes to the templates and the planning (D8).
 *
 * > Reads are hooks. Writes are transactional functions carrying the business
 * > rules.
 *
 * Nothing here imports a native module, so all of it runs against a real
 * SQLite file in Node (D15), and nothing here enumerates a query to
 * invalidate: a write touches a table, SQLite reports it, and the change bus
 * invalidates whatever declared reading it.
 */

/** A meal as the editing screen collects it, before it has any identifier. */
export interface TemplateMealInput {
  name: string;
  /** All four or none (specs 8.1). A meal with no goal is legitimate. */
  targets: Macros | null;
}

function insertMeals(
  tx: AppDatabase,
  templateId: DayTemplateId,
  meals: readonly TemplateMealInput[],
): void {
  // Drizzle refuses an empty VALUES list, and a template with no meal is
  // legitimate: specs 8.3 already lets a materialised day be emptied of every
  // one of its meals, so the shape it was copied from may be empty too.
  if (meals.length === 0) return;

  tx.insert(dayTemplateMeal)
    .values(
      meals.map((meal, position) => ({
        id: newId<DayTemplateMealId>(),
        templateId,
        // Position comes from the order the screen hands them in, never from
        // the caller: a list is ordered by being a list, and letting a caller
        // pass positions would make gaps and duplicates its problem to avoid.
        position,
        name: meal.name,
        targetProtein: meal.targets?.protein ?? null,
        targetCarbs: meal.targets?.carbs ?? null,
        targetFat: meal.targets?.fat ?? null,
        targetKcal: meal.targets?.kcal ?? null,
      })),
    )
    .run();
}

export interface TemplateInput {
  name: string;
  meals: readonly TemplateMealInput[];
}

/** Creates a template and its meals, in one transaction (specs 8.1). */
export function createTemplate(db: AppDatabase, input: TemplateInput): DayTemplateId {
  return db.transaction((tx) => {
    const id = newId<DayTemplateId>();
    const now = Date.now();

    tx.insert(dayTemplate)
      .values({ id, name: input.name, createdAt: now, updatedAt: now })
      .run();
    insertMeals(tx, id, input.meals);

    return id;
  });
}

/**
 * Replaces a template's name and its whole meal list.
 *
 * THE MEALS ARE REPLACED IN BULK, NOT RECONCILED ROW BY ROW, for the reason
 * slice 3 established for portions: the machinery of a row-by-row
 * reconciliation would serve identifiers THAT NOTHING REFERENCES. A day copies
 * a template meal's name and targets into its own day_meal row at
 * materialisation; no column anywhere points back at day_template_meal.id. So
 * letting those identifiers change costs nothing and makes reordering,
 * renaming and deleting one single operation.
 *
 * What this does to days already materialised: nothing at all, which is specs
 * 8.1 in as many words. Their meals are their own rows. What it does to the
 * recurrence and to the overrides: nothing either — they name the template,
 * not its meals, so the next day materialised under it simply gets the new
 * list. And a VIRTUAL day renders the new list immediately, which is specs 8.2
 * read literally: a virtual day's targets come from the planning in force at
 * the moment of consultation.
 */
export function updateTemplate(
  db: AppDatabase,
  id: DayTemplateId,
  input: TemplateInput,
): void {
  db.transaction((tx) => {
    const updated = tx
      .update(dayTemplate)
      .set({ name: input.name, updatedAt: Date.now() })
      .where(eq(dayTemplate.id, id))
      .returning({ id: dayTemplate.id })
      .all();

    if (updated.length === 0) {
      throw new Error(`No day template ${id} to update`);
    }

    tx.delete(dayTemplateMeal).where(eq(dayTemplateMeal.templateId, id)).run();
    insertMeals(tx, id, input.meals);
  });
}

/**
 * Deletes a template. Never blocked (specs 5.3).
 *
 * ## WHAT GOES WITH IT, AND WHAT DOES NOT
 *
 * Its meals, its weekday assignments and its overrides go, by cascade — they
 * are live configuration, and a row naming a template that no longer exists
 * can neither render nor resolve. Every materialised day stays exactly as it
 * was: day.template_id_snapshot carries no foreign key precisely so that
 * history survives this (specs 5.2).
 *
 * ## THE DEFAULT POINTER IS CLEARED HERE, IN THE SAME TRANSACTION
 *
 * It lives in `setting` and no constraint can protect it, so the cascade
 * cannot reach it. Doing it here is THE RULE; readDefaultTemplateId checking
 * that the template still exists is THE GUARANTEE. Both are needed and they
 * are not the same: an archive written by another binary, or a settings row
 * repaired by hand, reaches the reader without ever passing through here.
 *
 * The transaction is what makes the pair honest. A forced quit between the
 * delete and the clear — and specs 2.2 says that can happen at any moment —
 * would otherwise leave a pointer naming a template that is already gone.
 */
export function deleteTemplate(db: AppDatabase, id: DayTemplateId): void {
  db.transaction((tx) => {
    if (readDefaultTemplateId(tx) === id) {
      clearSetting(tx, SETTING_KEYS.defaultTemplateId);
    }
    tx.delete(dayTemplate).where(eq(dayTemplate.id, id)).run();
  });
}

/**
 * Assigns a template to a weekday, or clears the assignment (specs 8.1).
 *
 * `weekday` is ISO: 1 is Monday. Callers get it from core/date's weekday(),
 * never from Date.getDay(), which numbers Sunday zero. The CHECK in 0004
 * refuses anything outside 1..7, so a caller that got it wrong fails loudly
 * rather than writing a row nothing will ever match.
 */
export function assignWeekday(
  db: AppDatabase,
  isoWeekday: number,
  templateId: DayTemplateId | null,
): void {
  if (templateId === null) {
    db.delete(planningWeekday).where(eq(planningWeekday.weekday, isoWeekday)).run();
    return;
  }

  db.insert(planningWeekday)
    .values({ weekday: isoWeekday, templateId })
    .onConflictDoUpdate({ target: planningWeekday.weekday, set: { templateId } })
    .run();
}

/**
 * Overrides a single date, or removes the override (specs 8.1).
 *
 * > The ability to override a single date WITHOUT BREAKING the recurrence.
 *
 * Structural rather than careful: the override is its own row, keyed by date,
 * and removing it restores the weekday's template with nothing to undo and
 * nothing to remember. Overriding the same date twice replaces.
 *
 * Setting an override changes nothing on a day already materialised — it is
 * read only while the day is virtual.
 */
export function setOverride(
  db: AppDatabase,
  date: LocalDate,
  templateId: DayTemplateId | null,
): void {
  if (templateId === null) {
    db.delete(planningOverride).where(eq(planningOverride.date, date)).run();
    return;
  }

  db.insert(planningOverride)
    .values({ date, templateId })
    .onConflictDoUpdate({ target: planningOverride.date, set: { templateId } })
    .run();
}

/**
 * Designates the default template, or clears it (specs 8.1, 8.8).
 *
 * Stored as a setting rather than a column, because `setting` exists precisely
 * so that remembering one value never costs a migration. The price is the one
 * pointer no constraint can protect — see readDefaultTemplateId.
 */
export function setDefaultTemplate(db: AppDatabase, templateId: DayTemplateId | null): void {
  if (templateId === null) {
    clearSetting(db, SETTING_KEYS.defaultTemplateId);
    return;
  }
  writeSetting(db, SETTING_KEYS.defaultTemplateId, templateId);
}

/**
 * Applies today's planning targets to a day that is ALREADY materialised.
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * Every day materialised before 0004 has no targets, and never will on its
 * own: a materialised day does not consult the planning (specs 8.1). Today is
 * one of them the moment breakfast is logged — so without this, the banner
 * would stay mute on the very day the user finishes setting up their first
 * template, which is the day it was supposed to start meaning something.
 *
 * It is NOT a retroactive effect, and the distinction is the whole
 * justification: specs 8.2 makes the user's action on a day the act that
 * defines it. This is an action on this day, taken deliberately, once. What
 * 8.1 forbids is a template edit reaching a materialised day BY ITSELF, and
 * nothing here happens by itself.
 *
 * The alternative that was refused: letting a materialised day with no targets
 * fall back to the planning at read time. That is the same rewriting through
 * the back door — editing a template would silently move the banner on days
 * months old.
 *
 * ## WHAT IT TOUCHES, AND WHAT IT REFUSES TO TOUCH
 *
 * The four target columns, matched BY POSITION. Never the names, never the
 * number of meals, never an entry. A materialised day holds meals the user may
 * have renamed, added or deleted, and those meals hold entries: deleting one
 * to match the template would destroy data, and renaming one would overwrite a
 * choice. So the button says "apply the TARGETS of X" rather than "apply X",
 * and the promise is exactly what happens.
 *
 * Meals beyond the template's count have their targets cleared rather than
 * left as they were. Applying a set of targets means the day carries that set
 * and no remnant of an earlier one.
 */
export function applyPlanTargetsToDay(db: AppDatabase, date: LocalDate): void {
  db.transaction((tx) => applyPlanTargets(tx, date));
}

/**
 * The body of the above, without a transaction of its own.
 *
 * Split out so setDayTemplate can run it INSIDE the transaction that writes the
 * override, rather than opening a second one. Nesting is a thing SQLite can be
 * asked to do with savepoints and a thing neither driver promises here, and a
 * write whose two halves can land separately is exactly what this function
 * exists to prevent.
 */
function applyPlanTargets(tx: AppDatabase, date: LocalDate): void {
  {
    const existing = tx.select({ date: day.date }).from(day).where(eq(day.date, date)).all();
    if (existing.length === 0) {
      // Materialising here would create a day out of a settings gesture, which
      // specs 8.2 forbids — and a virtual day needs nothing applied to it, it
      // already reads the planning directly.
      throw new Error(`Day ${date} is not materialised; nothing to apply targets to`);
    }

    const plan = readDayPlan(tx, date);
    if (plan.templateId === null) {
      throw new Error(`The planning designates no template for ${date}`);
    }

    const planned = new Map(plan.meals.map((meal) => [meal.position, meal.targets]));
    const meals = tx
      .select({ id: dayMeal.id, position: dayMeal.position })
      .from(dayMeal)
      .where(eq(dayMeal.date, date))
      .all();

    for (const meal of meals) {
      const targets = planned.get(meal.position) ?? null;
      tx.update(dayMeal)
        .set({
          targetProtein: targets?.protein ?? null,
          targetCarbs: targets?.carbs ?? null,
          targetFat: targets?.fat ?? null,
          targetKcal: targets?.kcal ?? null,
        })
        .where(eq(dayMeal.id, meal.id))
        .run();
    }

    // The snapshot is rewritten too: the day now carries this template's
    // targets, so naming a different one — or none — would be a record that
    // disagrees with the numbers beside it.
    tx.update(day)
      .set({ templateIdSnapshot: plan.templateId, templateNameSnapshot: plan.templateName })
      .where(eq(day.date, date))
      .run();
  }
}

/**
 * Says which template a single day follows, and makes it true in both regimes
 * (specs 8.1, 8.2).
 *
 * ## WHY IT IS NOT JUST AN OVERRIDE
 *
 * An override is read only while a day is VIRTUAL. On a materialised day it
 * writes a row that changes nothing on screen — the day holds its own meals and
 * never consults the planning again (specs 8.1). Offering "change the template"
 * there and having nothing happen would be the worst of both: a control that
 * lies.
 *
 * So the two halves go together. The override is recorded, because that is what
 * the user said; and if the day already exists, the chosen template's targets
 * are applied to it as well. That is not the retroactive effect 8.1 forbids —
 * 8.2 makes the user's action on a day the act that defines it, and this is an
 * action on this day, taken deliberately, once.
 *
 * ## ONE TRANSACTION, AND THAT IS THE POINT
 *
 * Two writes could land apart: an override set on a day whose figures never
 * moved, which reads as the feature silently failing rather than as half of it
 * having worked. Specs 2.2 says the application can be killed at any moment.
 *
 * Passing null clears the override and lets the recurrence answer again. On a
 * materialised day the recurrence's own template is then applied — "follow the
 * planning" has to mean the same thing in both regimes, or it means nothing on
 * one of them.
 */
export function setDayTemplate(
  db: AppDatabase,
  input: { date: LocalDate; templateId: DayTemplateId | null },
): void {
  db.transaction((tx) => {
    setOverride(tx, input.date, input.templateId);

    const existing = tx
      .select({ date: day.date })
      .from(day)
      .where(eq(day.date, input.date))
      .all();

    // A virtual day needs nothing else: it reads the planning directly, and
    // materialising it here would create data out of a choice rather than out
    // of an entry (specs 8.2).
    if (existing.length === 0) return;

    // Nothing to apply when the planning now designates nothing at all — the
    // day keeps the targets it has rather than losing them to a clearing
    // gesture nobody made.
    if (readDayPlan(tx, input.date).templateId === null) return;

    applyPlanTargets(tx, input.date);
  });
}
