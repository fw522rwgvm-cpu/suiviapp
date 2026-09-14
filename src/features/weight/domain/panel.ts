import type { LocalDate } from '@/core/date';
import {
  latestSmoothed,
  realRate,
  RATE_WINDOW_DAYS,
  type RealRate,
} from './rate';
import { smoothSeries, type WeightPoint } from './smoothing';
import {
  projectedDate,
  targetRate,
  type Projection,
  type TargetRate,
  type WeightGoal,
} from './weight-goal';
import type { WeightRange } from './weight-range';

/**
 * Everything the weight panel shows, from one pure function (specs 9.2, 9.4).
 *
 * D9: "Composants : RIEN." The screen chooses a range, hands over the rows, and
 * renders what comes back — the shape nutritionPanel set one feature over.
 *
 * ## THE CHART AND THE RATE READ DIFFERENT SERIES, AND THAT IS DELIBERATE
 *
 * `points` follows the range control, at whatever grain D9 prescribes. `rate`
 * is always fourteen days of daily measurements, because specs 9.2 fixes that
 * window — a rate that changed when someone tapped "1 an" would be reporting
 * the picture rather than the body.
 */

export interface WeightPanel {
  range: WeightRange;
  /** The series drawn, one entry per bucket, gaps included. */
  points: WeightPoint[];
  /** Whether the raw series is drawn beside the smoothed one (specs 9.2 n3). */
  showRaw: boolean;
  /** The last smoothed value — what "current weight" means everywhere here. */
  currentKg: number | null;
  /** The real rate, or why it cannot be given (specs 9.2 n2). */
  rate: RealRate;
  goal: GoalPanel | null;
}

export interface GoalPanel {
  goal: WeightGoal;
  /** The rate being aimed at, derived in target_date mode. */
  aimed: TargetRate;
  /** When the target is expected, derived in rate mode. */
  projection: Projection;
  /**
   * Real rate minus aimed rate, in kg per week, or null when either is missing.
   *
   * ## SIGNED, AND THE SIGN IS NOT "GOOD" OR "BAD"
   *
   * This is an arithmetic difference and nothing more. Someone losing 0.5 when
   * aiming for 0.3 gets a negative gap; someone gaining 0.5 when aiming for 0.3
   * gets a positive one. Whether either is welcome depends on the direction
   * they are travelling in, which the screen knows and this does not.
   *
   * Calling it "ahead" or "behind" here would bake a judgement into a number,
   * and the judgement is wrong for half the goals — a bulk and a cut read the
   * same gap in opposite directions.
   */
  gapKgPerWeek: number | null;
}

/**
 * The whole panel.
 *
 * `rateRows` is the DAILY series over RATE_LOAD_DAYS — longer than the
 * regression window on purpose, so every smoothed point in the window has a
 * full seven days behind it (see RATE_LOAD_DAYS for the 22 % this is worth).
 */
export function weightPanel(
  range: WeightRange,
  rows: readonly { date: LocalDate; raw: number | null }[],
  rateRows: readonly { date: LocalDate; raw: number | null }[],
  goal: WeightGoal | null,
  today: LocalDate,
): WeightPanel {
  const points = smoothSeries(
    rows.map((row) => row.date),
    rows.map((row) => row.raw),
  );

  const rateSeries = smoothSeries(
    rateRows.map((row) => row.date),
    rateRows.map((row) => row.raw),
  );
  // Only the window itself is fitted; the extra days behind it exist to make
  // its earliest points correct, never to be measured themselves.
  const rate = realRate(rateSeries.slice(-RATE_WINDOW_DAYS));

  /**
   * CURRENT WEIGHT COMES FROM THE RATE SERIES, NOT FROM THE CHART
   *
   * The chart's last bucket can be a weekly or monthly mean — on the "1 an"
   * range, "current weight" would then be an average of the last four weeks,
   * and every goal figure derived from it would drift as the range control
   * changed. The rate series is always daily and always ends today.
   */
  const currentKg = latestSmoothed(rateSeries);

  return {
    range,
    points,
    showRaw: range.showRaw,
    currentKg,
    rate,
    goal: goal === null ? null : goalPanel(goal, currentKg, rate, today),
  };
}

function goalPanel(
  goal: WeightGoal,
  currentKg: number | null,
  rate: RealRate,
  today: LocalDate,
): GoalPanel {
  const aimed = targetRate(goal, currentKg, today);

  return {
    goal,
    aimed,
    projection: projectedDate(goal, currentKg, today),
    gapKgPerWeek: rate.ok && aimed.ok ? rate.kgPerWeek - aimed.kgPerWeek : null,
  };
}
