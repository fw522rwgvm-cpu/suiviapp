import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
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
