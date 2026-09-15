import { sql } from 'drizzle-orm';
import { toLocalDate, type LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { bucketExpression, type Grain } from '@/core/db/date-bucket';
import { journalEntry } from '@/core/db/schema';
import {
  readDailyTargets,
  readDailyTotals,
} from '@/features/nutrition/data/day-reads';
import type { DayFigure } from '../domain/adherence';
import { datesOf, type DateRange } from '../domain/stat-range';

/**
 * The nutrition panel's one read (specs 8.7).
 *
 * A plain function taking the database, like every access function since slice
 * 1, so it runs in Node against a real SQLite file (D15).
 *
 * ## TWO QUERIES FOR ANY RANGE, NOT TWO PER DAY
 *
 * Ninety days could have been ninety calls to readDayTotals, and that is the
 * shape a screen naturally reaches for. It is also the shape slice 4 had to
 * undo when the "+" button spread to every row: a per-row read is fine at
 * twenty and impossible at several hundred. So: one grouped query for what was
 * eaten, one for what was aimed at, and the joining happens here over two maps.
 *
 * ## IT DENSIFIES, AND THAT IS THE REASON IT EXISTS AT ALL
 *
 * SQL returns rows only for days that have something. A chart drawn from those
 * rows would put two bars side by side that are three weeks apart, and a
 * rolling weekly mean computed over them would average across a month and call
 * it a week. The date axis is therefore built from the range and the rows are
 * matched onto it, so a day nobody logged is present, as a null.
 *
 * `consumed: null` and `target: null` mean exactly "no measurement" and "no
 * goal". Neither is ever a zero — that distinction is what the whole of specs
 * 8.7's three precisions rests on.
 */
export function readDailyFigures(db: AppDatabase, range: DateRange): DayFigure[] {
  const consumed = readDailyTotals(db, range.from, range.to);
  const targets = readDailyTargets(db, range.from, range.to);

  return datesOf(range).map((date) => ({
    date,
    consumed: consumed.get(date) ?? null,
    target: targets.get(date) ?? null,
  }));
}

/**
 * Calories per bucket over a range, at whatever grain it asks for (specs 9.4).
 *
 * For the crossed chart, and the reason readDailyFigures could not simply be
 * reused: the weight panel's ranges go out to "tout", where one point a day is
 * a thousand points. D13 settles the point count IN SQL, and the grouping is
 * the very expression weight_measure is grouped by — literally the same, from
 * core/db/date-bucket, because two series of one chart landing on buckets six
 * days apart is the defect that sharing avoids.
 *
 * ## THE AGGREGATE IS avg() OF DAYS, NOT sum() AND NOT avg() OF ENTRIES
 *
 * > Toute valeur quotidienne s'agrège PAR MOYENNE. La somme n'est licite que
 * > pour les compteurs. (D9)
 *
 * A week of calories summed is a number nobody eats and has no target to be
 * read against. And averaging the ENTRIES would be the mean of a mouthful
 * rather than of a day — so the inner query sums each day and the outer one
 * averages those sums.
 *
 * A day with no entry contributes nothing rather than a zero, because it has no
 * row at all. That is the same rule as everywhere in specs 8.7: an absence of
 * measurement is not a zero.
 *
 * Written as one SQL statement rather than as two round trips: the inner
 * grouping is a subquery, which the query builder cannot express with these
 * types, so the Drizzle objects are interpolated into a template instead. The
 * column names still come from the schema objects, so a rename is still a
 * compile error rather than a silent empty map.
 */
export function readKcalBuckets(
  db: AppDatabase,
  from: LocalDate,
  to: LocalDate,
  grain: Grain,
): Map<LocalDate, number> {
  const bucket = bucketExpression(journalEntry.date, grain);

  const rows = db.all<{ bucket: string; kcal: number }>(sql`
    SELECT bucket, avg(day_kcal) AS kcal
    FROM (
      SELECT ${bucket} AS bucket,
             sum(${journalEntry.quantity} * ${journalEntry.kcal100} / 100.0) AS day_kcal
      FROM ${journalEntry}
      WHERE ${journalEntry.date} BETWEEN ${from} AND ${to}
      GROUP BY ${journalEntry.date}
    )
    GROUP BY bucket
    ORDER BY bucket
  `);

  return new Map(rows.map((row) => [toLocalDate(row.bucket), row.kcal]));
}
