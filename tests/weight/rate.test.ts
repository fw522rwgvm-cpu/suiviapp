import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate, type LocalDate } from '../../src/core/date';
import {
  latestSmoothed,
  RATE_LOAD_DAYS,
  RATE_MIN_POINTS,
  RATE_WINDOW_DAYS,
  realRate,
} from '../../src/features/weight/domain/rate';
import { smoothSeries } from '../../src/features/weight/domain/smoothing';
import type { WeightPoint } from '../../src/features/weight/domain/smoothing';

/**
 * Specs 9.2 precision 2, made falsifiable.
 *
 * > Le rythme réel exige au moins 7 mesures sur les 14 derniers jours. En deçà,
 * > l'application affiche « données insuffisantes » EN DISANT POURQUOI, et non
 * > un chiffre. Une régression sur trois points produit une pente spectaculaire
 * > et fausse.
 */

const START = toLocalDate('2026-03-01');

/** A smoothed point straight out, so the regression can be tested on its own. */
function point(date: LocalDate, smoothed: number | null): WeightPoint {
  return { date, raw: smoothed, smoothed };
}

/** `count` daily points on a perfect slope of `kgPerDay`. */
function slope(count: number, kgPerDay: number, from = 80): WeightPoint[] {
  return Array.from({ length: count }, (_, index) =>
    point(addDays(START, index), from + kgPerDay * index),
  );
}

describe('the real rate', () => {
  it('finds the slope of a straight line, in kilograms per WEEK', () => {
    // A tenth of a kilo a day is 0.7 a week — and the unit specs 9.2 speaks in
    // is the week, so the conversion is part of the answer rather than the
    // caller's job.
    const rate = realRate(slope(14, -0.1));

    expect(rate.ok).toBe(true);
    if (rate.ok) expect(rate.kgPerWeek).toBeCloseTo(-0.7, 10);
  });

  it('keeps the sign: losing weight is a negative rate', () => {
    const losing = realRate(slope(14, -0.05));
    const gaining = realRate(slope(14, 0.05));

    expect(losing.ok && losing.kgPerWeek).toBeLessThan(0);
    expect(gaining.ok && gaining.kgPerWeek).toBeGreaterThan(0);
  });

  it('refuses below seven points, and SAYS how many there are', () => {
    // "En disant pourquoi" is normative: the screen has to be able to write
    // "4 mesures sur les 14 derniers jours, il en faut 7", which it cannot do
    // from a bare null.
    const rate = realRate(slope(6, -0.1));

    expect(rate.ok).toBe(false);
    if (!rate.ok) {
      expect(rate.points).toBe(6);
      expect(rate.required).toBe(RATE_MIN_POINTS);
    }
  });

  it('accepts exactly seven, because the floor is "at least"', () => {
    expect(realRate(slope(7, -0.1)).ok).toBe(true);
  });

  it('counts only the days that carry a smoothed point', () => {
    // Holes are not measurements. Fourteen positions, six of them weighed.
    const points = Array.from({ length: 14 }, (_, index) =>
      point(addDays(START, index), index % 2 === 0 && index < 12 ? 80 - index * 0.1 : null),
    );

    const rate = realRate(points);

    expect(rate.ok).toBe(false);
    if (!rate.ok) expect(rate.points).toBe(6);
  });

  it('measures against DAYS, not against positions in the array', () => {
    /**
     * Three weighings a week apart and three weighings on consecutive days are
     * not the same rate, and an x axis counting positions would call them
     * equal.
     *
     * Here: seven points, one a week apart, losing a kilo each time. That is
     * one kilo per week — a position-based fit would report seven.
     */
    const points = Array.from({ length: 7 }, (_, index) =>
      point(addDays(START, index * 7), 80 - index),
    );

    const rate = realRate(points);

    expect(rate.ok).toBe(true);
    if (rate.ok) expect(rate.kgPerWeek).toBeCloseTo(-1, 10);
  });

  it('reports insufficiency rather than infinity when every point is one date', () => {
    // Impossible through the reads — date is the primary key — but reachable
    // through a hand-repaired archive. A vertical line divides by zero, and a
    // chart drawing an infinite slope is not a true statement about it.
    const points = Array.from({ length: 8 }, (_, index) => point(START, 80 - index));

    const rate = realRate(points);

    expect(rate.ok).toBe(false);
    if (!rate.ok) expect(rate.points).toBe(8);
  });

  it('blunts an outlier at the ENDS, which is where an outlier actually hurts', () => {
    /**
     * WHAT SMOOTHING BUYS THE REGRESSION — measured, not assumed.
     *
     * The first version of this test asserted that smoothing helps wherever the
     * spike falls. It does not, and the test caught it. Running the spike
     * across all fourteen positions against a clean reference gives:
     *
     *   position  0  1 | 2  3  4  5 | 6  7  8  9 | 10 11 12 13
     *   helps?    no no | Y  Y  Y  Y | no no no no | Y  Y  Y  Y
     *
     * The shape is leverage. In least squares a point's influence on the slope
     * grows with its distance from the centre of x, so a spike at either END
     * levers the whole line while one in the MIDDLE barely moves it. Smoothing
     * spreads a spike over the following seven days — which drags a high-
     * leverage outlier toward the middle, and a harmless middle one toward the
     * end.
     *
     * So it trades a large error for a small one, which is the trade worth
     * making: the middle case it worsens was nearly free to begin with.
     *
     * Pinned at position 13, the worst raw case, where a single bad morning
     * weighing would otherwise dominate the whole fortnight's rate.
     */
    const clean = Array.from({ length: 14 }, (_, index) => 80 - index * 0.1);
    const spiked = [...clean];
    spiked[13] = (spiked[13] ?? 0) + 2;

    const dates = Array.from({ length: 14 }, (_, index) => addDays(START, index));
    const rawFit = realRate(dates.map((date, index) => point(date, spiked[index] ?? null)));
    const rawClean = realRate(dates.map((date, index) => point(date, clean[index] ?? null)));
    const smoothedFit = realRate(smoothSeries(dates, spiked));
    const smoothedClean = realRate(smoothSeries(dates, clean));

    expect(rawFit.ok && rawClean.ok && smoothedFit.ok && smoothedClean.ok).toBe(true);
    if (!rawFit.ok || !rawClean.ok || !smoothedFit.ok || !smoothedClean.ok) return;

    // Each series is compared against ITS OWN undisturbed answer, never across
    // the two: the smoothed slope of a short window is biased in its own right,
    // which is the test below.
    expect(Math.abs(smoothedFit.kgPerWeek - smoothedClean.kgPerWeek)).toBeLessThan(
      Math.abs(rawFit.kgPerWeek - rawClean.kgPerWeek),
    );
  });
});

describe('how much history the regression needs loaded', () => {
  it('asks for six days more than its window', () => {
    /**
     * THE EASIEST THING IN THIS SLICE TO GET WRONG.
     *
     * Each smoothed point is a seven-day trailing mean, so the oldest point of
     * a fourteen-day window needs the six days before it to exist at all.
     * Loading exactly fourteen would not fail — it would compute the early
     * points from short windows, making them noisier and tilting the very slope
     * being measured.
     */
    expect(RATE_LOAD_DAYS).toBe(RATE_WINDOW_DAYS + 6);
  });

  it('and loading only the window understates the rate by a fifth', () => {
    /**
     * THE FALSIFIABLE HALF, AND THE FIGURE IS WORSE THAN "IT CHANGES A LITTLE".
     *
     * On a perfectly straight loss of 0.7 kg a week:
     *
     *   loaded 14, smoothed, fitted   →  -0.5438 kg/week   (22.3 % too slow)
     *   loaded 20, smoothed, last 14  →  -0.7000 kg/week   (exact)
     *
     * A full trailing mean over a straight line is the same line shifted, so it
     * has the SAME slope — the bias comes entirely from the first six points,
     * whose windows are short and which therefore sit too low. Fitting them
     * flattens the line.
     *
     * Nobody would ever see it. "Vous perdez 0,54 kg par semaine" is a
     * perfectly believable sentence, and it is wrong by a fifth — which is the
     * only kind of wrong this project treats as serious.
     */
    const history = Array.from({ length: RATE_LOAD_DAYS }, (_, index) => 80 - index * 0.1);
    const dates = Array.from({ length: RATE_LOAD_DAYS }, (_, index) => addDays(START, index));

    const full = realRate(smoothSeries(dates, history).slice(-RATE_WINDOW_DAYS));
    const truncated = realRate(
      smoothSeries(dates.slice(-RATE_WINDOW_DAYS), history.slice(-RATE_WINDOW_DAYS)),
    );

    expect(full.ok && truncated.ok).toBe(true);
    if (!full.ok || !truncated.ok) return;

    // The true slope, recovered exactly once every window is full.
    expect(full.kgPerWeek).toBeCloseTo(-0.7, 10);
    // And the short-window answer, pinned so the cost is a number rather than
    // a warning: too slow, by more than a fifth.
    expect(truncated.kgPerWeek).toBeCloseTo(-0.5438, 3);
    expect(Math.abs(truncated.kgPerWeek)).toBeLessThan(Math.abs(full.kgPerWeek) * 0.8);
  });
});

describe('the latest smoothed value', () => {
  it('skips the holes at the end rather than answering null', () => {
    // Someone who stopped weighing three days ago still has a current weight.
    const dates = Array.from({ length: 5 }, (_, index) => addDays(START, index));
    const series = smoothSeries(dates, [80, 79.5, null, null, null]);

    expect(latestSmoothed(series)).toBeCloseTo(79.75, 10);
  });

  it('is null when nothing was ever weighed', () => {
    const dates = Array.from({ length: 3 }, (_, index) => addDays(START, index));
    expect(latestSmoothed(smoothSeries(dates, [null, null, null]))).toBeNull();
  });
});
