import { describe, expect, it } from 'vitest';
import { toLocalDate, addDays, type LocalDate } from '../../src/core/date';
import { smoothSeries } from '../../src/features/weight/domain/smoothing';

/**
 * Specs 9.2 and its first precision, made falsifiable.
 *
 * > Lissage : moyenne mobile sur 7 jours. Les jours sans mesure sont ignorés,
 * > sans interpolation.
 * > 1. Un point lissé n'existe que pour une date effectivement pesée. La courbe
 * >    lissée est trouée les jours sans mesure ; elle n'est jamais prolongée
 * >    artificiellement.
 */

const START = toLocalDate('2026-03-01');

function datesFrom(start: LocalDate, count: number): LocalDate[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

describe('the smoothed weight series', () => {
  it('averages over the window, ignoring the days with no measurement', () => {
    // Three measurements inside a seven-day window: the mean is over the three,
    // never over seven with four zeros.
    const dates = datesFrom(START, 7);
    const values = [80, null, null, 78, null, null, 76];

    const series = smoothSeries(dates, values);

    expect(series[6]?.smoothed).toBeCloseTo((80 + 78 + 76) / 3, 10);
  });

  it('never interpolates: a day nobody weighed has no smoothed point', () => {
    /**
     * THE MASK, AND THE CASE THAT SHOWS WHY IT MATTERS.
     *
     * A trailing mean has a value at every position whose window holds
     * anything. So without precision 1, weighing once and stopping would draw a
     * flat line across the six following days — in the one place a reader looks
     * to see whether anything moved. That is the "prolongée artificiellement"
     * the specs forbid.
     */
    const dates = datesFrom(START, 7);
    const values = [80, null, null, null, null, null, null];

    const series = smoothSeries(dates, values);

    expect(series[0]?.smoothed).toBe(80);
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(series[index]?.smoothed, `day ${index} must be a hole`).toBeNull();
      expect(series[index]?.raw).toBeNull();
    }
  });

  it('keeps the gaps as positions, so the axis stays a calendar', () => {
    // Dense on purpose: dropping the empty positions would put two points side
    // by side that are weeks apart.
    const dates = datesFrom(START, 10);
    const values = [80, null, null, null, null, null, null, null, null, 76];

    const series = smoothSeries(dates, values);

    expect(series).toHaveLength(10);
    expect(series.map((point) => point.date)).toEqual(dates);
  });

  it('is trailing, never centred', () => {
    // A centred window would need days that have not happened yet, so the last
    // points of any chart would be drawn from less data than the rest without
    // saying so.
    const dates = datesFrom(START, 3);
    const values = [70, 80, 90];

    const series = smoothSeries(dates, values);

    expect(series[0]?.smoothed).toBe(70);
    expect(series[1]?.smoothed).toBe(75);
    expect(series[2]?.smoothed).toBe(80);
  });

  it('counts the window in POSITIONS, not in measurements', () => {
    /**
     * Seven days back, however many of them were weighed — never the last seven
     * weighings. On a fortnight where three days were written down, the second
     * reading would average across three weeks and call it a weekly mean.
     *
     * Here the first measurement is eight days before the last, so it is out of
     * the window even though only three measurements exist.
     */
    const dates = datesFrom(START, 9);
    const values = [100, null, null, null, 78, null, null, null, 76];

    const series = smoothSeries(dates, values);

    // 100 is nine days back: outside a seven-day window.
    expect(series[8]?.smoothed).toBeCloseTo((78 + 76) / 2, 10);
  });

  it('carries the raw value through untouched', () => {
    const dates = datesFrom(START, 3);
    const series = smoothSeries(dates, [80.35, null, 79.9]);

    expect(series.map((point) => point.raw)).toEqual([80.35, null, 79.9]);
  });

  it('answers an empty series with an empty series', () => {
    expect(smoothSeries([], [])).toEqual([]);
  });
});
