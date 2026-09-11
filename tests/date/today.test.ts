import { describe, expect, it } from 'vitest';
import {
  currentLocalDate,
  DEFAULT_CUTOFF_HOUR,
  localDateOf,
  normalizeCutoffHour,
} from '../../src/core/date';

/**
 * The single current-day function (D3), under several timezones (D15).
 *
 * This is the one function in core/date that reads the clock, so it is the one
 * place a timezone bug can still hide. The assertions below build instants from
 * local calendar fields, so each zone answers for itself.
 */

const TZ = process.env.TZ ?? 'unset';

/** An instant expressed in the device's own zone, whatever that zone is. */
function localInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe(`current day [TZ=${TZ}]`, () => {
  it('reads the civil date of an instant in the local zone', () => {
    expect(localDateOf(localInstant(2026, 9, 10, 12))).toBe('2026-09-10');
    expect(localDateOf(localInstant(2026, 9, 10, 0))).toBe('2026-09-10');
    expect(localDateOf(localInstant(2026, 9, 10, 23, 59))).toBe('2026-09-10');
  });

  it('returns the civil date itself when the cutoff is midnight', () => {
    expect(DEFAULT_CUTOFF_HOUR).toBe(0);
    expect(currentLocalDate(0, localInstant(2026, 9, 10, 0, 1))).toBe('2026-09-10');
    expect(currentLocalDate(0, localInstant(2026, 9, 10, 23, 59))).toBe('2026-09-10');
  });

  it('holds the day open until the cutoff hour', () => {
    // 2am with a 4am cutoff is still the previous day.
    expect(currentLocalDate(4, localInstant(2026, 9, 10, 2))).toBe('2026-09-09');
    expect(currentLocalDate(4, localInstant(2026, 9, 10, 3, 59))).toBe('2026-09-09');
    expect(currentLocalDate(4, localInstant(2026, 9, 10, 4))).toBe('2026-09-10');
    expect(currentLocalDate(4, localInstant(2026, 9, 10, 12))).toBe('2026-09-10');
  });

  it('walks the calendar backwards across month and year boundaries', () => {
    expect(currentLocalDate(5, localInstant(2026, 10, 1, 2))).toBe('2026-09-30');
    expect(currentLocalDate(5, localInstant(2027, 1, 1, 2))).toBe('2026-12-31');
    expect(currentLocalDate(5, localInstant(2028, 3, 1, 2))).toBe('2028-02-29');
  });

  it('clamps a cutoff outside the range the specs allow', () => {
    // The value comes from the settings table, so it can be absent or wrong.
    // A bad row must not decide which day an entry lands on.
    expect(normalizeCutoffHour(null)).toBe(0);
    expect(normalizeCutoffHour(undefined)).toBe(0);
    expect(normalizeCutoffHour(Number.NaN)).toBe(0);
    expect(normalizeCutoffHour(-3)).toBe(0);
    expect(normalizeCutoffHour(11)).toBe(6);
    expect(normalizeCutoffHour(4)).toBe(4);
    expect(normalizeCutoffHour(4.7)).toBe(4);
  });

  it('never disagrees with the local calendar fields', () => {
    // Sweeping a whole day hour by hour: with a midnight cutoff the answer must
    // be exactly what the device's own calendar says, in every zone.
    for (let hour = 0; hour < 24; hour += 1) {
      const instant = localInstant(2026, 9, 10, hour);
      expect(currentLocalDate(0, instant)).toBe(localDateOf(instant));
    }
  });
});
