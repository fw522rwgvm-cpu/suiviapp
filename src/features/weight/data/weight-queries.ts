import { useMutation, useQuery } from '@tanstack/react-query';
import type { LocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import { weightGoal, weightMeasure, type WeightGoalId } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import { RATE_LOAD_DAYS } from '../domain/rate';
import type { WeightGoalDraft } from '../domain/weight-goal';
import type { WeightPrefill } from '../domain/weight-prefill';
import type { WeightRange } from '../domain/weight-range';
import {
  readActiveGoal,
  readFirstWeightDate,
  readGoals,
  readRateWindow,
  readWeight,
  readWeightHistory,
  readWeightPrefill,
  readWeightSeries,
  type ActiveGoal,
  type SeriesRow,
  type WeightHistoryRow,
} from './weight-reads';
import {
  deactivateGoal,
  deleteGoal,
  deleteWeight,
  reactivateGoal,
  setActiveGoal,
  setWeight,
} from './weight-writes';

/**
 * Reads are hooks; writes are the functions of weight-writes.ts (D8).
 *
 * Not one onSuccess, as everywhere since slice 1. A write touches
 * weight_measure or weight_goal, SQLite reports it, and the bus invalidates
 * whatever declared reading that table — which is every query below, and
 * nothing has to know that.
 */

export const weightKeys = {
  onDate: (date: LocalDate) => ['weight', 'date', date] as const,
  prefill: (date: LocalDate) => ['weight', 'prefill', date] as const,
  series: (from: LocalDate, to: LocalDate, grain: string) =>
    ['weight', 'series', from, to, grain] as const,
  rateWindow: (today: LocalDate) => ['weight', 'rate-window', today] as const,
  history: () => ['weight', 'history'] as const,
  firstDate: () => ['weight', 'first-date'] as const,
  activeGoal: () => ['weight', 'goal', 'active'] as const,
  goals: () => ['weight', 'goal', 'all'] as const,
};

/**
 * The weight on one date — what the Journal's card shows.
 *
 * `null` from this query means "that date was never weighed", which is a real
 * answer. `undefined` means the query has not answered yet. Keeping the two
 * apart is the rule slice 4 paid for twice — once on the quantity wheels, once
 * on the portions list — and the Journal card depends on it: a field that
 * cannot tell "no measurement" from "not yet" opens empty on a day that has
 * one.
 */
export function useWeight(date: LocalDate) {
  return useQuery<number | null>({
    queryKey: weightKeys.onDate(date),
    queryFn: () => readWeight(getAppDatabase(), date),
    meta: readsFrom(weightMeasure),
  });
}

/**
 * What a date proposes: its own measurement, or the last weighing before it.
 *
 * ONE query rather than two, so the card has ONE pending state to reason about.
 * `undefined` is "not read yet"; the answer, when it comes, distinguishes a
 * measurement from a carried figure by its `kind` — which is what stops the
 * card from stating a weight nobody stood on a scale for.
 */
export function useWeightPrefill(date: LocalDate) {
  return useQuery<WeightPrefill>({
    queryKey: weightKeys.prefill(date),
    queryFn: () => readWeightPrefill(getAppDatabase(), date),
    meta: readsFrom(weightMeasure),
  });
}

/** The series the chart draws, at the grain the range prescribes. */
export function useWeightSeries(range: WeightRange) {
  return useQuery<SeriesRow[]>({
    queryKey: weightKeys.series(range.from, range.to, range.grain),
    queryFn: () => readWeightSeries(getAppDatabase(), range),
    meta: readsFrom(weightMeasure),
  });
}

/**
 * The daily window the rate regression runs on.
 *
 * Keyed by `today` alone, never by the range: the window is fixed by specs 9.2
 * and must not move when the range control does. The key changes when the day
 * turns over or the cutoff setting changes, exactly as useDailyFigures does.
 */
export function useRateWindow(today: LocalDate) {
  return useQuery<SeriesRow[]>({
    queryKey: weightKeys.rateWindow(today),
    queryFn: () => readRateWindow(getAppDatabase(), today, RATE_LOAD_DAYS),
    meta: readsFrom(weightMeasure),
  });
}

/** Every measurement, newest first (specs 9.1). */
export function useWeightHistory(limit?: number) {
  return useQuery<WeightHistoryRow[]>({
    queryKey: [...weightKeys.history(), limit ?? null],
    queryFn: () => readWeightHistory(getAppDatabase(), limit),
    meta: readsFrom(weightMeasure),
  });
}

/** The earliest date ever weighed, for the "tout" range. */
export function useFirstWeightDate() {
  return useQuery<LocalDate | null>({
    queryKey: weightKeys.firstDate(),
    queryFn: () => readFirstWeightDate(getAppDatabase()),
    meta: readsFrom(weightMeasure),
  });
}

export function useActiveGoal() {
  return useQuery<ActiveGoal | null>({
    queryKey: weightKeys.activeGoal(),
    queryFn: () => readActiveGoal(getAppDatabase()),
    meta: readsFrom(weightGoal),
  });
}

export function useGoals() {
  return useQuery({
    queryKey: weightKeys.goals(),
    queryFn: () => readGoals(getAppDatabase()),
    meta: readsFrom(weightGoal),
  });
}

export function useSetWeight() {
  return useMutation({
    mutationFn: ({ date, valueKg }: { date: LocalDate; valueKg: number }) => {
      setWeight(getAppDatabase(), date, valueKg);
      return Promise.resolve();
    },
  });
}

export function useDeleteWeight() {
  return useMutation({
    mutationFn: (date: LocalDate) => {
      deleteWeight(getAppDatabase(), date);
      return Promise.resolve();
    },
  });
}

export function useSetGoal() {
  return useMutation({
    mutationFn: (draft: WeightGoalDraft & { targetKg: number }) => {
      setActiveGoal(getAppDatabase(), draft);
      return Promise.resolve();
    },
  });
}

export function useDeactivateGoal() {
  return useMutation({
    mutationFn: () => {
      deactivateGoal(getAppDatabase());
      return Promise.resolve();
    },
  });
}

export function useReactivateGoal() {
  return useMutation({
    mutationFn: (id: WeightGoalId) => {
      reactivateGoal(getAppDatabase(), id);
      return Promise.resolve();
    },
  });
}

export function useDeleteGoal() {
  return useMutation({
    mutationFn: (id: WeightGoalId) => {
      deleteGoal(getAppDatabase(), id);
      return Promise.resolve();
    },
  });
}
