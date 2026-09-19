import type { Grain } from '@/core/db/date-bucket';
import type { ChartPoint } from './exercise-range';

/**
 * The five series of specs 10.1, described once (D9).
 *
 * > Graphiques sur 3 mois / 1 an / tout : charge maximale, 1RM estimé,
 * > meilleur volume de série, volume de séance, total de répétitions.
 *
 * A LIST IN DATA, with the type derived from it — the shape PORTION_NAMES set
 * in slice 3. The chooser walks it, the chart reads one entry, and the two
 * cannot disagree about how many there are or what one is called. A union of
 * literals beside a hand-kept array is exactly the pair this project stopped
 * writing.
 *
 * Each entry carries everything that differs between the five: which field of
 * a point it reads, what it is called, its unit, and how a bucket of sessions
 * is aggregated. The last is not decoration — it is what the subtitle says out
 * loud when the grain is coarser than one session, so nobody reads a monthly
 * mean as a single workout.
 */

export interface ExerciseMetric {
  key: string;
  /** For the chooser: short enough for a chip. */
  short: string;
  /** For the chart heading: the full name specs 10.1 gives. */
  label: string;
  /** Appended to a value, with a space. Empty for a bare count. */
  unit: string;
  /** How many decimals a value is written with. */
  decimals: number;
  /**
   * How a bucket of several sessions is reduced (see bucketChartPoints).
   *
   * 'max' for the three that are already maxima — a chart titled "charge
   * maximale" whose points were averages would contradict its own title.
   * 'mean' for the two per-session totals, because D9 allows a sum only for
   * counters and a month of volume is a figure nobody lifted in one session.
   */
  aggregate: 'max' | 'mean';
  value: (point: ChartPoint) => number | null;
}

export const EXERCISE_METRICS = [
  {
    key: 'load',
    short: 'Charge',
    label: 'Charge maximale',
    unit: 'kg',
    decimals: 1,
    aggregate: 'max',
    value: (point) => point.maxLoadKg,
  },
  {
    key: 'onerm',
    short: '1RM',
    label: '1RM estimé',
    unit: 'kg',
    decimals: 1,
    aggregate: 'max',
    value: (point) => point.bestOneRm,
  },
  {
    key: 'setvolume',
    short: 'Vol. série',
    label: 'Meilleur volume de série',
    unit: 'kg',
    decimals: 0,
    aggregate: 'max',
    value: (point) => point.bestSetVolume,
  },
  {
    key: 'sessionvolume',
    short: 'Vol. séance',
    label: 'Volume de séance',
    unit: 'kg',
    decimals: 0,
    aggregate: 'mean',
    value: (point) => point.sessionVolume,
  },
  {
    key: 'reps',
    short: 'Reps',
    label: 'Total de répétitions',
    unit: '',
    decimals: 0,
    aggregate: 'mean',
    value: (point) => point.totalReps,
  },
] as const satisfies readonly ExerciseMetric[];

export type ExerciseMetricKey = (typeof EXERCISE_METRICS)[number]['key'];

/**
 * The series a page opens on.
 *
 * CHARGE MAXIMALE, because it is the one figure a lifter already knows without
 * the application: you remember what was on the bar. Opening on the estimated
 * 1RM would open on a number nobody typed, computed by a formula the page has
 * not yet explained.
 */
export const DEFAULT_EXERCISE_METRIC: ExerciseMetricKey = 'load';

export function metricFor(key: ExerciseMetricKey): ExerciseMetric {
  return EXERCISE_METRICS.find((metric) => metric.key === key) ?? EXERCISE_METRICS[0];
}

/**
 * What the chart says under its title when a point is not one session.
 *
 * Null at the per-session grain, where the title is already the whole truth.
 * Otherwise it names BOTH the reduction and the bucket — "Maximum par semaine"
 * — because either alone leaves the reader guessing at the other, and a point
 * that stands for four workouts looking like one is the misreading this line
 * exists to prevent.
 */
export function metricCaption(metric: ExerciseMetric, grain: Grain): string | null {
  if (grain === 'day') return null;
  const bucket = grain === 'week' ? 'semaine' : 'mois';
  const how = metric.aggregate === 'max' ? 'Maximum' : 'Moyenne';
  return `${how} par ${bucket}`;
}

/** A value with its unit, in French: "72,5 kg", "1 160 kg", "24". */
export function metricValueText(metric: ExerciseMetric, value: number): string {
  const rounded = value.toFixed(metric.decimals);
  // No trailing zero on a decimal metric: 72,5 and 70, never 70,0. The rule
  // core/format applies to macros and session-text to loads.
  const trimmed = metric.decimals > 0 ? String(Number(rounded)) : rounded;
  const french = trimmed.replace('.', ',');
  return metric.unit === '' ? french : `${french} ${metric.unit}`;
}
