import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { newId } from '../../src/core/id';
import type { SessionId } from '../../src/core/db/schema';
import type { ExerciseSessionPoint } from '../../src/features/strength/domain/exercise-stats';
import {
  bucketChartPoints,
  EXERCISE_RANGE_KEYS,
  exerciseRangeFor,
  exerciseRangeLabel,
} from '../../src/features/strength/domain/exercise-range';
import {
  EXERCISE_METRICS,
  metricCaption,
  metricFor,
  metricValueText,
} from '../../src/features/strength/domain/exercise-metric';

/**
 * The ranges of specs 10.1 and how a bucket of sessions is reduced.
 *
 * Pure throughout: `today` is a parameter, so these answer the same at +14 as
 * in Paris (D3), and the suite runs them under three zones.
 */

const TODAY = toLocalDate('2026-09-19');

function aPoint(date: string, over: Partial<ExerciseSessionPoint> = {}): ExerciseSessionPoint {
  return {
    sessionId: newId<SessionId>(),
    date: toLocalDate(date),
    startedAt: 0,
    setCount: 3,
    maxLoadKg: 70,
    bestOneRm: 88,
    bestSetVolume: 560,
    sessionVolume: 1680,
    totalReps: 24,
    ...over,
  };
}

describe('the three ranges of specs 10.1', () => {
  it('spans three months, a year, and everything there is', () => {
    const quarter = exerciseRangeFor('90', TODAY, toLocalDate('2020-01-01'));
    expect(quarter.days).toBe(90);
    expect(quarter.from).toBe('2026-06-22');

    const year = exerciseRangeFor('365', TODAY, toLocalDate('2020-01-01'));
    expect(year.days).toBe(365);

    const all = exerciseRangeFor('all', TODAY, toLocalDate('2026-08-01'));
    expect(all.from).toBe('2026-08-01');
  });

  it('follows D9 for the grain, and neither bound is inclusive', () => {
    /**
     * > Regroupement par semaine au-delà de 90 jours, par mois au-delà d'un an.
     *
     * Ninety is a range specs 10.1 offers BY NAME and stays per session; 365 is
     * likewise offered by name and is weekly, being beyond ninety and not
     * beyond a year. Reading either bound as inclusive would move a range the
     * user picked from the list onto the wrong grain.
     */
    expect(exerciseRangeFor('90', TODAY, null).grain).toBe('day');
    expect(exerciseRangeFor('365', TODAY, null).grain).toBe('week');
    // "Tout" over three years is beyond a year.
    expect(exerciseRangeFor('all', TODAY, toLocalDate('2023-01-01')).grain).toBe('month');
  });

  it('reads a short "tout" at the finest grain, because that is what it is', () => {
    // Two months of history read as "tout" IS the three-month range. Forcing a
    // coarse grain on it would hide every session behind a monthly mean for no
    // reason but the name of the button.
    const all = exerciseRangeFor('all', TODAY, toLocalDate('2026-08-01'));
    expect(all.grain).toBe('day');
  });

  it('survives an empty history and a date in the future', () => {
    // Neither is reachable from this application; both are reachable from a
    // hand-repaired archive, which D7 says must stay repairable.
    expect(exerciseRangeFor('all', TODAY, null)).toEqual({
      from: null,
      to: TODAY,
      days: 1,
      grain: 'day',
    });
    const future = exerciseRangeFor('all', TODAY, toLocalDate('2027-01-01'));
    expect(future.days).toBe(1);
    expect(future.grain).toBe('day');
  });

  it('labels every key, with no key unlabelled', () => {
    // The pair that PORTION_NAMES made impossible to get wrong: the type is
    // derived from the array, so this only has to check nothing returns blank.
    for (const key of EXERCISE_RANGE_KEYS) {
      expect(exerciseRangeLabel(key)).not.toBe('');
    }
  });
});

describe('bucketing the points of a range', () => {
  const points = [
    aPoint('2026-09-01', { maxLoadKg: 70, sessionVolume: 1000, totalReps: 20 }),
    aPoint('2026-09-03', { maxLoadKg: 80, sessionVolume: 2000, totalReps: 30 }),
    aPoint('2026-09-15', { maxLoadKg: 60, sessionVolume: 600, totalReps: 10 }),
  ];

  it('keeps one point per SESSION at the finest grain', () => {
    // Not one per civil day. Two sessions of one exercise in a day is unusual
    // and real, and merging them would hide the second.
    const range = exerciseRangeFor('90', TODAY, toLocalDate('2026-09-01'));
    const bucketed = bucketChartPoints(points, range, 'day');

    expect(bucketed).toHaveLength(3);
    expect(bucketed.every((point) => point.sessions === 1)).toBe(true);
  });

  it('takes the MAX of a bucket for the three maxima', () => {
    /**
     * A chart titled "charge maximale" whose points are averages contradicts
     * its own title: the heaviest thing lifted in a month is what anybody
     * means by that month's maximum.
     */
    const range = exerciseRangeFor('all', TODAY, toLocalDate('2026-09-01'));
    const [month] = bucketChartPoints(points, range, 'month');

    expect(month?.maxLoadKg).toBe(80);
    expect(month?.sessions).toBe(3);
    expect(month?.date).toBe('2026-09-01');
  });

  it('takes the MEAN of a bucket for the two per-session totals', () => {
    /**
     * D9: "la somme n'est licite que pour les compteurs". A month of volume
     * summed is a figure nobody lifted in one session — and a partial bucket
     * at the end of a range would read as a collapse simply because the month
     * is not over.
     */
    const range = exerciseRangeFor('all', TODAY, toLocalDate('2026-09-01'));
    const [month] = bucketChartPoints(points, range, 'month');

    expect(month?.sessionVolume).toBe(1200); // (1000 + 2000 + 600) / 3
    expect(month?.totalReps).toBe(20); // (20 + 30 + 10) / 3
  });

  it('groups by week on the Monday, which is what bucketOf means', () => {
    const range = exerciseRangeFor('365', TODAY, toLocalDate('2026-09-01'));
    const weeks = bucketChartPoints(points, range, 'week');

    // 1 and 3 September 2026 are a Tuesday and a Thursday of the same week;
    // the 15th is a fortnight later.
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.date).toBe('2026-08-31');
    expect(weeks[0]?.sessions).toBe(2);
    expect(weeks[1]?.date).toBe('2026-09-14');
  });

  it('drops what falls outside the range', () => {
    const range = exerciseRangeFor('90', TODAY, null);
    const withOld = [aPoint('2020-01-01'), ...points];

    expect(bucketChartPoints(withOld, range, 'day')).toHaveLength(3);
  });

  it('keeps a bucket with no volume at null, never at zero', () => {
    // A month of bodyweight sets. Zero would draw it at the floor rather than
    // as a gap — the rule of the whole slice.
    const bodyweight = [
      aPoint('2026-09-01', { maxLoadKg: null, sessionVolume: null, bestOneRm: null }),
      aPoint('2026-09-03', { maxLoadKg: null, sessionVolume: null, bestOneRm: null }),
    ];
    const range = exerciseRangeFor('all', TODAY, toLocalDate('2026-09-01'));
    const [month] = bucketChartPoints(bodyweight, range, 'month');

    expect(month?.sessionVolume).toBeNull();
    expect(month?.maxLoadKg).toBeNull();
    // The repetitions still average, which is the one series it can fill.
    expect(month?.totalReps).toBe(24);
  });

  it('keeps the chronological order of the buckets', () => {
    const range = exerciseRangeFor('365', TODAY, toLocalDate('2026-09-01'));
    const dates = bucketChartPoints(points, range, 'week').map((point) => point.date);

    expect([...dates].sort()).toEqual(dates);
  });
});

describe('the five metrics', () => {
  it('names the five series of specs 10.1, once each', () => {
    expect(EXERCISE_METRICS).toHaveLength(5);
    expect(new Set(EXERCISE_METRICS.map((metric) => metric.key)).size).toBe(5);
  });

  it('reads the field its label promises', () => {
    const point = {
      date: toLocalDate('2026-09-01'),
      sessions: 1,
      maxLoadKg: 70,
      bestOneRm: 88,
      bestSetVolume: 560,
      sessionVolume: 1680,
      totalReps: 24,
    };

    expect(metricFor('load').value(point)).toBe(70);
    expect(metricFor('onerm').value(point)).toBe(88);
    expect(metricFor('setvolume').value(point)).toBe(560);
    expect(metricFor('sessionvolume').value(point)).toBe(1680);
    expect(metricFor('reps').value(point)).toBe(24);
  });

  it('says how a bucket was reduced, and only when it was', () => {
    /**
     * The caption is what stops a monthly mean of four workouts reading as one
     * workout. At the per-session grain there is nothing to explain, and a
     * line saying so would be noise on the range people use most.
     */
    expect(metricCaption(metricFor('load'), 'day')).toBeNull();
    expect(metricCaption(metricFor('load'), 'week')).toBe('Maximum par semaine');
    expect(metricCaption(metricFor('sessionvolume'), 'month')).toBe('Moyenne par mois');
  });

  it('writes values in French, with no trailing zero and no unit on a count', () => {
    expect(metricValueText(metricFor('load'), 72.5)).toBe('72,5 kg');
    expect(metricValueText(metricFor('load'), 70)).toBe('70 kg');
    expect(metricValueText(metricFor('setvolume'), 1160.4)).toBe('1160 kg');
    // Repetitions are a count: "24 " with a dangling space would be the bug a
    // shared formatter produces.
    expect(metricValueText(metricFor('reps'), 24)).toBe('24');
  });
});
