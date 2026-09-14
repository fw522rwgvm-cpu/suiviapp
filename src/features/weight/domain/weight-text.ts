import { formatLongDate, formatRate, formatWeight } from '@/core/format';
import type { LocalDate } from '@/core/date';
import type { RealRate } from './rate';
import { RATE_WINDOW_DAYS } from './rate';
import type { GoalProblem, Projection, TargetRate, WeightGoal } from './weight-goal';

/**
 * The French the weight panel says (specs 9.2, 9.4).
 *
 * Pure strings from pure values: nothing here reads a database, a clock or a
 * theme. Gathered in one module for the reason library-text.ts and
 * recipe-text.ts were — a sentence written inline in a component is a sentence
 * no test can reach, and several of these are the difference between a figure
 * that informs and a figure that misleads.
 */

/**
 * Why no rate can be given, said in full (specs 9.2 precision 2).
 *
 * > En deçà, l'application affiche « données insuffisantes » EN DISANT
 * > POURQUOI, et non un chiffre.
 *
 * "En disant pourquoi" is normative, and it is the reason realRate returns a
 * count rather than a bare null: the sentence has to name how many there are
 * and how many are needed. A lone "données insuffisantes" would leave someone
 * with four measurements unable to tell whether they need one more or ten.
 */
export function insufficientRateText(points: number, required: number): string {
  const measured =
    points === 0
      ? 'aucune mesure'
      : points === 1
        ? '1 mesure'
        : `${points} mesures`;

  return `Données insuffisantes : ${measured} sur les ${RATE_WINDOW_DAYS} derniers jours, il en faut ${required}.`;
}

/** The real rate, or the sentence explaining its absence. */
export function rateText(rate: RealRate): string {
  return rate.ok ? formatRate(rate.kgPerWeek) : insufficientRateText(rate.points, rate.required);
}

/** "Objectif : 76,0 kg" — what the goal is, whichever mode defined it. */
export function goalTargetText(goal: WeightGoal): string {
  return `Objectif : ${formatWeight(goal.targetKg)}`;
}

/**
 * The rate being aimed at, or why there is none.
 *
 * A goal whose target date has passed is the case worth writing out: it is not
 * an error and not corruption, it is a goal that has come due, and saying so is
 * more use than hiding the row.
 */
export function aimedRateText(aimed: TargetRate): string {
  if (aimed.ok) return formatRate(aimed.kgPerWeek);
  return aimed.reason === 'date_passed'
    ? 'La date visée est passée'
    : 'Aucune pesée récente';
}

/** When the target is expected, or why it is not expected at all. */
export function projectionText(projection: Projection): string {
  if (projection.ok) return `Atteint vers le ${formatLongDate(projection.date)}`;

  switch (projection.reason) {
    case 'reached':
      return 'Objectif atteint';
    case 'maintaining':
      // A rate of zero is a goal, not a failure to set one.
      return 'Maintien : pas de date d’atteinte';
    case 'wrong_way':
      // Gaining while aiming lower. The honest answer is that this never
      // arrives — never a date in the past dressed up as a projection.
      return 'Au rythme visé, l’objectif s’éloigne';
    case 'no_weight':
      return 'Aucune pesée récente';
  }
}

/**
 * The gap to the aimed rate, in words (specs 9.2, 9.4).
 *
 * ## IT NAMES THE DIFFERENCE AND REFUSES TO JUDGE IT
 *
 * "En avance" and "en retard" were written first and are wrong for half the
 * goals: someone bulking at +0.5 who aims for +0.3 has the same POSITIVE gap as
 * someone cutting at -0.3 who aims for -0.5, and those are opposite situations.
 * Deciding which is good needs the direction of travel, which belongs to the
 * screen and not to a sentence.
 *
 * So it states the size of the difference, and lets the two rates sit beside it
 * saying the rest.
 */
export function gapText(gapKgPerWeek: number | null): string | null {
  if (gapKgPerWeek === null) return null;

  const rounded = Math.round(gapKgPerWeek * 100) / 100;
  if (rounded === 0) return 'Exactement au rythme visé';

  return `Écart au rythme visé : ${formatRate(rounded)}`;
}

/** What a rejected goal draft is wrong about, in the order the form reads. */
export function goalProblemText(problem: GoalProblem): string {
  switch (problem) {
    case 'target_not_positive':
      return 'Indiquez un poids cible.';
    case 'target_date_missing':
      return 'Indiquez une date cible.';
    case 'target_date_not_future':
      return 'La date cible doit être postérieure à aujourd’hui.';
    case 'rate_missing':
      return 'Indiquez un rythme, même nul pour un maintien.';
  }
}

/** "Défini le 15 septembre 2026" — for a retired goal in the list. */
export function definedAtText(date: LocalDate): string {
  return `Défini le ${formatLongDate(date)}`;
}
