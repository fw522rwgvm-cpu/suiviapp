import { useMutation, useQuery } from '@tanstack/react-query';
import type { LocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import {
  day,
  dayMeal,
  journalEntry,
  type DayMealId,
  type JournalEntryId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  readDay,
  readDayTotals,
  readEntry,
  readMealEntries,
  readMealTotals,
} from './day-reads';
import {
  addFoodEntry,
  addFreeEntry,
  addMeal,
  deleteEntry,
  deleteMeal,
  renameMeal,
  updateFoodEntryQuantity,
  updateFreeEntry,
} from './day-writes';

/**
 * Reads are hooks; writes are the transactional functions of day-writes.ts,
 * wrapped here for the pending and error state a screen needs (D8).
 *
 * > No cache invalidation is written by hand: it goes through the change bus.
 *
 * So there is deliberately not a single onSuccess in this file. A write
 * commits, SQLite reports the tables it touched, and the bus invalidates every
 * query that declared reading one of them. Adding an invalidation here would
 * be the start of the list D8 exists to avoid.
 */

export const journalKeys = {
  day: (date: LocalDate) => ['nutrition', 'day', date] as const,
  dayTotals: (date: LocalDate) => ['nutrition', 'day-totals', date] as const,
  mealTotals: (date: LocalDate) => ['nutrition', 'meal-totals', date] as const,
  mealEntries: (mealId: DayMealId | null) => ['nutrition', 'meal-entries', mealId] as const,
  entry: (entryId: JournalEntryId | null) => ['nutrition', 'entry', entryId] as const,
};

/** The day, materialised or virtual. Reading it never creates it (specs 8.2). */
export function useDay(date: LocalDate) {
  return useQuery({
    queryKey: journalKeys.day(date),
    queryFn: () => readDay(getAppDatabase(), date),
    meta: readsFrom(day, dayMeal),
  });
}

/**
 * The figures of the banner, from one aggregated query (D16). Entries are not
 * loaded to show a total.
 */
export function useDayTotals(date: LocalDate) {
  return useQuery({
    queryKey: journalKeys.dayTotals(date),
    queryFn: () => readDayTotals(getAppDatabase(), date),
    meta: readsFrom(journalEntry),
  });
}

/** Sub-totals per meal, for a list whose meals are collapsed (specs 8.3). */
export function useMealTotals(date: LocalDate) {
  return useQuery({
    queryKey: journalKeys.mealTotals(date),
    queryFn: () => readMealTotals(getAppDatabase(), date),
    meta: readsFrom(journalEntry),
  });
}

/**
 * The entries of one meal, fetched only once that meal is unfolded — which is
 * also why a virtual meal, having no identifier, fetches nothing.
 */
export function useMealEntries(mealId: DayMealId | null) {
  return useQuery({
    queryKey: journalKeys.mealEntries(mealId),
    queryFn: () => (mealId === null ? [] : readMealEntries(getAppDatabase(), mealId)),
    enabled: mealId !== null,
    meta: readsFrom(journalEntry),
  });
}

/** One entry, for the screen that edits it (specs 5.3: no time limit). */
export function useEntry(entryId: JournalEntryId | null) {
  return useQuery({
    queryKey: journalKeys.entry(entryId),
    queryFn: () => (entryId === null ? null : readEntry(getAppDatabase(), entryId)),
    enabled: entryId !== null,
    meta: readsFrom(journalEntry),
  });
}

export function useAddFoodEntry() {
  return useMutation({
    mutationFn: (input: Parameters<typeof addFoodEntry>[1]) =>
      Promise.resolve(addFoodEntry(getAppDatabase(), input)),
  });
}

export function useUpdateFoodEntryQuantity() {
  return useMutation({
    mutationFn: (input: {
      entryId: JournalEntryId;
      quantity: Parameters<typeof updateFoodEntryQuantity>[2];
    }) =>
      Promise.resolve(
        updateFoodEntryQuantity(getAppDatabase(), input.entryId, input.quantity),
      ),
  });
}

export function useAddFreeEntry() {
  return useMutation({
    mutationFn: (input: Parameters<typeof addFreeEntry>[1]) =>
      Promise.resolve(addFreeEntry(getAppDatabase(), input)),
  });
}

export function useUpdateFreeEntry() {
  return useMutation({
    mutationFn: (input: Parameters<typeof updateFreeEntry>[1]) =>
      Promise.resolve(updateFreeEntry(getAppDatabase(), input)),
  });
}

export function useDeleteEntry() {
  return useMutation({
    mutationFn: (entryId: Parameters<typeof deleteEntry>[1]) =>
      Promise.resolve(deleteEntry(getAppDatabase(), entryId)),
  });
}

export function useAddMeal() {
  return useMutation({
    mutationFn: (input: Parameters<typeof addMeal>[1]) =>
      Promise.resolve(addMeal(getAppDatabase(), input)),
  });
}

export function useRenameMeal() {
  return useMutation({
    mutationFn: (input: Parameters<typeof renameMeal>[1]) =>
      Promise.resolve(renameMeal(getAppDatabase(), input)),
  });
}

export function useDeleteMeal() {
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteMeal>[1]) =>
      Promise.resolve(deleteMeal(getAppDatabase(), input)),
  });
}
