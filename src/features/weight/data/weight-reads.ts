import { desc, eq, sql } from 'drizzle-orm';
import { addDays, compareLocalDate, toLocalDate, weekday, type LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { weightGoal, weightMeasure, type WeightGoalId } from '@/core/db/schema';
import type { WeightGoal } from '../domain/weight-goal';
import type { Grain, WeightRange } from '../domain/weight-range';

/**
 * Reads of the weight tables (specs 9.1, 9.2).
 *
 * Pure functions taking the database, like every access function since slice 1,
 * so they run in Node against a real SQLite file (D15).
 *
 * ## THE POINT COUNT IS SETTLED HERE, IN SQL, WHICH IS D13's ACTUAL DEMAND
 *
 * > L'écran fait 390 points de large : afficher trois ans de poids, c'est
 * > dessiner mille valeurs sur quatre cents pixels. LE NOMBRE DE POINTS
 * > ARRIVANT AU GRAPHIQUE SE RÈGLE EN SQL, par agrégation (D9), pas dans la
 * > bibliothèque de rendu.
 *
 * Slice 7 never had to obey that sentence — specs 8.7's longest range is
 * exactly 90 days, and "beyond 90" does not include 90. Specs 9.2 offers "1 an"
 * and "tout", so this is where it finally bites.
 */

export interface WeightRow {
  date: LocalDate;
  valueKg: number;
}

/**
 * The SQL expression grouping dates by grain, each yielding a CIVIL DATE.
 *
 * ## EVERY GRAIN ANSWERS WITH A LocalDate, WHICH IS WHAT KEEPS THE AXIS HONEST
 *
 * A grain could have returned '2026-W11' or '2026-03'. It returns the Monday of
 * the week and the first of the month instead, so that every point — daily,
 * weekly or monthly — carries a real date the axis can place and core/date can
 * do arithmetic on. Nothing downstream needs to know which grain it is looking
 * at.
 *
 * ## THE WEEK EXPRESSION IS SQLITE'S, AND IT IS VERIFIED AGAINST core/date
 *
 * `date(d, 'weekday 0', '-6 days')` walks forward to the coming Sunday then
 * back six days, which lands on the Monday of d's own week — including when d
 * IS a Sunday, since SQLite does not move a date already on the named weekday.
 *
 * That is a SECOND implementation of "the Monday of this week", the first being
 * startOfWeek in core/date. Two implementations of one question are exactly
 * what this project keeps finding in its own bugs, so they are not held in
 * agreement by care but BY A TEST, on the pattern slice 4 set for the window
 * function: every date over several years, compared one by one.
 */
function bucketExpression(grain: Grain) {
  switch (grain) {
    case 'day':
      return sql<string>`${weightMeasure.date}`;
    case 'week':
      return sql<string>`date(${weightMeasure.date}, 'weekday 0', '-6 days')`;
    case 'month':
      // The first of the month. substr rather than strftime: the column is
      // already 'YYYY-MM-DD' text, so this is a slice rather than a parse.
      return sql<string>`substr(${weightMeasure.date}, 1, 7) || '-01'`;
  }
}

/**
 * The measurements of a range, one row per bucket, sparse.
 *
 * SPARSE ON PURPOSE. SQL returns rows only for buckets that hold something, and
 * densifying is the caller's job (weightSeries below) because only the caller
 * knows the axis. A bucket nobody weighed must exist as a GAP, never as a zero
 * and never as a missing position — specs 9.2 precision 1 rests entirely on
 * that distinction.
 *
 * ## THE AGGREGATE IS avg(), WHICH IS D9 RATHER THAN A CHOICE
 *
 * > Toute valeur quotidienne s'agrège PAR MOYENNE. La somme n'est licite que
 * > pour les compteurs.
 *
 * And at the weekly and monthly grain that mean IS the smoothed series — which
 * is what specs 9.2 precision 3 means by "agrégées par semaine ou par mois,
 * série brute et série lissée se confondent visuellement". A weekly mean of
 * daily weights is already a seven-day average; smoothing it again in
 * TypeScript would need every daily row loaded, which is the thing D13 forbids.
 */
export function readWeights(db: AppDatabase, range: WeightRange): WeightRow[] {
  const bucket = bucketExpression(range.grain);

  const rows = db
    .select({ date: bucket, valueKg: sql<number>`avg(${weightMeasure.valueKg})` })
    .from(weightMeasure)
    .where(sql`${weightMeasure.date} BETWEEN ${range.from} AND ${range.to}`)
    .groupBy(bucket)
    .orderBy(bucket)
    .all();

  return rows.map((row) => ({ date: toLocalDate(row.date), valueKg: row.valueKg }));
}

/**
 * Every bucket of the range, in order, gaps included.
 *
 * DENSE, and built from the range rather than from the rows — the shape
 * datesOf/readDailyFigures already use one feature over. A chart drawn from the
 * rows alone would put two points side by side that are three weeks apart, and
 * a rolling mean computed over them would average across a month and call it a
 * week.
 */
export function bucketsOf(range: WeightRange): LocalDate[] {
  const buckets: LocalDate[] = [];
  let cursor = firstBucket(range.from, range.grain);

  while (compareLocalDate(cursor, range.to) <= 0) {
    buckets.push(cursor);
    cursor = nextBucket(cursor, range.grain);
  }

  return buckets;
}

/**
 * The bucket a date falls in — the TypeScript half of bucketExpression.
 *
 * Exported so the test that holds the two implementations in agreement can
 * reach it. Nothing else should need it: the reads bucket in SQL.
 */
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

/**
 * The start of the bucket containing `from`.
 *
 * The range's first day is rarely a Monday or a first of the month, and the
 * bucket it belongs to starts BEFORE it. Starting the axis at `from` itself
 * would leave the first point half a bucket adrift from the one SQL grouped it
 * into — the rows would land on a date the axis never drew, and the first
 * measurement of the range would silently vanish.
 */
function firstBucket(from: LocalDate, grain: Grain): LocalDate {
  return bucketOf(from, grain);
}

function nextBucket(bucket: LocalDate, grain: Grain): LocalDate {
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

/** One measurement, or null when that date was never weighed. */
export function readWeight(db: AppDatabase, date: LocalDate): number | null {
  const row = db
    .select({ valueKg: weightMeasure.valueKg })
    .from(weightMeasure)
    .where(eq(weightMeasure.date, date))
    .get();

  return row?.valueKg ?? null;
}

/**
 * The earliest date ever weighed, for the "tout" range.
 *
 * Null on a database where nothing has been weighed, which the range treats as
 * "collapse to today" rather than reaching back to an arbitrary date.
 */
export function readFirstWeightDate(db: AppDatabase): LocalDate | null {
  const row = db
    .select({ date: sql<string | null>`min(${weightMeasure.date})` })
    .from(weightMeasure)
    .get();

  const date = row?.date ?? null;
  return date === null ? null : toLocalDate(date);
}

export interface WeightHistoryRow {
  date: LocalDate;
  valueKg: number;
}

/**
 * The history, newest first (specs 9.1: "liste chronologique").
 *
 * Newest first because the list exists to correct a recent mistake — "je
 * corrige une mesure d'avant-hier" — and the day before yesterday is at the top
 * that way. `limit` is offered so a four-year history does not have to be
 * rendered whole; the screen pages it.
 *
 * No aggregation here whatever the range: this is the list of what was actually
 * typed, and a weekly mean is not a measurement anyone made.
 */
export function readWeightHistory(db: AppDatabase, limit?: number): WeightHistoryRow[] {
  const query = db
    .select({ date: weightMeasure.date, valueKg: weightMeasure.valueKg })
    .from(weightMeasure)
    .orderBy(desc(weightMeasure.date));

  return (limit === undefined ? query : query.limit(limit)).all();
}

export interface ActiveGoal extends WeightGoal {
  id: WeightGoalId;
  definedAt: number;
}

/**
 * The active goal, or null.
 *
 * `limit(1)` despite ux_weight_goal_active guaranteeing at most one: the index
 * is what makes it true in this database, and a hand-repaired archive imported
 * before the index existed is the one case where it might not be. Costing
 * nothing, it means this function cannot ever return a surprise.
 */
export function readActiveGoal(db: AppDatabase): ActiveGoal | null {
  const row = db
    .select({
      id: weightGoal.id,
      targetKg: weightGoal.targetKg,
      mode: weightGoal.mode,
      targetDate: weightGoal.targetDate,
      rateKgPerWeek: weightGoal.rateKgPerWeek,
      definedAt: weightGoal.definedAt,
    })
    .from(weightGoal)
    .where(eq(weightGoal.isActive, 1))
    .limit(1)
    .get();

  return row ?? null;
}

/**
 * Every goal, active first then newest — for the Settings screen.
 *
 * Retired goals are kept (specs 6.2 makes deactivating and deleting two
 * different actions), so the screen has to be able to show them and offer to
 * turn one back on.
 */
export function readGoals(db: AppDatabase): (ActiveGoal & { isActive: 0 | 1 })[] {
  return db
    .select({
      id: weightGoal.id,
      targetKg: weightGoal.targetKg,
      mode: weightGoal.mode,
      targetDate: weightGoal.targetDate,
      rateKgPerWeek: weightGoal.rateKgPerWeek,
      definedAt: weightGoal.definedAt,
      isActive: weightGoal.isActive,
    })
    .from(weightGoal)
    .orderBy(desc(weightGoal.isActive), desc(weightGoal.definedAt))
    .all();
}

export interface SeriesRow {
  date: LocalDate;
  /** The bucket's value, or null where nothing was weighed. */
  raw: number | null;
}

/**
 * Every bucket of the range with its value, gaps included.
 *
 * ## IT DENSIFIES AND STOPS THERE
 *
 * The smoothing, the regression and the projections are pure functions of these
 * rows, and they live in the domain — the shape readDailyFigures set for the
 * nutrition panel, where the read joins two maps onto a dense axis and
 * nutritionPanel does every calculation.
 *
 * `raw: null` means exactly "nothing was weighed in this bucket". It is never a
 * zero, and the whole of specs 9.2 precision 1 rests on that distinction.
 */
export function readWeightSeries(db: AppDatabase, range: WeightRange): SeriesRow[] {
  const byBucket = new Map(readWeights(db, range).map((row) => [row.date, row.valueKg]));

  return bucketsOf(range).map((date) => ({ date, raw: byBucket.get(date) ?? null }));
}

/**
 * The daily series the rate regression needs, whatever range is on screen.
 *
 * ## IT IS ALWAYS DAILY, AND ALWAYS LONGER THAN THE WINDOW
 *
 * Two independent reasons it cannot reuse the chart's series:
 *
 *  - the rate is a CARD, not the chart. Specs 9.2 fixes its window at fourteen
 *    days; the range control governs what is drawn, never what is measured. A
 *    rate that changed when someone tapped "1 an" would be reporting the
 *    picture rather than the body.
 *  - it needs RATE_LOAD_DAYS, not RATE_WINDOW_DAYS. Each smoothed point is a
 *    seven-day trailing mean, so the oldest point of the window needs the six
 *    days before it — loading exactly fourteen understates the rate by 22 %
 *    (measured; see RATE_LOAD_DAYS).
 */
export function readRateWindow(
  db: AppDatabase,
  today: LocalDate,
  loadDays: number,
): SeriesRow[] {
  const from = addDays(today, -(loadDays - 1));
  const range: WeightRange = {
    from,
    to: today,
    days: loadDays,
    grain: 'day',
    showRaw: true,
  };

  return readWeightSeries(db, range);
}
