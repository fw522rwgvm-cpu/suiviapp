import { addDays, compareLocalDate, type LocalDate } from '@/core/date';
import { bucketOf, type Grain } from '@/core/db/date-bucket';
import type { ExerciseSessionPoint } from './exercise-stats';

/**
 * The ranges of specs 10.1 and 10.6, and the grain each is read at (D9, D13).
 *
 * > Graphiques sur 3 mois / 1 an / tout. (Specs 10.1)
 * > Plages : 3 mois / 1 an / tout. (Specs 10.6)
 *
 * Pure: nothing here reads a clock or a database. `today` is always a
 * parameter, so this answers the same at +14 as in Paris (D3).
 *
 * ## STRENGTH HAS ITS OWN RANGES, AND SPECS 7 ALREADY SAYS IT MAY
 *
 * > Chaque volet garde ses propres plages, qui diffèrent d'un volet à l'autre.
 *
 * The nutrition panel offers 7/30/90 and the weight panel 7/30/90/365, with
 * "tout" removed from the latter in specs 14.17. Strength keeps "tout",
 * because specs 10.1 and 10.6 both name it and because the question it answers
 * is the one this whole slice exists for: is this lift going up, over however
 * long it has been trained.
 *
 * ## "TOUT" IS A SPAN, NOT AN ABSENCE OF ONE
 *
 * It is computed from the earliest point in hand rather than left open, so the
 * grain below has something to be chosen from. A history of two months read as
 * "tout" is therefore drawn at the same grain as the three-month range, which
 * is the honest answer: it IS the three-month range.
 */

export const EXERCISE_RANGE_KEYS = ['90', '365', 'all'] as const;

/**
 * Derived from the array, the shape PORTION_NAMES set: a union of literals
 * cannot be walked at runtime, so a hand-kept pair would be free to disagree —
 * and the place it would disagree is the control offering the choice.
 */
export type ExerciseRangeKey = (typeof EXERCISE_RANGE_KEYS)[number];

/**
 * The range the page opens on.
 *
 * THREE MONTHS, which is the first one specs 10.1 lists. It is also the only
 * one that is a training block rather than a retrospective: a year and "tout"
 * answer "how far have I come", and three months answers "is the current
 * programme working", which is the question somebody opens an exercise page
 * with.
 */
export const DEFAULT_EXERCISE_RANGE: ExerciseRangeKey = '90';

/** "1 an", for the range control. */
export function exerciseRangeLabel(key: ExerciseRangeKey): string {
  switch (key) {
    case '90':
      return '3 mois';
    case '365':
      return '1 an';
    case 'all':
      return 'Tout';
  }
}

export interface ExerciseRange {
  /** Null on "tout" with no history at all: there is nothing to bound. */
  from: LocalDate | null;
  to: LocalDate;
  /** Civil days spanned, both ends included. */
  days: number;
  grain: Grain;
}

/**
 * The range a key means, given today and the oldest point there is.
 *
 * ## THE GRAIN FOLLOWS D9's SPAN RULE, WHICH THE WEIGHT PANEL ALREADY APPLIES
 *
 * > Regroupement par semaine au-delà de 90 jours, par mois au-delà d'un an.
 *
 * Reused from core/db/date-bucket rather than re-derived, and NOT loosened
 * even though it could have been: a year of an exercise trained twice a week
 * is about a hundred sessions, which is already under the two hundred points
 * D13 caps a chart at, so nothing forces the weekly grouping here.
 *
 * It is applied anyway, for two reasons. D9 is normative and says "au-delà de
 * 90 jours" without an exemption for sparse series. And a rule with a
 * condition — "group only when there are too many points" — is one somebody
 * has to remember, where this one is the same expression the weight curve
 * already uses.
 *
 * The consequence, stated rather than discovered: the one-year view shows a
 * weekly figure, not each session. That is what D9 intends, and it is the
 * easier chart to read a trend off.
 */
export function exerciseRangeFor(
  key: ExerciseRangeKey,
  today: LocalDate,
  earliest: LocalDate | null,
): ExerciseRange {
  if (key === 'all') {
    // No history: a span of one day, so the grain is defined and every caller
    // downstream works on the empty list without a special case.
    if (earliest === null) return { from: null, to: today, days: 1, grain: 'day' };
    const days = Math.max(1, daysBetween(earliest, today));
    return { from: earliest, to: today, days, grain: grainFor(days) };
  }

  const span = Number(key);
  const from = addDays(today, -(span - 1));
  return { from, to: today, days: span, grain: grainFor(span) };
}

/** D9: "au-delà de 90 jours", "au-delà d'un an". Neither bound is inclusive. */
function grainFor(days: number): Grain {
  if (days > 365) return 'month';
  if (days > 90) return 'week';
  return 'day';
}

/** Whole civil days between two dates, both ends included. Day arithmetic (D3). */
function daysBetween(from: LocalDate, to: LocalDate): number {
  let count = 1;
  let cursor = from;
  // Bounded walk rather than diffDays, so a `to` before `from` — which an
  // imported archive dated in the future would produce — answers 1 rather than
  // a negative span.
  while (compareLocalDate(cursor, to) < 0 && count < MAX_SPAN_DAYS) {
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return count;
}

/** Twenty years. Past this the grain is monthly whatever the exact figure is. */
const MAX_SPAN_DAYS = 365 * 20;

/**
 * One point of a chart: a session, or a bucket of them.
 *
 * Carries how many sessions it stands for, because that is what the tooltip
 * needs in order not to lie about a bucket — "moyenne de 4 séances" rather
 * than a bare figure that looks like one workout.
 */
export interface ChartPoint {
  date: LocalDate;
  sessions: number;
  maxLoadKg: number | null;
  bestOneRm: number | null;
  bestSetVolume: number | null;
  sessionVolume: number | null;
  totalReps: number | null;
}

/**
 * The session points of a range, grouped to its grain.
 *
 * ## THREE SERIES AGGREGATE BY MAX AND TWO BY MEAN, AND THAT IS A DECISION
 *
 * D9 gives one rule — "toute valeur quotidienne s'agrège par moyenne, la somme
 * n'est licite que pour les compteurs" — and it settles the two totals but not
 * the three maxima.
 *
 * - `maxLoadKg`, `bestOneRm`, `bestSetVolume` take the MAX of the bucket. Each
 *   one is already a maximum over a session, and a chart titled "charge
 *   maximale" whose points are averages is contradicting its own title. The
 *   heaviest thing lifted in March is what anybody means by March's maximum.
 * - `sessionVolume` and `totalReps` take the MEAN. They are per-session totals:
 *   summing a month gives a figure nobody lifted in one session, and D9 forbids
 *   summing anything that is not a counter. The mean also survives a partial
 *   bucket at either end of the range, where a sum would read as a collapse in
 *   the last week simply because it is not over yet.
 *
 * FLAGGED as a decision, and written up in specs 14.42. The chart says which
 * it is doing whenever the grain is not per session.
 *
 * ## A BUCKET WITH NO VALUE FOR A SERIES KEEPS NULL
 *
 * A month of bodyweight sets has no volume, and `0` would draw it at the floor
 * rather than as a gap. The rule of the whole slice: a null is never a zero.
 */
export function bucketChartPoints(
  points: readonly ExerciseSessionPoint[],
  range: ExerciseRange,
  grain: Grain,
): ChartPoint[] {
  const inRange = points.filter(
    (point) =>
      (range.from === null || compareLocalDate(point.date, range.from) >= 0) &&
      compareLocalDate(point.date, range.to) <= 0,
  );

  if (grain === 'day') {
    // One point per session, which is the natural unit here — NOT one per
    // civil day. Two sessions of one exercise in a day is unusual and real,
    // and merging them would hide the second.
    return inRange.map((point) => ({
      date: point.date,
      sessions: 1,
      maxLoadKg: point.maxLoadKg,
      bestOneRm: point.bestOneRm,
      bestSetVolume: point.bestSetVolume,
      sessionVolume: point.sessionVolume,
      totalReps: point.totalReps,
    }));
  }

  const buckets = new Map<string, { point: ChartPoint; volumes: number[]; reps: number[] }>();
  const order: string[] = [];

  for (const point of inRange) {
    const bucket = bucketOf(point.date, grain);
    let held = buckets.get(bucket);
    if (held === undefined) {
      held = {
        point: {
          date: bucket,
          sessions: 0,
          maxLoadKg: null,
          bestOneRm: null,
          bestSetVolume: null,
          sessionVolume: null,
          totalReps: null,
        },
        volumes: [],
        reps: [],
      };
      buckets.set(bucket, held);
      order.push(bucket);
    }

    held.point.sessions += 1;
    held.point.maxLoadKg = maxOrNull(held.point.maxLoadKg, point.maxLoadKg);
    held.point.bestOneRm = maxOrNull(held.point.bestOneRm, point.bestOneRm);
    held.point.bestSetVolume = maxOrNull(held.point.bestSetVolume, point.bestSetVolume);
    if (point.sessionVolume !== null) held.volumes.push(point.sessionVolume);
    held.reps.push(point.totalReps);
  }

  return order.flatMap((key) => {
    const held = buckets.get(key);
    if (held === undefined) return [];
    return [
      {
        ...held.point,
        sessionVolume: meanOrNull(held.volumes),
        totalReps: meanOrNull(held.reps),
      },
    ];
  });
}

function maxOrNull(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  return Math.max(current, candidate);
}

/** The mean, or null for an empty bucket — never zero. */
function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
