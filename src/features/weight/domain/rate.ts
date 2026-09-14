import { diffDays, type LocalDate } from '@/core/date';
import type { WeightPoint } from './smoothing';

/**
 * The real rate of change, by regression (specs 9.2).
 *
 * > Écart au rythme visé : rythme réel calculé par régression sur la série
 * > lissée des 14 derniers jours, comparé au rythme visé.
 *
 * Pure (D9): no database, no React, no clock. `today` is always a parameter.
 */

/** Specs 9.2: the regression window. */
export const RATE_WINDOW_DAYS = 14;

/**
 * Specs 9.2 precision 2: the floor below which no figure is shown.
 *
 * > Le rythme réel exige au moins 7 mesures sur les 14 derniers jours. En deçà,
 * > l'application affiche « données insuffisantes » EN DISANT POURQUOI, et non
 * > un chiffre. Une régression sur trois points produit une pente
 * > spectaculaire et fausse.
 */
export const RATE_MIN_POINTS = 7;

/**
 * How many days of measurement the regression needs LOADED to do its work.
 *
 * ## NOT FOURTEEN, AND THE COST OF GETTING IT WRONG IS MEASURED
 *
 * The regression runs on the SMOOTHED series over the last fourteen days. Each
 * smoothed point is itself a seven-day trailing mean, so the oldest point in
 * the window needs the six days BEFORE it to be computed at all.
 *
 * Reading exactly fourteen days does not fail. It computes the first six
 * smoothed points from SHORT windows, which on a falling series leaves them too
 * low, and fitting them flattens the line. On a perfectly straight loss of
 * 0.7 kg a week:
 *
 *   loaded 14, smoothed, fitted   →  -0.5438 kg/week   (22.3 % too slow)
 *   loaded 20, smoothed, last 14  →  -0.7000 kg/week   (exact)
 *
 * A full trailing mean over a straight line is that line shifted, so it keeps
 * the slope exactly — all of the error comes from the short windows at the
 * start, and all of it disappears by loading six more days.
 *
 * Nobody would ever have seen it: "vous perdez 0,54 kg par semaine" is a
 * perfectly believable sentence. Pinned by a test rather than trusted here.
 */
export const RATE_LOAD_DAYS = RATE_WINDOW_DAYS + 6;

export type RealRate =
  | {
      ok: true;
      /** Signed: negative loses weight. Kilograms per week. */
      kgPerWeek: number;
      /** How many smoothed points the slope was fitted on. */
      points: number;
    }
  | {
      ok: false;
      /** How many there actually are — specs 9.2 wants the reason SAID. */
      points: number;
      /** How many there would have to be. */
      required: number;
    };

/**
 * Least squares on the smoothed series of the last `RATE_WINDOW_DAYS` days.
 *
 * ## "AT LEAST 7 MEASUREMENTS" AND "AT LEAST 7 SMOOTHED POINTS" ARE THE SAME SET
 *
 * Specs 9.2 precision 2 counts MEASUREMENTS; the regression runs on smoothed
 * POINTS. They coincide exactly, and not by luck: precision 1 says a smoothed
 * point exists only for a date actually weighed, so the two conditions are one
 * condition. Worth stating, because reading the two sentences a fortnight apart
 * invites writing two different counts.
 *
 * ## THE X AXIS IS DAYS, NOT POSITIONS
 *
 * diffDays from the first point, so an irregular set of measurement dates fits
 * the slope it really has. Counting positions would make three weighings in a
 * row and three weighings a week apart produce the same rate.
 *
 * ## WHAT IT REFUSES TO ANSWER
 *
 * A single distinct x — every point on one date, which cannot happen through
 * the reads but can through a hand-repaired archive — gives a vertical line and
 * a division by zero. It reports insufficiency rather than Infinity: "données
 * insuffisantes" is a true statement about it, and a chart drawing an infinite
 * slope is not.
 */
export function realRate(points: readonly WeightPoint[]): RealRate {
  const measured = points.filter(
    (point): point is WeightPoint & { smoothed: number } => point.smoothed !== null,
  );

  if (measured.length < RATE_MIN_POINTS) {
    return { ok: false, points: measured.length, required: RATE_MIN_POINTS };
  }

  const first = measured[0];
  if (first === undefined) {
    return { ok: false, points: 0, required: RATE_MIN_POINTS };
  }

  const xs = measured.map((point) => diffDays(first.date, point.date));
  const ys = measured.map((point) => point.smoothed);

  const n = measured.length;
  const meanX = xs.reduce((total, x) => total + x, 0) / n;
  const meanY = ys.reduce((total, y) => total + y, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    covariance += dx * ((ys[index] ?? 0) - meanY);
    variance += dx * dx;
  }

  // Every point on the same day: no slope exists. Reported as insufficiency
  // rather than as Infinity, because that is what is true about it.
  if (variance === 0) {
    return { ok: false, points: n, required: RATE_MIN_POINTS };
  }

  // Kilograms per day, then per week — the unit specs 9.2 speaks in.
  return { ok: true, kgPerWeek: (covariance / variance) * 7, points: n };
}

/**
 * The last smoothed value of a series, or null.
 *
 * ## THE SMOOTHED VALUE, NEVER THE LAST MEASUREMENT
 *
 * This is what "current weight" means everywhere a calculation needs one — the
 * rate a target date implies, the distance left to the target. A single
 * measurement after a salty meal would otherwise move the goal from one day to
 * the next, and specs 9.2 already makes the smoothed series authoritative for
 * the rate. Extending it here is the same rule, not a new one.
 */
export function latestSmoothed(points: readonly WeightPoint[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.smoothed;
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** Days in a week, named so the conversions below read as what they are. */
export const DAYS_PER_WEEK = 7;

/** Weeks between two civil dates, fractional. Signed, like diffDays. */
export function weeksBetween(from: LocalDate, to: LocalDate): number {
  return diffDays(from, to) / DAYS_PER_WEEK;
}
