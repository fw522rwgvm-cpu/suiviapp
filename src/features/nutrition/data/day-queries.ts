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
import { PLANNING_TABLES } from './planning-queries';
import {
  readDay,
  readDayTotals,
  readEntry,
  readMealEntries,
  readMealTotals,
  readRecentMeals,
} from './day-reads';
import {
  addEntries,
  addFoodEntry,
  addFreeEntry,
  addMeal,
  addRecentMeal,
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
  recentMeals: () => ['nutrition', 'recent-meals'] as const,
};

/**
 * The day, materialised or virtual. Reading it never creates it (specs 8.2).
 *
 * IT DECLARES THE PLANNING TABLES TOO, and it has to, even though a
 * materialised day never reads them: the query cannot know which branch it
 * will take before it runs. So editing a template invalidates every open day,
 * the virtual ones re-resolve, and the materialised ones re-read and do not
 * move — which is the correct outcome reached by the cheapest possible means,
 * a refetch of a local synchronous query.
 *
 * This is also the whole of how a template edit reaches the Journal. No write
 * site enumerates anything, and there is still not one onSuccess in this file.
 */
export function useDay(date: LocalDate) {
  return useQuery({
    queryKey: journalKeys.day(date),
    queryFn: () => readDay(getAppDatabase(), date),
    meta: readsFrom(day, dayMeal, ...PLANNING_TABLES),
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

/**
 * Meals logged recently, for the quick-access screen (specs 8.4a).
 *
 * It reads both tables, and it has to: a meal's name lives in day_meal and
 * what makes it recent lives in journal_entry. So logging anything refreshes
 * the list, which is the correct behaviour reached for free.
 */
export function useRecentMeals() {
  return useQuery({
    queryKey: journalKeys.recentMeals(),
    queryFn: () => readRecentMeals(getAppDatabase()),
    meta: readsFrom(dayMeal, journalEntry),
  });
}

/** A whole past meal, replayed into another (specs 8.4a). */
export function useAddRecentMeal() {
  return useMutation({
    mutationFn: (input: Parameters<typeof addRecentMeal>[1]) =>
      Promise.resolve(addRecentMeal(getAppDatabase(), input)),
  });
}

/** A whole basket, in one transaction (specs 8.4). */
export function useAddEntries() {
  return useMutation({
    mutationFn: (input: Parameters<typeof addEntries>[1]) =>
      Promise.resolve(addEntries(getAppDatabase(), input)),
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
