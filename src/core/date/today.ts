import { addDays, localDateFromParts, type LocalDate } from './local-date';

/**
 * The current day (D3).
 *
 * > A single function decides what today is, cutoff included, and serves the
 * > whole application, notification conditions included.
 *
 * Everything else in core/date is timezone-independent by construction. This is
 * the one place that reads the clock, and it does so through the local calendar
 * fields of the Date object — never by formatting or parsing a string.
 */

export const MIN_CUTOFF_HOUR = 0;
export const MAX_CUTOFF_HOUR = 6;
export const DEFAULT_CUTOFF_HOUR = 0;

/**
 * The specs bound the cutoff between 0h and 6h (8.2). This value is read from
 * the settings table, so it can be absent or corrupted; clamping keeps a bad
 * row from deciding which day an entry lands on. An out-of-range value is a
 * settings bug, never a reason to refuse to tell the time.
 */
export function normalizeCutoffHour(hour: number | null | undefined): number {
  if (hour === null || hour === undefined || !Number.isFinite(hour)) {
    return DEFAULT_CUTOFF_HOUR;
  }
  const whole = Math.trunc(hour);
  if (whole < MIN_CUTOFF_HOUR) return MIN_CUTOFF_HOUR;
  if (whole > MAX_CUTOFF_HOUR) return MAX_CUTOFF_HOUR;
  return whole;
}

/**
 * Civil date of the instant, in the device's timezone, ignoring any cutoff.
 * Reads calendar fields directly, so it is correct at +14 and at -11 alike.
 */
export function localDateOf(instant: Date): LocalDate {
  return localDateFromParts({
    year: instant.getFullYear(),
    month: instant.getMonth() + 1,
    day: instant.getDate(),
  });
}

/**
 * The day the application considers current.
 *
 * Before the cutoff hour, the day has not turned over yet: at 2am with a 4am
 * cutoff, today is still yesterday's civil date. This only decides the date
 * proposed by default (specs 8.2). It changes nothing already stored, and a
 * wrong date is corrected in one gesture.
 *
 * The shift goes through addDays, which walks the civil calendar rather than
 * subtracting 24 hours from an instant: a daylight saving night is 23 or 25
 * hours long, and subtracting milliseconds there lands on the wrong day twice
 * a year.
 *
 * ## THE CUTOFF HAS NO DEFAULT, AND THAT IS DELIBERATE
 *
 * It had one — midnight — for six slices, because nothing read the setting yet.
 * Slice 7 makes it readable, and the default became the dangerous part: a call
 * site that forgot to pass the preference would silently keep answering from
 * midnight. Not an error, not a crash — the WRONG DAY, plausibly, on the one
 * screen whose entire job is to open on the right one.
 *
 * Making the parameter required turns that into a compile error. tsc names
 * every caller, and a new one cannot be written without deciding where its
 * cutoff comes from. useToday in features/settings is where it comes from for
 * everything on screen; tests pass it literally.
 */
export function currentLocalDate(cutoffHour: number, now: Date = new Date()): LocalDate {
  const cutoff = normalizeCutoffHour(cutoffHour);
  const civil = localDateOf(now);
  return now.getHours() >= cutoff ? civil : addDays(civil, -1);
}
