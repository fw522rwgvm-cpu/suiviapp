import {
  KCAL_PER_GRAM_CARBS,
  KCAL_PER_GRAM_FAT,
  KCAL_PER_GRAM_PROTEIN,
  theoreticalKcal,
  type Macros,
} from '@/features/nutrition/domain/macros';

/**
 * Aggregation of daily values (D9, specs 8.7 no 3).
 *
 * > Toute valeur quotidienne s'agrège par moyenne. La somme n'est licite que
 * > pour les compteurs.
 *
 * Pure functions on arrays of numbers. No database, no React, no clock.
 *
 * ## A GAP IS NOT A ZERO, AND THAT IS THE WHOLE MODULE
 *
 * Specs 8.7 no 3 says values are averaged and never says over which days. If a
 * day nobody logged counted as 0 kcal, the average would measure how diligently
 * the journal was kept rather than what was eaten — and point 1 of the very
 * same section refuses that reading for the adherence rate: "une journée sans
 * aucune entrée n'est pas un échec, c'est une absence de mesure."
 *
 * It is not an inference either, because the analogous case is already written
 * out normatively for weight (specs 9.2): "les jours sans mesure sont ignorés,
 * sans interpolation ; la moyenne porte sur les mesures disponibles dans la
 * fenêtre." The existing rule is applied to the analogous case rather than a
 * new one invented for it.
 *
 * So every function here takes `(number | null)[]`, null meaning "no
 * measurement", and every one of them ignores nulls rather than reading them
 * as zero.
 */

/**
 * The mean of the measurements there are, or null if there are none.
 *
 * Null rather than 0 or NaN: an average of nothing is not a small average, and
 * a screen has to be able to say "pas encore de données" rather than print a
 * figure nobody's eating produced.
 */
export function meanOf(values: readonly (number | null)[]): number | null {
  let total = 0;
  let count = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
    count += 1;
  }
  return count === 0 ? null : total / count;
}

/**
 * A rolling mean over the last `window` positions, gaps ignored.
 *
 * > Moyennes hebdomadaires glissantes. (Specs 8.7)
 *
 * One output per input position, so it lines up with the date axis without
 * anyone having to offset it. A position whose window holds no measurement at
 * all is null, which draws as a break in the line rather than as a dip to
 * zero — the same rule as everywhere else here.
 *
 * ## THE WINDOW IS POSITIONS, NOT MEASUREMENTS
 *
 * Seven days back, however many of them were logged, rather than the last
 * seven logged days. On a fortnight where only three days were written down,
 * the second reading would average across three weeks and call it a weekly
 * mean. Specs 9.2 says the same thing for weight in as many words: the mean
 * covers "les mesures disponibles DANS LA FENÊTRE", and the window is time.
 *
 * It is also TRAILING, never centred: a centred window would need days that
 * have not happened yet, so the last three points of any chart would be drawn
 * from less data than the rest without saying so.
 */
export function rollingMean(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const span = Math.max(1, Math.trunc(window));
  return values.map((_, index) => meanOf(values.slice(Math.max(0, index - span + 1), index + 1)));
}

/** The window specs 8.7 asks for: a week. */
export const WEEKLY_WINDOW_DAYS = 7;

export interface MacroSplit {
  /** Mean grams per recorded day. */
  grams: number;
  /** Share of the calories the three macros account for, 0 to 1. */
  share: number;
}

export interface MacroSplits {
  protein: MacroSplit;
  carbs: MacroSplit;
  fat: MacroSplit;
}

/**
 * The P / G / L split, in grams and as a percentage (specs 8.7).
 *
 * ## THE DENOMINATOR IS THE THEORETICAL KCAL, NOT THE RECORDED ONE
 *
 * A split has to sum to a hundred per cent or it is not a split, and only the
 * theoretical value does: 4P + 4C + 9F is, by construction, exactly the
 * calories the three macros account for.
 *
 * The recorded calories are something else. Specs 5.1 keeps a source's own
 * figure as given, and it is allowed to disagree with the macros by up to ten
 * per cent before anything is even said about it — alcohol, to take the case
 * this application already knows about, is seven kilocalories a gram and is
 * not a tracked macro, so a glass of wine adds calories that belong to none of
 * the three slices. Dividing by the recorded total would make the shares sum
 * to something other than a hundred, visibly, and there would be no honest way
 * to label the remainder.
 *
 * Which is why the calories are NOT a fourth slice here: they are what the
 * three come to, which is the same thing specs 5.1 says when it checks one
 * against the others.
 */
export function macroSplits(mean: Macros): MacroSplits {
  const kcal = theoreticalKcal(mean);
  // No calories means no split: three zero shares, not three NaNs.
  const shareOf = (grams: number, perGram: number): number =>
    kcal === 0 ? 0 : (grams * perGram) / kcal;

  // The same constants theoreticalKcal multiplies by, never the numbers typed
  // again: a split whose factors drifted from the total's would not sum to one
  // and nothing would say so.
  return {
    protein: { grams: mean.protein, share: shareOf(mean.protein, KCAL_PER_GRAM_PROTEIN) },
    carbs: { grams: mean.carbs, share: shareOf(mean.carbs, KCAL_PER_GRAM_CARBS) },
    fat: { grams: mean.fat, share: shareOf(mean.fat, KCAL_PER_GRAM_FAT) },
  };
}
