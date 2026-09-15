import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { addDays, toLocalDate, weekday, type LocalDate } from '@/core/date';

/**
 * Grouping civil dates by day, week or month — in SQL and in TypeScript (D9).
 *
 * > Regroupement par semaine au-delà de 90 jours, par mois au-delà d'un an.
 *
 * ## IT LIVES IN core/db BECAUSE TWO FEATURES NEED THE SAME BUCKETS
 *
 * The weight curve groups weight_measure and the crossed chart of specs 9.4
 * groups journal_entry, and they must land on THE SAME buckets or the two
 * series of one chart would be offset from each other by up to six days. A
 * second spelling in the second feature is exactly the shape of bug this
 * project keeps finding in itself.
 *
 * ## EVERY GRAIN ANSWERS WITH A CIVIL DATE
 *
 * Not '2026-W11' or '2026-03': the Monday of the week and the first of the
 * month. So every point — daily, weekly or monthly — carries a real date the
 * axis can place and core/date can do arithmetic on, and nothing downstream has
 * to know which grain it is looking at.
 *
 * ## THE TWO IMPLEMENTATIONS ARE HELD TOGETHER BY A TEST, NOT BY CARE
 *
 * `date(d, 'weekday 0', '-6 days')` walks forward to the coming Sunday then
 * back six days, landing on the Monday of d's own week — including when d IS a
 * Sunday, since SQLite does not move a date already on the named weekday. That
 * is a second implementation of what core/date's startOfWeek already does.
 *
 * Verified by execution over several thousand consecutive dates rather than on
 * a handful of examples: the cases that break are year boundaries and that
 * Sunday, and neither is something anyone thinks to write by hand.
 */

/** One point per day, per week, or per month. */
export type Grain = 'day' | 'week' | 'month';

/**
 * The SQL expression bucketing a civil-date column.
 *
 * Takes the column so that both weight_measure.date and journal_entry.date get
 * the identical expression — which is the whole reason this is not written
 * inline where it is used.
 */
export function bucketExpression(column: SQLiteColumn, grain: Grain): SQL<string> {
  switch (grain) {
    case 'day':
      return sql<string>`${column}`;
    case 'week':
      return sql<string>`date(${column}, 'weekday 0', '-6 days')`;
    case 'month':
      // substr rather than strftime: the column is already 'YYYY-MM-DD' text,
      // so this is a slice rather than a parse.
      return sql<string>`substr(${column}, 1, 7) || '-01'`;
  }
}

/** The bucket a date falls in — the TypeScript half of bucketExpression. */
export function bucketOf(date: LocalDate, grain: Grain): LocalDate {
  switch (grain) {
    case 'day':
      return date;
    case 'week':
      // core/date's weekday is ISO, 1 = Monday, by day-number arithmetic — the
      // single entry point for anything calendar (D3). Never a Date object.
      return addDays(date, -(weekday(date) - 1));
    case 'month':
      return toLocalDate(`${date.slice(0, 7)}-01`);
  }
}

/** The bucket after this one. */
export function nextBucket(bucket: LocalDate, grain: Grain): LocalDate {
  switch (grain) {
    case 'day':
      return addDays(bucket, 1);
    case 'week':
      return addDays(bucket, 7);
    case 'month': {
      const year = Number(bucket.slice(0, 4));
      const month = Number(bucket.slice(5, 7));
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      return toLocalDate(
        `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`,
      );
    }
  }
}
