import type { LocalDate } from '@/core/date';
import { rollingMean } from '@/features/stats/domain/series';

/**
 * Smoothing the weight series (specs 9.2).
 *
 * > Lissage : moyenne mobile sur 7 jours. Les jours sans mesure sont ignorés,
 * > sans interpolation ; la moyenne porte sur les mesures disponibles dans la
 * > fenêtre.
 *
 * Pure (D9): no database, no React, no clock.
 *
 * ## IT BORROWS rollingMean RATHER THAN RESTATING IT
 *
 * The window arithmetic is already written, already tested, and already says
 * the right thing: the window is POSITIONS, not measurements, so seven days
 * back however many of them were weighed. Specs 9.2 is in fact where that
 * wording came from — stats/series.ts cites it verbatim to justify the same
 * rule for calories.
 *
 * What is added here is the one thing specs 9.2 asks for that calories do not,
 * and it is a mask rather than a different mean. rollingMean is not modified:
 * its behaviour is correct for the nutrition panel, and changing a shipped
 * function to serve a second caller is how two callers come to disagree.
 */

/** Specs 9.2: "moyenne mobile sur 7 jours". */
export const SMOOTHING_WINDOW_DAYS = 7;

export interface WeightPoint {
  date: LocalDate;
  /** What the scale said. Null on a day nobody weighed. */
  raw: number | null;
  /**
   * The seven-day mean AT THIS DATE, or null.
   *
   * Null on a day nobody weighed, even when the window around it is full —
   * that is specs 9.2 precision 1, and it is the whole reason this module is
   * not just a call to rollingMean.
   */
  smoothed: number | null;
}

/**
 * The smoothed series, holed the days nobody weighed (specs 9.2 precision 1).
 *
 * > Un point lissé n'existe que pour une date effectivement pesée. La courbe
 * > lissée est trouée les jours sans mesure ; elle n'est jamais prolongée
 * > artificiellement.
 *
 * ## WHY THE MASK IS NOT AN EXTRA CARE BUT THE POINT
 *
 * A trailing seven-day mean has a value at every position whose window holds
 * anything at all. So on a fortnight where someone weighed once and stopped,
 * the unmasked series would carry that one measurement forward for six more
 * days — drawing a flat line across a week that was never measured, and
 * drawing it in the one place a reader looks to see whether anything moved.
 *
 * That is exactly the "prolongée artificiellement" specs 9.2 forbids. The rule
 * costs nothing to apply and is invisible if forgotten, which is why it is
 * written down with its reason rather than left as a filter.
 *
 * The dates carry through untouched: the caller built them dense, gaps and all
 * (the reads densify), and a chart that dropped the empty positions would put
 * two points side by side that are three weeks apart.
 */
export function smoothSeries(
  dates: readonly LocalDate[],
  values: readonly (number | null)[],
  window: number = SMOOTHING_WINDOW_DAYS,
): WeightPoint[] {
  const means = rollingMean(values, window);

  return dates.map((date, index) => {
    const raw = values[index] ?? null;
    return {
      date,
      raw,
      // The mask. A position with no measurement of its own has no smoothed
      // point, whatever its window holds.
      smoothed: raw === null ? null : (means[index] ?? null),
    };
  });
}
