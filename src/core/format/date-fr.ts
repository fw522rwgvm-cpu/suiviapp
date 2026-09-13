import { diffDays, localDateParts, weekday, type LocalDate } from '@/core/date';

/**
 * French rendering of a civil date.
 *
 * Written out rather than delegated. date-fns is allowed by section 5 but not
 * required, and Intl would need a Date object built from the string — the one
 * move D3 forbids. Everything here reads a LocalDate through core/date, so no
 * timezone can reach it: these functions give the same answer at +14 as in
 * Paris, by construction rather than by care.
 *
 * Nineteen strings is not a reason to take on a dependency, and D10 rules out
 * internationalisation libraries anyway: the interface is French only.
 */

/** Indexed by ISO weekday: 1 is Monday, 7 is Sunday (D3). */
const WEEKDAYS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

/**
 * The same seven, abbreviated as French abbreviates them: three letters and a
 * full stop. Written out rather than sliced from the long names, because that
 * is only true by accident — it would break the day a language, or a name,
 * abbreviated differently.
 */
const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[weekday(date) - 1] ?? '';
}

/**
 * The name of an ISO weekday, 1 being Monday — for the planning, which is keyed
 * by the number and has no date to hand.
 *
 * Exported rather than letting the screen carry its own seven words: a second
 * list is a list free to diverge, and the one that would drift is the one
 * beside planning_weekday. Capitalised by the caller if it heads a row.
 */
export function weekdayNameOf(isoWeekday: number): string {
  return WEEKDAYS[isoWeekday - 1] ?? '';
}

export function monthName(date: LocalDate): string {
  return MONTHS[localDateParts(date).month - 1] ?? '';
}

/** "vendredi 11 septembre 2026". */
export function formatLongDate(date: LocalDate): string {
  const { year, day } = localDateParts(date);
  return `${weekdayName(date)} ${day} ${monthName(date)} ${year}`;
}

/** "11 septembre" — no weekday, no year. */
export function formatDayAndMonth(date: LocalDate): string {
  return `${localDateParts(date).day} ${monthName(date)}`;
}

/**
 * The title of the Journal screen.
 *
 * Named days for the three the user actually lives in, and a dated label
 * beyond. The year only appears when it is not the current one, which keeps
 * the common case short without ever being ambiguous about an old entry.
 *
 * `today` is a parameter rather than a call to the clock, so this stays pure
 * and the single function that decides what today is remains the one in
 * core/date (D3).
 */
export function weekdayShortName(date: LocalDate): string {
  return WEEKDAYS_SHORT[weekday(date) - 1] ?? '';
}

/**
 * The short label of the Journal bar: "Aujourd'hui", or "mar. 15/09".
 *
 * Named days for the three the user actually lives in, and a compact dated
 * label beyond — short enough to sit in a navigation bar beside two buttons
 * without ever being truncated, which formatDayTitle's "mardi 15 septembre"
 * could not promise.
 *
 * The year appears only when it is not the current one. That keeps the common
 * case to eleven characters while never being ambiguous about an old entry,
 * which is the rule formatDayTitle already follows.
 *
 * `today` is a parameter rather than a call to the clock, so this stays pure
 * and the single function that decides what today is remains the one in
 * core/date (D3).
 */
export function formatDayShort(date: LocalDate, today: LocalDate): string {
  const offset = diffDays(today, date);
  if (offset === 0) return "Aujourd'hui";
  if (offset === -1) return 'Hier';
  if (offset === 1) return 'Demain';

  const { year, month, day } = localDateParts(date);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const base = `${weekdayShortName(date)} ${pad(day)}/${pad(month)}`;
  return year === localDateParts(today).year ? base : `${base}/${year}`;
}

export function formatDayTitle(date: LocalDate, today: LocalDate): string {
  const offset = diffDays(today, date);
  if (offset === 0) return "Aujourd'hui";
  if (offset === -1) return 'Hier';
  if (offset === 1) return 'Demain';

  const sameYear = localDateParts(date).year === localDateParts(today).year;
  const base = `${weekdayName(date)} ${formatDayAndMonth(date)}`;
  return sameYear ? base : `${base} ${localDateParts(date).year}`;
}
