import type { DayTemplateId } from '@/core/db/schema';
import type { Macros } from './macros';

/**
 * Which template a date resolves to (specs 8.1, 8.2).
 *
 * > Assignment to a date: weekly recurrence, with the ability to override a
 * > single date without breaking the recurrence. A default template applies to
 * > any weekday with no assignment.
 *
 * > Until an action has taken place the day is virtual: its targets are
 * > deduced from the planning IN FORCE AT THE MOMENT OF CONSULTATION.
 *
 * Pure, importing nothing but types, the way change-bus-rules.ts and
 * version-rules.ts are pure: the part that decides is testable in Node and
 * only the SQL needs a database. The three lookups are the caller's job —
 * this module says what to do with their answers, and nothing about how to
 * get them.
 *
 * NOTHING HERE IS TIMEZONE-SENSITIVE, and that is worth stating once. The
 * planning is keyed by civil date and by ISO weekday, both derived from a
 * 'YYYY-MM-DD' string by core/date's integer arithmetic. There is no instant
 * anywhere in this file, so the three-zone suite has nothing new to catch —
 * it already covers weekday() itself, against this very table's numbering.
 */

/** Which level of the planning answered. Carried for the screens, not for the maths. */
export type PlanningLevel = 'override' | 'weekday' | 'default';

/** The three answers, gathered by the caller. Any of them may be absent. */
export interface PlanningCandidates {
  /** Assigned to this exact date (specs 8.1). Wins over everything. */
  override: DayTemplateId | null;
  /** Assigned to this ISO weekday, 1 being Monday. */
  weekday: DayTemplateId | null;
  /** The configured default, or null when none is set OR it no longer exists. */
  fallback: DayTemplateId | null;
}

export interface ResolvedTemplate {
  templateId: DayTemplateId;
  level: PlanningLevel;
}

/**
 * Override, then recurrence, then default — and null when the planning
 * designates nothing at all.
 *
 * That last case is not an error and not a corrupt state: it is a fresh
 * database, and it is also every database whose last template has just been
 * deleted. Specs 8.1 assumes a default always exists and never describes its
 * absence, which is a gap slice 1 already met and answered with a fallback
 * meal list. This function returning null is how that answer is reached.
 */
export function resolveTemplate(candidates: PlanningCandidates): ResolvedTemplate | null {
  if (candidates.override !== null) {
    return { templateId: candidates.override, level: 'override' };
  }
  if (candidates.weekday !== null) {
    return { templateId: candidates.weekday, level: 'weekday' };
  }
  if (candidates.fallback !== null) {
    return { templateId: candidates.fallback, level: 'default' };
  }
  return null;
}

/**
 * Reads the four target columns as one value, or as none.
 *
 * ALL FOUR OR NONE, the rule day-reads.ts already applies to day_meal: a
 * partial set would be a target nobody could read, and specs 8.1 describes a
 * meal as carrying "its own macro targets", plural and together.
 *
 * Shared by the template meals and the day meals precisely because
 * materialisation copies one onto the other (D5/R4): two readings of the same
 * four columns would be free to disagree on the day one of them changed.
 */
export function readTargets(row: {
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFat: number | null;
  targetKcal: number | null;
}): Macros | null {
  const { targetProtein, targetCarbs, targetFat, targetKcal } = row;
  if (
    targetProtein === null ||
    targetCarbs === null ||
    targetFat === null ||
    targetKcal === null
  ) {
    return null;
  }
  return {
    protein: targetProtein,
    carbs: targetCarbs,
    fat: targetFat,
    kcal: targetKcal,
  };
}
