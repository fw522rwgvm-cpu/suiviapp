import { addDays, type LocalDate } from '@/core/date';

/**
 * The ranges of the nutrition panel (specs 8.7).
 *
 * > Plages : 7 / 30 / 90 jours.
 *
 * Pure: nothing here reads a clock or a database. `today` is always a
 * parameter, so the whole module answers the same at +14 as in Paris and the
 * one function that decides what today is stays the one in core/date (D3).
 */

export const STAT_RANGE_DAYS = [7, 30, 90] as const;

/**
 * Derived from the array rather than written beside it, the way PORTION_NAMES
 * is: a union of literals cannot be walked at runtime, so a hand-kept pair
 * would be free to disagree — and the place it would disagree is the control
 * that offers the choice.
 */
export type StatRangeDays = (typeof STAT_RANGE_DAYS)[number];

export const DEFAULT_STAT_RANGE: StatRangeDays = 30;

export interface DateRange {
  from: LocalDate;
  to: LocalDate;
  /** How many civil days the range spans, both ends included. */
  days: number;
}

/**
 * The last `days` civil days, ending on `today` and including it.
 *
 * ## NINETY POINTS IS THE MOST THIS EVER PRODUCES, AND THAT SETTLES D13
 *
 * > The number of points reaching the chart is settled in SQL, by aggregation
 * > (D9), not in the rendering library. (D13)
 *
 * D9 groups by week beyond 90 days and by month beyond a year. The longest
 * range specs 8.7 offers is exactly 90, and "beyond 90" does not include 90 —
 * so neither grouping ever applies to the nutrition panel. Every range here is
 * one point per day, well under the two hundred D13 caps a chart at.
 *
 * That is worth stating rather than leaving to be rediscovered: the grouping
 * rule is real and normative, it simply has no customer until the weight
 * curves of slice 8, which go out to "tout".
 */
export function rangeEndingOn(today: LocalDate, days: number): DateRange {
  const span = Math.max(1, Math.trunc(days));
  return { from: addDays(today, -(span - 1)), to: today, days: span };
}

/**
 * Every date of the range, in order.
 *
 * DENSE ON PURPOSE. SQL returns rows only for days that have something, so a
 * day nobody logged simply has no row — and a chart drawn from those rows
 * alone would put two bars side by side that are three weeks apart. The gaps
 * have to exist as gaps, which means the date axis is built here and the rows
 * are matched onto it.
 */
export function datesOf(range: DateRange): LocalDate[] {
  const dates: LocalDate[] = [];
  for (let offset = 0; offset < range.days; offset += 1) {
    dates.push(addDays(range.from, offset));
  }
  return dates;
}

/** "30 jours", for the range control. */
export function rangeLabel(days: StatRangeDays): string {
  return `${days} jours`;
}
