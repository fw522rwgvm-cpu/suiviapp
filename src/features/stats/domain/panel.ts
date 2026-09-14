import { compareLocalDate, type LocalDate } from '@/core/date';
import { sumMacros, type Macros } from '@/features/nutrition/domain/macros';
import { adherenceOf, type Adherence, type DayFigure } from './adherence';
import {
  macroSplits,
  meanOf,
  rollingMean,
  WEEKLY_WINDOW_DAYS,
  type MacroSplits,
} from './series';

/**
 * Everything the nutrition panel shows, from one pure function (D9, specs 8.7).
 *
 * > Composants : RIEN. Aucun calcul métier dans le rendu.
 *
 * Which is why this exists rather than three cards each doing their own
 * arithmetic. It also removes a subtler risk: the mean, the split and the
 * adherence rate all have to be computed over THE SAME set of days, and three
 * components choosing that set separately would eventually choose differently.
 *
 * ## THE CHART AND THE FIGURES DO NOT COVER THE SAME DAYS, DELIBERATELY
 *
 * The series are dense over the whole range, today included — watching today's
 * bar grow is the point of opening the screen. Every FIGURE is computed over
 * finished days only, for the reason adherence.ts sets out at length: a day
 * still being lived is a partial measurement, so averaging it in would pull
 * every mean down each morning and let it recover each evening, for no reason
 * anyone ate.
 *
 * Which means the last bar of the chart is not part of the average printed
 * beside it. That is stated on screen rather than left to be discovered.
 */
export interface NutritionPanel {
  /** One entry per day of the range, in order, gaps included. For the chart. */
  days: readonly DayFigure[];
  /** Calories per day, null on a day with no entry. Never zero for a gap. */
  kcalSeries: (number | null)[];
  /** The day's goal in calories, null where there is none. */
  targetSeries: (number | null)[];
  /** Trailing seven-day mean of kcalSeries (specs 8.7). */
  rollingKcalSeries: (number | null)[];

  /** Finished days of the range — its length is the honest denominator. */
  span: number;
  /** Of those, how many carry at least one entry. */
  recorded: number;

  /** Mean of what was eaten, over finished recorded days. Null if none. */
  meanConsumed: Macros | null;
  /** Mean calorie goal over the days that had one. Null if none did. */
  meanTargetKcal: number | null;
  /** P / G / L in grams and as a share of calories. Null with no data. */
  splits: MacroSplits | null;

  adherence: Adherence;
}

export function nutritionPanel(
  days: readonly DayFigure[],
  tolerancePct: number,
  today: LocalDate,
): NutritionPanel {
  const kcalSeries = days.map((day) => day.consumed?.kcal ?? null);
  const targetSeries = days.map((day) => day.target?.kcal ?? null);

  const finished = days.filter((day) => compareLocalDate(day.date, today) < 0);
  const recorded = finished.flatMap((day) => (day.consumed === null ? [] : [day.consumed]));
  const goals = finished.flatMap((day) => (day.target === null ? [] : [day.target.kcal]));

  // sumMacros divided by the count, rather than four calls to meanOf: a mean of
  // macros is one operation on one set of days, and splitting it into four
  // would let the four be taken over four different sets.
  const meanConsumed =
    recorded.length === 0
      ? null
      : (() => {
          const total = sumMacros(recorded);
          const n = recorded.length;
          return {
            protein: total.protein / n,
            carbs: total.carbs / n,
            fat: total.fat / n,
            kcal: total.kcal / n,
          };
        })();

  return {
    days,
    kcalSeries,
    targetSeries,
    rollingKcalSeries: rollingMean(kcalSeries, WEEKLY_WINDOW_DAYS),

    span: finished.length,
    recorded: recorded.length,

    meanConsumed,
    meanTargetKcal: meanOf(goals),
    splits: meanConsumed === null ? null : macroSplits(meanConsumed),

    adherence: adherenceOf(days, tolerancePct, today),
  };
}
