import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareLocalDate,
  diffDays,
  endOfWeek,
  fromDayNumber,
  isLocalDate,
  localDateFromParts,
  parseLocalDate,
  startOfWeek,
  toDayNumber,
  toLocalDate,
  weekday,
} from '../../src/core/date';

/**
 * Civil date arithmetic (D3), run under several timezones (D15).
 *
 * The whole suite is executed under UTC, a zone west of Greenwich, and a zone
 * beyond +12. None of these assertions mentions a timezone, which is the point:
 * a civil date that shifts with the device's zone would fail them.
 */

const TZ = process.env.TZ ?? 'unset';

describe(`civil dates [TZ=${TZ}]`, () => {
  it('accepts a well formed date and rejects a merely well shaped one', () => {
    expect(isLocalDate('2026-09-10')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-00-10')).toBe(false);
    expect(isLocalDate('2026-04-31')).toBe(false);
    expect(isLocalDate('2026-9-10')).toBe(false);
    expect(isLocalDate('10/09/2026')).toBe(false);
    expect(isLocalDate('')).toBe(false);
  });

  it('returns a value on failure rather than throwing', () => {
    // An expected failure is a return value (conventions, section 4).
    expect(parseLocalDate('nope')).toBeNull();
    expect(() => toLocalDate('nope')).toThrow(RangeError);
  });

  it('never lets the Date constructor decide which day a string is', () => {
    // This is the bug the module exists for: new Date('2026-09-10') is read as
    // midnight UTC and yields the 9th anywhere west of Greenwich.
    const date = toLocalDate('2026-09-10');
    expect(date).toBe('2026-09-10');
    expect(addDays(date, 0)).toBe('2026-09-10');
    expect(fromDayNumber(toDayNumber(date))).toBe('2026-09-10');
  });

  it('is right where the Date constructor is wrong', () => {
    // The ONLY place in this repository allowed to call the Date constructor on
    // a 'YYYY-MM-DD' string. It is here as executable documentation of the ban:
    // the constructor reads the string as midnight UTC, so west of Greenwich it
    // reports the 9th. Under TZ=America/New_York this assertion demonstrates
    // the bug; under UTC and +14 it does not fire. Our module says the 10th in
    // all three.
    const viaConstructor = new Date('2026-09-10');
    const viaModule = toLocalDate('2026-09-10');

    expect(viaModule).toBe('2026-09-10');
    expect(localDateFromParts({ year: 2026, month: 9, day: 10 })).toBe(viaModule);

    if (viaConstructor.getDate() !== 10) {
      expect(viaConstructor.getDate()).toBe(9);
      expect(String(viaConstructor.getDate())).not.toBe(viaModule.slice(8, 10));
    }
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays(toLocalDate('2026-09-10'), 1)).toBe('2026-09-11');
    expect(addDays(toLocalDate('2026-09-30'), 1)).toBe('2026-10-01');
    expect(addDays(toLocalDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(toLocalDate('2027-01-01'), -1)).toBe('2026-12-31');
    expect(addDays(toLocalDate('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(toLocalDate('2028-02-29'), 1)).toBe('2028-03-01');
    expect(addDays(toLocalDate('2026-02-28'), 1)).toBe('2026-03-01');
  });

  it('crosses a daylight saving transition without losing a day', () => {
    // Last Sunday of March in Europe, first Sunday of November in the US.
    // Subtracting 24 hours from an instant lands on the wrong day here.
    expect(addDays(toLocalDate('2026-03-28'), 1)).toBe('2026-03-29');
    expect(addDays(toLocalDate('2026-03-29'), 1)).toBe('2026-03-30');
    expect(addDays(toLocalDate('2026-11-01'), 1)).toBe('2026-11-02');
  });

  it('counts days in both directions, symmetrically', () => {
    const from = toLocalDate('2026-09-10');
    const to = toLocalDate('2026-10-10');
    expect(diffDays(from, to)).toBe(30);
    expect(diffDays(to, from)).toBe(-30);
    expect(diffDays(from, from)).toBe(0);
    // A full non-leap year, then a leap one.
    expect(diffDays(toLocalDate('2026-01-01'), toLocalDate('2027-01-01'))).toBe(365);
    expect(diffDays(toLocalDate('2028-01-01'), toLocalDate('2029-01-01'))).toBe(366);
  });

  it('round trips through the day number over a long span', () => {
    const start = toLocalDate('2024-01-01');
    let date = start;
    for (let index = 0; index < 1500; index += 1) {
      expect(fromDayNumber(toDayNumber(date))).toBe(date);
      date = addDays(date, 1);
    }
    // 2024 is a leap year: 366 + 365 + 365 + 365 = 1461 days to 2028-01-01,
    // then 39 more. Cross-checked against diffDays so the literal below cannot
    // drift along with a bug in the arithmetic it is meant to pin down.
    expect(diffDays(start, date)).toBe(1500);
    expect(date).toBe('2028-02-09');
    expect(addDays(start, 1500)).toBe(date);
  });

  it('starts the week on Monday', () => {
    // 2026-09-10 is a Thursday.
    expect(weekday(toLocalDate('2026-09-07'))).toBe(1);
    expect(weekday(toLocalDate('2026-09-10'))).toBe(4);
    expect(weekday(toLocalDate('2026-09-13'))).toBe(7);
    expect(startOfWeek(toLocalDate('2026-09-10'))).toBe('2026-09-07');
    expect(startOfWeek(toLocalDate('2026-09-07'))).toBe('2026-09-07');
    expect(startOfWeek(toLocalDate('2026-09-13'))).toBe('2026-09-07');
    expect(endOfWeek(toLocalDate('2026-09-10'))).toBe('2026-09-13');
  });

  it('keeps the weekday numbering the planning table expects', () => {
    // planning_weekday documents 1 = Monday (schema 2.3).
    const monday = toLocalDate('2026-09-07');
    for (let offset = 0; offset < 7; offset += 1) {
      expect(weekday(addDays(monday, offset))).toBe(offset + 1);
    }
  });

  it('sorts chronologically by sorting alphabetically', () => {
    // The reason the format is TEXT rather than an integer (D3).
    const dates = ['2026-10-01', '2026-09-30', '2027-01-01', '2026-01-02'].map(toLocalDate);
    expect([...dates].sort()).toEqual([
      '2026-01-02',
      '2026-09-30',
      '2026-10-01',
      '2027-01-01',
    ]);
    expect(compareLocalDate(dates[1]!, dates[0]!)).toBe(-1);
    expect(compareLocalDate(dates[0]!, dates[0]!)).toBe(0);
  });

  it('refuses to build a date that does not exist', () => {
    expect(() => localDateFromParts({ year: 2026, month: 2, day: 30 })).toThrow(RangeError);
    expect(() => localDateFromParts({ year: 2026, month: 0, day: 1 })).toThrow(RangeError);
    expect(localDateFromParts({ year: 2026, month: 9, day: 1 })).toBe('2026-09-01');
  });
});
