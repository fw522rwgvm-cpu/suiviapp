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
export function formatDayTitle(date: LocalDate, today: LocalDate): string {
  const offset = diffDays(today, date);
  if (offset === 0) return "Aujourd'hui";
  if (offset === -1) return 'Hier';
  if (offset === 1) return 'Demain';

  const sameYear = localDateParts(date).year === localDateParts(today).year;
  const base = `${weekdayName(date)} ${formatDayAndMonth(date)}`;
  return sameYear ? base : `${base} ${localDateParts(date).year}`;
}
