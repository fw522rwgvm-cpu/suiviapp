import { desc, eq, lt, sql } from 'drizzle-orm';
import { addDays, compareLocalDate, toLocalDate, type LocalDate } from '@/core/date';
import { bucketExpression, bucketOf, nextBucket } from '@/core/db/date-bucket';
import type { AppDatabase } from '@/core/db/database';
import { weightGoal, weightMeasure, type WeightGoalId } from '@/core/db/schema';
import type { WeightGoal } from '../domain/weight-goal';
import { weightPrefill, type WeightPrefill } from '../domain/weight-prefill';
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
  const bucket = bucketExpression(weightMeasure.date, range.grain);

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
  /**
   * The START OF THE BUCKET containing `from`, never `from` itself.
   *
   * A range rarely begins on a Monday, and the bucket its first day belongs to
   * starts BEFORE it. An axis starting at the range's own first date would
   * never draw the date SQL grouped that measurement into, so the first
   * measurement of the range would silently vanish.
   */
  let cursor = bucketOf(range.from, range.grain);

  while (compareLocalDate(cursor, range.to) <= 0) {
    buckets.push(cursor);
    cursor = nextBucket(cursor, range.grain);
  }

  return buckets;
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
 * The last weighing STRICTLY BEFORE a date, if there is one.
 *
 * What the default of specs 9.1 (amended) is carried from: a date with no
 * measurement of its own proposes the previous one rather than an empty field.
 *
 * ## STRICTLY BEFORE, WHICH IS THE WHOLE POINT
 *
 * `<` and not `<=`. A date that has its own measurement is not carrying
 * anything, and including it would make weightPrefill's two cases collapse into
 * one — the card would then have no way to say whether the figure it shows was
 * measured or proposed, which is the distinction the three kinds exist for.
 *
 * ## IT LOOKS BACKWARDS, NEVER FORWARDS
 *
 * Specs 9.1 allows measurements on any past date, so a database can hold a
 * weighing AFTER the date being looked at — correcting last Tuesday from
 * today's Journal is ordinary. Carrying one backwards would propose a future
 * weight as today's default, which is the opposite of what a default is for.
 *
 * Ordered on the primary key, which SQLite indexes, so `limit(1)` reads one row
 * however long the history is.
 */
export function readLastWeightBefore(
  db: AppDatabase,
  date: LocalDate,
): { date: LocalDate; valueKg: number } | null {
  const row = db
    .select({ date: weightMeasure.date, valueKg: weightMeasure.valueKg })
    .from(weightMeasure)
    .where(lt(weightMeasure.date, date))
    .orderBy(desc(weightMeasure.date))
    .limit(1)
    .get();

  return row ?? null;
}

/**
 * What a date proposes, measurement and carried-over default in ONE read.
 *
 * ## ONE QUERY, BECAUSE TWO WOULD BE TWO "NOT YET"s
 *
 * The obvious shape is a hook for the measurement and another for the previous
 * weighing, joined in the component. It would give the card two independent
 * `undefined` states to reconcile — and folding "not yet" into "none" is the
 * defect slice 4 paid for twice, on the quantity wheels and on the portions
 * list. One read, one pending state, one answer.
 *
 * Two statements, not one: the second is only needed when the first finds
 * nothing, and both are single-row reads on the primary key's index.
 */
export function readWeightPrefill(db: AppDatabase, date: LocalDate): WeightPrefill {
  const measured = readWeight(db, date);
  // Asked for only when it can be used: a date with its own measurement is not
  // carrying anything.
  const previous = measured === null ? readLastWeightBefore(db, date) : null;

  return weightPrefill(measured, previous);
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
