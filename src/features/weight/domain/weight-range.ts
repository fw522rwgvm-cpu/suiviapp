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

/** Specs 9.2: "sur 30 jours / 90 jours / 1 an / tout". */
export const WEIGHT_RANGE_KEYS = ['30', '90', '365', 'all'] as const;

/**
 * Derived from the array rather than written beside it, the shape PORTION_NAMES
 * set: a union of literals cannot be walked at runtime, so a hand-kept pair
 * would be free to disagree — and the place it would disagree is the control
 * that offers the choice.
 */
export type WeightRangeKey = (typeof WEIGHT_RANGE_KEYS)[number];

export const DEFAULT_WEIGHT_RANGE: WeightRangeKey = '90';

/** "90 jours", for the range control. */
export function weightRangeLabel(key: WeightRangeKey): string {
  switch (key) {
    case '30':
      return '30 jours';
    case '90':
      return '90 jours';
    case '365':
      return '1 an';
    case 'all':
      return 'Tout';
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
 * The range a key means, given today and where the history starts.
 *
 * ## "TOUT" HAS NO FIXED GRAIN, AND THAT IS D9 RATHER THAN A SHORTCUT
 *
 * On an installation three months old, "tout" is daily; after four years it is
 * monthly. The grain follows the span, not the label — which also means "tout"
 * and "90 jours" look alike on a young history, and that is honest: they ARE
 * alike, there being nothing older to show.
 *
 * `firstMeasured` is null when nothing has ever been weighed. The range then
 * collapses to today, which draws an empty chart rather than reaching back to
 * an arbitrary date and drawing a long flat nothing.
 */
export function weightRangeFor(
  key: WeightRangeKey,
  today: LocalDate,
  firstMeasured: LocalDate | null,
): WeightRange {
  const from =
    key === 'all'
      ? // Never earlier than the first measurement, and never later than today:
        // a stray future measurement must not drag the start of the range
        // forward past the days that precede it.
        firstMeasured === null || compareLocalDate(firstMeasured, today) > 0
        ? today
        : firstMeasured
      : addDays(today, -(Number(key) - 1));

  // Both ends included, which is how rangeEndingOn counts in the stats panel.
  // diffDays is day-number arithmetic, so this crosses a daylight saving night
  // without noticing one (D3) and costs the same on four years as on four days.
  const days = Math.max(1, diffDays(from, today) + 1);

  const grain = grainFor(days);
  return { from, to: today, days, grain, showRaw: grain === 'day' };
}
