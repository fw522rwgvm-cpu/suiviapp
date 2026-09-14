import { useQuery } from '@tanstack/react-query';
import type { LocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import { dayMeal, journalEntry } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import type { DayFigure } from '../domain/adherence';
import { rangeEndingOn } from '../domain/stat-range';
import { readDailyFigures } from './stats-reads';

/**
 * Reads are hooks; there is nothing to write here (D8).
 *
 * The statistics panel is derived data from end to end (D9) — it writes
 * nothing, stores nothing, and there is no summary table behind it. Section 6
 * point 5 keeps that one deliberately unwritten: it would be reconstructible
 * data, so deferring it costs nothing, unlike almost everything else.
 *
 * No onSuccess, as everywhere since slice 1. Logging anything touches
 * journal_entry, SQLite reports it, and the bus invalidates this.
 */

export const statsKeys = {
  daily: (today: LocalDate, days: number) => ['stats', 'daily', today, days] as const,
};

/**
 * One day per position over the range, gaps included (specs 8.7).
 *
 * ## IT DECLARES day_meal, AND IT HAS TO
 *
 * The goals come from the day's own meals, so editing a meal's targets — or
 * applying a template to a day — has to move these figures. It does NOT
 * declare the planning tables, unlike useDay: a materialised day is the only
 * kind this reads, and a materialised day never consults the planning. A
 * virtual day has no day_meal rows and no entries, so it contributes nothing
 * either way.
 *
 * `today` is in the key rather than read inside, so the query re-fetches when
 * the day turns over or the cutoff setting changes, and so the range the cache
 * holds is always the range that was asked for.
 */
export function useDailyFigures(today: LocalDate, days: number) {
  return useQuery<DayFigure[]>({
    queryKey: statsKeys.daily(today, days),
    queryFn: () => readDailyFigures(getAppDatabase(), rangeEndingOn(today, days)),
    meta: readsFrom(journalEntry, dayMeal),
  });
}
