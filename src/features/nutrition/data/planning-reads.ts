import { asc, eq } from 'drizzle-orm';
import { weekday, type LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  dayTemplate,
  dayTemplateMeal,
  planningOverride,
  planningWeekday,
  type DayTemplateId,
} from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { readSetting, SETTING_KEYS } from '@/features/settings/data/settings-reads';
import {
  fallbackDayPlan,
  type DayPlan,
  type PlannedMeal,
} from '../domain/day-plan';
import { readTargets, resolveTemplate, type PlanningLevel } from '../domain/planning';

/**
 * Reads of the templates and the planning (D8).
 *
 * Plain functions taking the database as a parameter, so they run in Node
 * against a real SQLite file (D15), and so they can be called from inside a
 * transaction — which materialisation needs, since it must resolve and freeze
 * without anything able to slip between the two.
 *
 * > Reading never writes.
 *
 * Nothing here inserts. A date the planning answers nothing for is answered
 * with the fallback plan, never by creating a template to point at.
 */

export interface TemplateSummary {
  id: DayTemplateId;
  name: string;
  mealCount: number;
}

export interface TemplateView {
  id: DayTemplateId;
  name: string;
  meals: PlannedMeal[];
}

export function readTemplates(db: AppDatabase): TemplateSummary[] {
  const templates = db
    .select({ id: dayTemplate.id, name: dayTemplate.name })
    .from(dayTemplate)
    .orderBy(asc(dayTemplate.name), asc(dayTemplate.id))
    .all();

  // One grouped read rather than a query per template: a handful of rows
  // either way, but a loop of queries is the shape that stops being a handful.
  const counts = new Map<DayTemplateId, number>();
  for (const row of db
    .select({ templateId: dayTemplateMeal.templateId })
    .from(dayTemplateMeal)
    .all()) {
    counts.set(row.templateId, (counts.get(row.templateId) ?? 0) + 1);
  }

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    mealCount: counts.get(template.id) ?? 0,
  }));
}

/** One template with its meals, or null once it has been deleted. */
export function readTemplate(db: AppDatabase, id: DayTemplateId): TemplateView | null {
  const rows = db
    .select({ id: dayTemplate.id, name: dayTemplate.name })
    .from(dayTemplate)
    .where(eq(dayTemplate.id, id))
    .all();

  const template = rows[0];
  if (template === undefined) return null;

  return { id: template.id, name: template.name, meals: readTemplateMeals(db, id) };
}

function readTemplateMeals(db: AppDatabase, id: DayTemplateId): PlannedMeal[] {
  return db
    .select({
      position: dayTemplateMeal.position,
      name: dayTemplateMeal.name,
      targetProtein: dayTemplateMeal.targetProtein,
      targetCarbs: dayTemplateMeal.targetCarbs,
      targetFat: dayTemplateMeal.targetFat,
      targetKcal: dayTemplateMeal.targetKcal,
    })
    .from(dayTemplateMeal)
    .where(eq(dayTemplateMeal.templateId, id))
    .orderBy(asc(dayTemplateMeal.position), asc(dayTemplateMeal.id))
    .all()
    .map((meal) => ({
      position: meal.position,
      name: meal.name,
      targets: readTargets(meal),
    }));
}

/**
 * The default template pointer, validated (specs 8.1, schema 2.1).
 *
 * THE ONE POINTER IN THE APPLICATION NO CONSTRAINT CAN PROTECT. It lives in
 * `setting`, a key/value table of TEXT, so there is no foreign key to declare
 * and nothing to cascade. It arrives here from three places that can all be
 * wrong: a template deleted by a code path that forgot to clear it, an
 * imported archive, and a row repaired by hand.
 *
 * So it is read the way settings-reads.ts already reads everything else — "a
 * missing key and a corrupted value are the same thing to a caller: the
 * default". Shape first, then existence. Returning null for a pointer that
 * names nothing is what makes a dangling default indistinguishable, to every
 * caller, from no default at all.
 *
 * Deleting a template also clears this key, in the same transaction. That is
 * the rule; this is the guarantee. They are not the same thing, and only one
 * of them survives an archive written by another binary.
 */
export function readDefaultTemplateId(db: AppDatabase): DayTemplateId | null {
  const raw = readSetting(db, SETTING_KEYS.defaultTemplateId);
  if (raw === null) return null;

  const id = toEntityId<DayTemplateId>(raw);
  if (id === null) return null;

  const rows = db
    .select({ id: dayTemplate.id })
    .from(dayTemplate)
    .where(eq(dayTemplate.id, id))
    .all();
  return rows[0]?.id ?? null;
}

export interface ResolvedDayPlan extends DayPlan {
  /** Which level answered, or null when nothing did. For the screens only. */
  level: PlanningLevel | null;
}

/**
 * What a date's planning prescribes, "in force at the moment of consultation"
 * (specs 8.2).
 *
 * ## ONLY CALLED FOR A VIRTUAL DAY, AND FOR MATERIALISATION
 *
 * A materialised day reads its own day_meal rows and never comes here. That is
 * the whole of "modifying a template does not retroactively affect
 * materialised days" (specs 8.1) — it is not a rule applied here, it is a
 * query that is not made. A future day already filled in is covered by the
 * same sentence, with no special case for being in the future.
 *
 * ## WHAT IT COSTS
 *
 * Three primary-key lookups and then the template with its meals: five small
 * reads at worst, on a local synchronous database, against D16's budget. All
 * three candidates are fetched even when the override answers, so the
 * precedence rule stays in one pure function instead of being re-expressed as
 * a chain of early returns here. Two redundant PK lookups is what that costs,
 * and it has not been measured because there is nothing to measure.
 *
 * ## THE ONE POINTER THAT CAN DANGLE
 *
 * planning_weekday and planning_override both carry a declared foreign key
 * with ON DELETE CASCADE, so neither can survive its template. The default
 * cannot have one — it lives in `setting`. So a resolution that names a
 * template no longer in the database can only have come from the default, and
 * it is answered here by falling back rather than by failing.
 */
export function readDayPlan(db: AppDatabase, date: LocalDate): ResolvedDayPlan {
  const override = db
    .select({ templateId: planningOverride.templateId })
    .from(planningOverride)
    .where(eq(planningOverride.date, date))
    .all();

  const recurring = db
    .select({ templateId: planningWeekday.templateId })
    .from(planningWeekday)
    // 1 is Monday. The conversion is core/date's, shipped in slice 0, and its
    // test names this table.
    .where(eq(planningWeekday.weekday, weekday(date)))
    .all();

  const resolved = resolveTemplate({
    override: override[0]?.templateId ?? null,
    weekday: recurring[0]?.templateId ?? null,
    fallback: readDefaultTemplateId(db),
  });

  if (resolved === null) return { ...fallbackDayPlan(), level: null };

  const template = readTemplate(db, resolved.templateId);
  if (template === null) return { ...fallbackDayPlan(), level: null };

  return {
    templateId: template.id,
    templateName: template.name,
    meals: template.meals,
    level: resolved.level,
  };
}

export interface WeekdayAssignment {
  /** ISO weekday, 1 being Monday. */
  weekday: number;
  templateId: DayTemplateId | null;
  templateName: string | null;
}

export interface OverrideAssignment {
  date: LocalDate;
  templateId: DayTemplateId;
  templateName: string;
}

export interface PlanningView {
  /** Always seven entries, Monday first, whether assigned or not. */
  week: WeekdayAssignment[];
  overrides: OverrideAssignment[];
  defaultTemplateId: DayTemplateId | null;
  defaultTemplateName: string | null;
}

/** The whole planning, for the screen that edits it (specs 8.8, 12). */
export function readPlanning(db: AppDatabase): PlanningView {
  const assigned = new Map(
    db
      .select({
        weekday: planningWeekday.weekday,
        templateId: planningWeekday.templateId,
        templateName: dayTemplate.name,
      })
      .from(planningWeekday)
      .innerJoin(dayTemplate, eq(dayTemplate.id, planningWeekday.templateId))
      .all()
      .map((row) => [row.weekday, row] as const),
  );

  // Seven rows always, so the screen renders a week rather than a list of the
  // days that happen to be configured.
  const week: WeekdayAssignment[] = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const row = assigned.get(day);
    return {
      weekday: day,
      templateId: row?.templateId ?? null,
      templateName: row?.templateName ?? null,
    };
  });

  const overrides = db
    .select({
      date: planningOverride.date,
      templateId: planningOverride.templateId,
      templateName: dayTemplate.name,
    })
    .from(planningOverride)
    .innerJoin(dayTemplate, eq(dayTemplate.id, planningOverride.templateId))
    .orderBy(asc(planningOverride.date))
    .all();

  const defaultTemplateId = readDefaultTemplateId(db);
  const defaultTemplate =
    defaultTemplateId === null ? null : readTemplate(db, defaultTemplateId);

  return {
    week,
    overrides,
    defaultTemplateId,
    defaultTemplateName: defaultTemplate?.name ?? null,
  };
}

export interface TemplateUsage {
  weekdays: number[];
  overrides: LocalDate[];
  isDefault: boolean;
}

/**
 * What a template is currently used for, so the deletion confirmation can name
 * it (specs 5.3 v2.2: a warning that names what goes, never a refusal).
 *
 * It counts ASSIGNMENTS, never materialised days. A past day carries its own
 * copy and is untouched by the deletion — saying otherwise would frighten the
 * user out of an operation that costs them nothing.
 */
export function readTemplateUsage(db: AppDatabase, id: DayTemplateId): TemplateUsage {
  const weekdays = db
    .select({ weekday: planningWeekday.weekday })
    .from(planningWeekday)
    .where(eq(planningWeekday.templateId, id))
    .orderBy(asc(planningWeekday.weekday))
    .all()
    .map((row) => row.weekday);

  const overrides = db
    .select({ date: planningOverride.date })
    .from(planningOverride)
    .where(eq(planningOverride.templateId, id))
    .orderBy(asc(planningOverride.date))
    .all()
    .map((row) => row.date);

  return { weekdays, overrides, isDefault: readDefaultTemplateId(db) === id };
}
