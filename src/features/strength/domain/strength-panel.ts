import { addDays, compareLocalDate, startOfWeek, type LocalDate } from '@/core/date';
import { bucketOf, type Grain } from '@/core/db/date-bucket';
import type { PanelSessionRow } from '../data/strength-panel-reads';

/**
 * The arithmetic of the dashboard's strength panel (specs 10.6, D9).
 *
 * > Durée des séances — temps actif · Volume total par séance · Répétitions
 * > par séance.
 *
 * Pure: no clock, no database, no React. It takes the rows readStrengthPanel
 * hands over and folds them.
 *
 * ## ALL THREE SERIES ARE "PAR SÉANCE", SO ALL THREE BUCKET BY MEAN
 *
 * Specs 10.6 says so for two of them in as many words and the third is a
 * duration, which is the same shape. D9 settles it: "toute valeur quotidienne
 * s'agrège par moyenne, la somme n'est licite que pour les compteurs". A
 * month of volume summed is a figure nobody lifted in one session, and a
 * partial bucket at the end of a range would read as a collapse simply
 * because the month is not over.
 *
 * This is the SIMPLER half of the same decision the exercise page had to take,
 * where three of five series were already maxima and kept the max. Here
 * nothing is a maximum, so nothing is an exception.
 */

export interface PanelPoint {
  date: LocalDate;
  /** How many sessions it stands for. 1 at the per-session grain. */
  sessions: number;
  /** Mean active duration, in milliseconds (D12). */
  durationMs: number | null;
  /** Mean volume in kilogram-repetitions. Null when none was measurable. */
  volumeKg: number | null;
  /** Mean repetitions of a session. */
  reps: number | null;
}

/**
 * The sessions of a range, grouped to its grain.
 *
 * ## A BUCKET WITH NO MEASURABLE VOLUME KEEPS NULL
 *
 * A fortnight of bodyweight training has repetitions and a duration and no
 * volume in kilograms. Zero would draw it at the floor of the volume chart
 * rather than as a gap, which reads as "you did nothing" where the truth is
 * "this is not measurable in kilograms". The rule of the whole slice.
 *
 * ## AT THE FINEST GRAIN A POINT IS A SESSION, NOT A CIVIL DAY
 *
 * Two sessions in one day is unusual and real — a morning and an evening —
 * and merging them would hide the second on the only range fine enough to
 * show it.
 */
export function panelPoints(
  sessions: readonly PanelSessionRow[],
  grain: Grain,
): PanelPoint[] {
  if (grain === 'day') {
    return sessions.map((row) => ({
      date: row.date,
      sessions: 1,
      durationMs: row.durationMs,
      volumeKg: row.volumeKg,
      reps: row.reps,
    }));
  }

  const buckets = new Map<
    string,
    { date: LocalDate; durations: number[]; volumes: number[]; reps: number[] }
  >();
  const order: string[] = [];

  for (const row of sessions) {
    const key = bucketOf(row.date, grain);
    let held = buckets.get(key);
    if (held === undefined) {
      held = { date: key, durations: [], volumes: [], reps: [] };
      buckets.set(key, held);
      order.push(key);
    }
    held.durations.push(row.durationMs);
    if (row.volumeKg !== null) held.volumes.push(row.volumeKg);
    held.reps.push(row.reps);
  }

  return order.flatMap((key) => {
    const held = buckets.get(key);
    if (held === undefined) return [];
    return [
      {
        date: held.date,
        sessions: held.durations.length,
        durationMs: meanOrNull(held.durations),
        volumeKg: meanOrNull(held.volumes),
        reps: meanOrNull(held.reps),
      },
    ];
  });
}

/**
 * The civil days a session happened on, for the calendar of specs 10.6.
 *
 * A SET OF DATES rather than a count per date: the calendar marks a day as
 * trained or not, and two sessions in one day do not make it twice as
 * trained. That is a different question from the charts', which is why this
 * is its own fold rather than a field of PanelPoint.
 */
export function trainedDays(sessions: readonly PanelSessionRow[]): Set<string> {
  return new Set(sessions.map((row) => row.date));
}

/** How many sessions, and how many distinct days they fell on. */
export interface PanelTotals {
  sessions: number;
  days: number;
  /** Mean active duration over the range, in ms. Null with no session. */
  meanDurationMs: number | null;
  /** Mean volume per session. Null when nothing was measurable. */
  meanVolumeKg: number | null;
  /** Mean repetitions per session. Null with no session. */
  meanReps: number | null;
}

/**
 * The headline figures above the charts.
 *
 * COUNTS ARE SUMS AND EVERYTHING ELSE IS A MEAN, which is D9's rule applied
 * literally: "la somme n'est licite que pour les compteurs". The number of
 * sessions is a counter; a duration is not.
 *
 * `days` is distinct civil days rather than sessions, because that is what the
 * calendar beside it shows — two figures about the same range that counted
 * differently would be the kind of quiet disagreement this project treats as
 * a defect.
 */
export function panelTotals(sessions: readonly PanelSessionRow[]): PanelTotals {
  return {
    sessions: sessions.length,
    days: trainedDays(sessions).size,
    meanDurationMs: meanOrNull(sessions.map((row) => row.durationMs)),
    meanVolumeKg: meanOrNull(
      sessions.flatMap((row) => (row.volumeKg === null ? [] : [row.volumeKg])),
    ),
    meanReps: meanOrNull(sessions.map((row) => row.reps)),
  };
}

/**
 * The range laid out as calendar weeks — the grid of specs 10.6.
 *
 * ## A WEEK PER COLUMN, MONDAY AT THE TOP
 *
 * A month grid cannot show a year, and specs 10.6 governs this calendar with
 * the same 3 months / 1 an / tout control as the charts. Seven rows and one
 * column per week is what scales: thirteen columns for a quarter, fifty-two
 * for a year, and the eye reads a gap in training as a blank column without
 * being told to.
 *
 * MONDAY FIRST, as core/date's week does and as MonthCalendar draws (D3).
 *
 * ## IT IS DENSE, AND THE PADDING IS PART OF THAT
 *
 * The first and last columns are completed back to their Monday and on to
 * their Sunday, so every column is seven cells and nothing is ragged. Those
 * padding days fall OUTSIDE the range and are marked as such rather than
 * simply drawn untrained — a grey cell for a day the range does not cover
 * would say "you did not train" about a day nobody was asked about.
 */
export interface CalendarCell {
  date: LocalDate;
  /** False for the days that only exist to square off the first/last column. */
  inRange: boolean;
}

export function calendarWeeks(from: LocalDate, to: LocalDate): CalendarCell[][] {
  // A `to` before `from` is reachable only from a hand-repaired archive; one
  // week of padding is a better answer than an empty grid or a loop.
  const last = compareLocalDate(to, from) < 0 ? from : to;

  const weeks: CalendarCell[][] = [];
  let cursor = startOfWeek(from);

  while (compareLocalDate(cursor, last) <= 0 && weeks.length < MAX_CALENDAR_WEEKS) {
    const week: CalendarCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(cursor, day);
      week.push({
        date,
        inRange:
          compareLocalDate(date, from) >= 0 && compareLocalDate(date, last) <= 0,
      });
    }
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

/** Five years of columns. Past that the grid is unreadable whatever it says. */
const MAX_CALENDAR_WEEKS = 53 * 5;

/** The mean, or null for nothing at all — never zero. */
function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
