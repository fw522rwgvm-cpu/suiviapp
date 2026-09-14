import { addDays, compareLocalDate, type LocalDate } from '@/core/date';
import type { WeightGoalMode } from '@/core/db/schema';
import { DAYS_PER_WEEK, weeksBetween } from './rate';

/**
 * The weight goal, and the figure each mode derives (specs 6.2, 9.2).
 *
 * > Poids cible. Défini au choix par DATE CIBLE (le rythme en kg/semaine est
 * > calculé) ou par RYTHME VISÉ (la date d'atteinte est estimée).
 *
 * Pure (D9): no database, no React, no clock. `today` is always a parameter.
 *
 * ## THE DERIVED HALF IS NEVER STORED, AND ck_weight_goal_terms ENFORCES IT
 *
 * One of the two terms is a function of the other and of the current weight, so
 * D9 rules out keeping it. The schema goes further and makes a row carrying
 * both INEXPRESSIBLE, which is why nothing here has to decide which would win.
 *
 * A consequence that is easy to mistake for a bug: in target_date mode the
 * target RATE MOVES EVERY DAY, because the distance left and the time left both
 * change. That is correct — it is the rate you would now have to hold — and it
 * is exactly why it is derived rather than frozen at the moment the goal was
 * set.
 */

export interface WeightGoal {
  targetKg: number;
  mode: WeightGoalMode;
  /** Set in 'target_date' mode only. */
  targetDate: LocalDate | null;
  /** Set in 'rate' mode only. Signed: negative loses weight. */
  rateKgPerWeek: number | null;
}

/**
 * How close is close enough to call a target reached.
 *
 * A hundred grams: one notch on a domestic scale, and below the precision any
 * measurement here actually has. Without it, "reached" would be an exact
 * equality of two floating-point numbers, which never happens — so the screen
 * would forever say a few grams remain.
 */
export const GOAL_REACHED_TOLERANCE_KG = 0.1;

export type TargetRate =
  | { ok: true; kgPerWeek: number }
  /** The target date is today or past: there is no span left to spread over. */
  | { ok: false; reason: 'date_passed' }
  /** No current weight to measure the distance from. */
  | { ok: false; reason: 'no_weight' };

export type Projection =
  | { ok: true; date: LocalDate; weeks: number }
  | { ok: false; reason: 'reached' }
  /** A rate of zero — maintenance, which is a goal rather than an error. */
  | { ok: false; reason: 'maintaining' }
  /** The rate moves away from the target: gaining while aiming lower. */
  | { ok: false; reason: 'wrong_way' }
  | { ok: false; reason: 'no_weight' };

/**
 * The rate a target date implies, given where the weight is now.
 *
 * `currentKg` is the LAST SMOOTHED VALUE, never the last measurement — see
 * latestSmoothed for why.
 */
export function targetRate(
  goal: WeightGoal,
  currentKg: number | null,
  today: LocalDate,
): TargetRate {
  if (goal.mode === 'rate') {
    // Nothing to derive: the user gave this one directly. The schema
    // guarantees it is present in this mode, and `?? 0` is only what the type
    // needs rather than a fallback anyone should ever meet.
    return { ok: true, kgPerWeek: goal.rateKgPerWeek ?? 0 };
  }

  if (goal.targetDate === null) return { ok: false, reason: 'date_passed' };
  if (currentKg === null) return { ok: false, reason: 'no_weight' };

  const weeks = weeksBetween(today, goal.targetDate);
  // Today or past. Not an error state to hide: a goal whose date has come is
  // exactly what someone needs to be told about.
  if (weeks <= 0) return { ok: false, reason: 'date_passed' };

  return { ok: true, kgPerWeek: (goal.targetKg - currentKg) / weeks };
}

/**
 * The date a rate implies, given where the weight is now.
 *
 * ## THE THREE REFUSALS ARE NOT ERROR HANDLING, THEY ARE THE ANSWER
 *
 * A rate of zero is MAINTENANCE — a legitimate goal, and the reason no CHECK
 * bounds the rate — but it reaches nothing new, so there is no date. A rate
 * pointing away from the target is someone gaining while aiming lower: the
 * honest answer is that this never arrives, not a date in the past dressed up
 * as a projection. And a target already met is met.
 *
 * Each returns its own reason so the screen can say which, rather than printing
 * one apologetic sentence for three different situations.
 */
export function projectedDate(
  goal: WeightGoal,
  currentKg: number | null,
  today: LocalDate,
): Projection {
  if (currentKg === null) return { ok: false, reason: 'no_weight' };

  const remaining = goal.targetKg - currentKg;
  if (Math.abs(remaining) <= GOAL_REACHED_TOLERANCE_KG) {
    return { ok: false, reason: 'reached' };
  }

  if (goal.mode === 'target_date') {
    // The user gave the date. Nothing to project — it is the input.
    return goal.targetDate === null
      ? { ok: false, reason: 'no_weight' }
      : { ok: true, date: goal.targetDate, weeks: weeksBetween(today, goal.targetDate) };
  }

  const rate = goal.rateKgPerWeek ?? 0;
  if (rate === 0) return { ok: false, reason: 'maintaining' };
  // Signs disagree: the rate moves away from the target, for ever.
  if (Math.sign(rate) !== Math.sign(remaining)) return { ok: false, reason: 'wrong_way' };

  const weeks = remaining / rate;
  return { ok: true, date: addDays(today, Math.round(weeks * DAYS_PER_WEEK)), weeks };
}

/** What a draft goal can be wrong about, before anything is written. */
export type GoalProblem =
  | 'target_not_positive'
  | 'target_date_missing'
  | 'target_date_not_future'
  | 'rate_missing';

export interface WeightGoalDraft {
  targetKg: number | null;
  mode: WeightGoalMode;
  targetDate: LocalDate | null;
  rateKgPerWeek: number | null;
}

/**
 * What the write boundary refuses, and why some of it cannot be a CHECK.
 *
 * Three of these four the schema also enforces — ck_weight_goal_target and
 * ck_weight_goal_terms — and that is deliberate: the CHECK is the net, this is
 * the first line, because only this one can name the field in French.
 *
 * `target_date_not_future` is the one NO CHECK COULD EVER CARRY, and it is
 * worth saying out loud: "in the future" is not a property of the row, it is a
 * relation between the row and the clock. It changes on its own overnight.
 * A CHECK is evaluated at write time and would then be silently false for every
 * goal that ages past its date — which is not corruption, it is a goal whose
 * day has come. So it lives here, where it can be a message rather than a
 * constraint, and the row stays perfectly legal once the date passes.
 */
export function validateGoalDraft(draft: WeightGoalDraft, today: LocalDate): GoalProblem[] {
  const problems: GoalProblem[] = [];

  if (draft.targetKg === null || !Number.isFinite(draft.targetKg) || draft.targetKg <= 0) {
    problems.push('target_not_positive');
  }

  if (draft.mode === 'target_date') {
    if (draft.targetDate === null) {
      problems.push('target_date_missing');
    } else if (compareLocalDate(draft.targetDate, today) <= 0) {
      problems.push('target_date_not_future');
    }
  } else if (draft.rateKgPerWeek === null || !Number.isFinite(draft.rateKgPerWeek)) {
    // Zero is allowed: maintenance is a goal. Only absence is a problem.
    problems.push('rate_missing');
  }

  return problems;
}
