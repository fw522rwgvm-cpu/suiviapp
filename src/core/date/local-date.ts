/**
 * Civil dates (D3).
 *
 * A day is a local civil date, stored as TEXT 'YYYY-MM-DD'. An instant is an
 * epoch millisecond integer, reserved for technical traces and real durations.
 *
 * > An instant never, under any circumstance, decides which day a piece of
 * > data belongs to.
 *
 * The whole module is deliberately free of the Date constructor. Arithmetic
 * runs on a day number derived from the proleptic Gregorian calendar, so
 * addDays and diffDays give the same answer in every timezone by construction
 * rather than by care. Only "what day is it now" reads the clock, and it does
 * so through the local calendar fields, never by parsing a string.
 *
 * `new Date('2026-09-10')` is read as midnight UTC and yields the 9th of
 * September anywhere west of Greenwich. That is the bug this module exists to
 * make unwriteable.
 */

declare const localDateBrand: unique symbol;

/**
 * Branded so a civil date can never be passed where an instant is expected,
 * nor built by concatenating strings (conventions, section 4).
 */
export type LocalDate = string & { readonly [localDateBrand]: true };

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function isValidParts({ year, month, day }: DateParts): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Builds a civil date from its fields. Throws on a date that does not exist. */
export function localDateFromParts(parts: DateParts): LocalDate {
  if (!isValidParts(parts)) {
    throw new RangeError(
      `Not a civil date: ${parts.year}-${parts.month}-${parts.day}`,
    );
  }
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}` as LocalDate;
}

/** Returns null rather than throwing: an expected failure is a value (section 4). */
export function parseLocalDate(value: string): LocalDate | null {
  const match = PATTERN.exec(value);
  if (match === null) return null;

  const parts: DateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  // Rejects 2026-02-30 and friends: matching the shape is not being a date.
  return isValidParts(parts) ? (value as LocalDate) : null;
}

export function isLocalDate(value: string): value is LocalDate {
  return parseLocalDate(value) !== null;
}

/** Validating entry point for data crossing a boundary. Throws. */
export function toLocalDate(value: string): LocalDate {
  const parsed = parseLocalDate(value);
  if (parsed === null) {
    throw new RangeError(`Not a civil date: ${JSON.stringify(value)}`);
  }
  return parsed;
}

export function localDateParts(date: LocalDate): DateParts {
  // Already validated by construction, so the shape is known.
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/**
 * Days since 1970-01-01, by Howard Hinnant's civil calendar algorithm.
 * Pure integer arithmetic: no Date, therefore no timezone, therefore no
 * daylight saving transition able to turn a day into 23 or 25 hours.
 */
export function toDayNumber(date: LocalDate): number {
  const { year, month, day } = localDateParts(date);
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromDayNumber(dayNumber: number): LocalDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      365,
  );
  const y = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return localDateFromParts({ year: y + (month <= 2 ? 1 : 0), month, day });
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Sorts chronologically, which for this format is also sorting
 * alphabetically. That property is the reason the format is TEXT (D3).
 */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const MONDAY = 1;
export const SUNDAY = 7;

/** ISO weekday: 1 is Monday, 7 is Sunday. The week starts on Monday (D3). */
export function weekday(date: LocalDate): number {
  // 1970-01-01 was a Thursday, ISO weekday 4.
  const shifted = (toDayNumber(date) + 3) % 7;
  return (shifted < 0 ? shifted + 7 : shifted) + 1;
}

export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -(weekday(date) - MONDAY));
}

export function endOfWeek(date: LocalDate): LocalDate {
  return addDays(startOfWeek(date), 6);
}
