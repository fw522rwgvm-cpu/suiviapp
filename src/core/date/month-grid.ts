import {
  daysInMonth,
  localDateFromParts,
  localDateParts,
  weekday,
  type LocalDate,
} from './local-date';

/**
 * The cells of a month, laid out in weeks starting on Monday (D3).
 *
 * Lives in core/date rather than in the calendar component for two reasons: it
 * is civil arithmetic, not layout, and D10 keeps calculation out of components.
 * Being a pure function, it is also testable under every timezone, which is
 * where a calendar is most likely to be quietly wrong.
 *
 * Leading nulls pad the first week so the first day of the month lands in its
 * real weekday column. The result is never padded at the end: a trailing blank
 * row draws nothing.
 */
export function monthGrid(month: LocalDate): (LocalDate | null)[] {
  const { year, month: monthNumber } = localDateParts(month);
  const first = localDateFromParts({ year, month: monthNumber, day: 1 });

  // Monday is 1, so a month opening on a Wednesday needs two blanks, and one
  // opening on a Sunday needs six.
  const leading = weekday(first) - 1;
  const total = daysInMonth(year, monthNumber);

  return [
    ...Array.from<LocalDate | null>({ length: leading }).fill(null),
    ...Array.from({ length: total }, (_, index) =>
      localDateFromParts({ year, month: monthNumber, day: index + 1 }),
    ),
  ];
}

/** First day of the month before the one holding `date`. */
export function previousMonth(date: LocalDate): LocalDate {
  const { year, month } = localDateParts(date);
  return month === 1
    ? localDateFromParts({ year: year - 1, month: 12, day: 1 })
    : localDateFromParts({ year, month: month - 1, day: 1 });
}

/** First day of the month after the one holding `date`. */
export function nextMonth(date: LocalDate): LocalDate {
  const { year, month } = localDateParts(date);
  return month === 12
    ? localDateFromParts({ year: year + 1, month: 1, day: 1 })
    : localDateFromParts({ year, month: month + 1, day: 1 });
}
