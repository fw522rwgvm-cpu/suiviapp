import { addDays, compareLocalDate, diffDays, type LocalDate } from '@/core/date';
import type { Grain } from '@/core/db/date-bucket';

/**
 * The ranges of the weight panel, and the grain each one is read at
 * (specs 9.2, D9, D13).
 *
 * Pure: nothing here reads a clock or a database. `today` is always a
 * parameter, so this module answers the same at +14 as in Paris.
 *
 * ## THIS IS WHERE D9's AGGREGATION RULE FINALLY HAS A CUSTOMER
 *
 * > Regroupement par semaine au-delà de 90 jours, par mois au-delà d'un an.
 *
 * Slice 7 never touched it: specs 8.7 offers 7, 30 and 90 days, and "beyond
 * 90" does not include 90, so every nutrition range was one point per day.
 * Specs 9.2 offers "1 an" and "tout", and three years of daily weights is a
 * thousand values on four hundred pixels — which is the case D13 says must be
 * settled in SQL rather than in the rendering library.
 */

/**
 * The ranges the weight panel offers.
 *
 * SPECS 9.2 SAID "30 jours / 90 jours / 1 an / tout"; this is seven days,
 * thirty, ninety and a year. Requested, and amended rather than diverged from
 * (specs 14.17): "tout" is gone and a week takes its place.
 *
 * Seven days only became defensible with the smoothing lead below. Without it,
 * six of a week's seven smoothed points would be computed from short windows —
 * not merely soft, but pulled towards the start of the range, which is the same
 * bias that made a fourteen-day regression read 22 % slow.
 */
export const WEIGHT_RANGE_KEYS = ['7', '30', '90', '365'] as const;

/**
 * Derived from the array rather than written beside it, the shape PORTION_NAMES
 * set: a union of literals cannot be walked at runtime, so a hand-kept pair
 * would be free to disagree — and the place it would disagree is the control
 * that offers the choice.
 */
export type WeightRangeKey = (typeof WEIGHT_RANGE_KEYS)[number];

/**
 * The range the panel opens on.
 *
 * SEVEN DAYS, requested (specs 14.24), and the same value as the nutrition
 * panel's so the two tabs open on the same span rather than on two.
 *
 * It is only honest because of the smoothing lead above: a week read without it
 * would compute six of its seven smoothed points from short windows.
 */
export const DEFAULT_WEIGHT_RANGE: WeightRangeKey = '7';

/** "90 jours", for the range control. */
export function weightRangeLabel(key: WeightRangeKey): string {
  switch (key) {
    case '7':
      return '7 jours';
    case '30':
      return '30 jours';
    case '90':
      return '90 jours';
    case '365':
      return '1 an';
  }
}

/** D9: "au-delà de 90 jours". Ninety itself is not beyond ninety. */
export const WEEKLY_BEYOND_DAYS = 90;
/** D9: "au-delà d'un an". */
export const MONTHLY_BEYOND_DAYS = 365;

/**
 * Re-exported so a caller reasoning about ranges has one import rather than
 * two. It is DEFINED in core/db/date-bucket, beside the SQL that groups by it —
 * two features bucket on it, and a second spelling would let one chart's series
 * sit six days off the other's.
 */
export type { Grain };

export interface WeightRange {
  from: LocalDate;
  to: LocalDate;
  /** Civil days spanned, both ends included. */
  days: number;
  grain: Grain;
  /**
   * Whether the raw series is drawn (specs 9.2 precision 3).
   *
   * > Au-delà de 90 jours de plage, la courbe brute disparaît. Agrégées par
   * > semaine ou par mois, série brute et série lissée se confondent
   * > visuellement.
   *
   * The same threshold that switches the grain, which is not a coincidence:
   * it is what makes that sentence true. Once a point is a weekly mean, the
   * two series ARE the same line drawn twice.
   */
  showRaw: boolean;
}

/**
 * The grain D9 prescribes for a span.
 *
 * ## "BEYOND" IS STRICT, AND BOTH BOUNDARIES ARE A REAL CASE
 *
 * Ninety days is a range specs 9.2 offers by name, and it stays daily; 365 is
 * likewise offered by name and is weekly, because it is beyond ninety and not
 * beyond a year. Reading either bound as inclusive would move a range the user
 * picked from the list onto the wrong grain.
 */
export function grainFor(days: number): Grain {
  if (days > MONTHLY_BEYOND_DAYS) return 'month';
  if (days > WEEKLY_BEYOND_DAYS) return 'week';
  return 'day';
}

/**
 * Days of measurement to read BEFORE the range, so its earliest points are
 * smoothed against a full window.
 *
 * ## THE SAME SIX DAYS THE REGRESSION NEEDS, AND FOR THE SAME REASON
 *
 * A smoothed point is a seven-day trailing mean, so the first point of any
 * range needs the six days before it to exist. Reading only the range does not
 * fail — it computes those points from SHORT windows, which on a falling series
 * leaves them too low, and the curve then starts with a hook that nobody
 * weighed. Measured elsewhere in this slice at 22 % on a fourteen-day slope.
 *
 * On a ninety-day range that spoils the first six points out of ninety and is
 * easy to miss. On a SEVEN-day range it would spoil six out of seven — which is
 * why the week could not have been offered without this.
 *
 * Zero above the daily grain: a weekly bucket is already a mean of its days, so
 * there is no trailing window to fill (specs 9.2 precision 3).
 */
export function smoothingLead(grain: Grain): number {
  return grain === 'day' ? SMOOTHING_LEAD_DAYS : 0;
}

/** Seven-day window, so six days of run-up. */
const SMOOTHING_LEAD_DAYS = 6;

/**
 * The range a key means, given today.
 *
 * No longer takes the first measurement ever: it was there for "tout", which
 * specs 14.17 removed. Every range now counts back a fixed number of days from
 * today, exactly as the nutrition panel's does.
 */
export function weightRangeFor(key: WeightRangeKey, today: LocalDate): WeightRange {
  const from = addDays(today, -(Number(key) - 1));

  // Both ends included, which is how rangeEndingOn counts in the stats panel.
  // diffDays is day-number arithmetic, so this crosses a daylight saving night
  // without noticing one (D3).
  const days = Math.max(1, diffDays(from, today) + 1);

  const grain = grainFor(days);
  return { from, to: today, days, grain, showRaw: grain === 'day' };
}

/**
 * The same range, widened backwards by whatever the smoothing needs.
 *
 * What the READ asks for; `weightRangeFor` stays what is DRAWN. Keeping them
 * apart is what stops the extra days leaking onto the axis — the panel smooths
 * over this one and then keeps only the points inside the displayed range.
 */
export function readRangeFor(range: WeightRange): WeightRange {
  const lead = smoothingLead(range.grain);
  if (lead === 0) return range;

  const from = addDays(range.from, -lead);
  return { ...range, from, days: range.days + lead };
}
