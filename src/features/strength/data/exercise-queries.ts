import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import {
  exercise,
  exerciseSecondaryMuscle,
  routine,
  routineBlock,
  routineLine,
  sessionBlock,
  sessionSet,
  setting,
  type ExerciseId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import type { ExerciseDraft } from '../domain/exercise-draft';
import {
  countExercises,
  listExercises,
  readExercise,
  readExerciseDraft,
  type ExerciseListItem,
  type ExerciseView,
} from './exercise-reads';
import {
  createExercise,
  deleteExercise,
  readExerciseUsage,
  setExerciseFavorite,
  updateExercise,
  type ExerciseUsage,
} from './exercise-writes';
import {
  readProgressionIncrement,
  readRestAlert,
  writeProgressionIncrement,
  writeRestAlert,
} from './strength-settings';

/**
 * Reads are hooks; writes are the functions of exercise-writes.ts (D8).
 *
 * Not one onSuccess, as everywhere since slice 1. A write touches `exercise` or
 * `exercise_secondary_muscle`, SQLite reports the row, and the bus invalidates
 * whatever declared reading that table. No write site enumerates a key.
 *
 * ## WHAT EACH QUERY DECLARES IT READS, AND WHY TWO OF THEM READ FOUR TABLES
 *
 * readsFrom takes the SCHEMA OBJECTS, never strings, so renaming a table moves
 * the declaration with it instead of leaving a string that matches nothing.
 *
 * The usage query declares routine_line, routine_block AND routine, because it
 * joins all three to name the routines an exercise appears in — and a routine
 * RENAMED while that warning is on screen must not leave the old name there.
 * Declaring only routine_line would have been the natural under-declaration,
 * and the failure it produces is a stale name in a destructive confirmation.
 */

export const exerciseKeys = {
  list: () => ['exercise', 'list'] as const,
  count: () => ['exercise', 'count'] as const,
  one: (id: ExerciseId | null) => ['exercise', 'one', id] as const,
  draft: (id: ExerciseId | null) => ['exercise', 'draft', id] as const,
  usage: (id: ExerciseId | null) => ['exercise', 'usage', id] as const,
  increment: () => ['exercise', 'increment-default'] as const,
  restAlert: () => ['exercise', 'rest-alert'] as const,
};

/**
 * The whole library, in one cached entry.
 *
 * ONE QUERY FOR EVERY KEYSTROKE, which is the arrangement D16 prescribes: the
 * search is a pure function over this list, so typing costs no SQL at all. The
 * day this stops being fast enough, exercise-reads.ts changes and nothing else
 * does.
 */
export function useExercises() {
  return useQuery<ExerciseListItem[]>({
    queryKey: exerciseKeys.list(),
    queryFn: () => listExercises(getAppDatabase()),
    meta: readsFrom(exercise, exerciseSecondaryMuscle),
  });
}

/** Whether the library holds anything, for the empty state. */
export function useExerciseCount() {
  return useQuery<number>({
    queryKey: exerciseKeys.count(),
    queryFn: () => countExercises(getAppDatabase()),
    meta: readsFrom(exercise),
  });
}

/**
 * One exercise, for its page.
 *
 * `null` means "no such exercise", which is a real answer — it is what a page
 * reached by a stale link gets. `undefined` means the query has not answered.
 * Keeping the two apart is the rule slice 4 paid for twice.
 */
export function useExercise(id: ExerciseId | null) {
  return useQuery<ExerciseView | null>({
    queryKey: exerciseKeys.one(id),
    queryFn: () => (id === null ? null : readExercise(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(exercise, exerciseSecondaryMuscle),
  });
}

/** The same exercise shaped for the editor. */
export function useExerciseDraft(id: ExerciseId | null) {
  return useQuery<ExerciseDraft | null>({
    queryKey: exerciseKeys.draft(id),
    queryFn: () => (id === null ? null : readExerciseDraft(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(exercise, exerciseSecondaryMuscle),
  });
}

/** What deleting would destroy, for the warning specs 5.3 requires. */
export function useExerciseUsage(id: ExerciseId | null) {
  return useQuery<ExerciseUsage>({
    queryKey: exerciseKeys.usage(id),
    queryFn: () =>
      id === null
        ? { routineNames: [], lineCount: 0, setCount: 0, sessionCount: 0 }
        : readExerciseUsage(getAppDatabase(), id),
    enabled: id !== null,
    // session_set and session_block joined in since slice 11: the warning now
    // counts recorded history, so finishing a set has to make it stale.
    meta: readsFrom(routineLine, routineBlock, routine, sessionSet, sessionBlock),
  });
}

/**
 * The global increment, read for ONE purpose: seeding a new exercise.
 *
 * Deliberately not in usePreferences(): that call exists to be synchronous on
 * every screen's first render, for three values every screen needs. This one is
 * needed at exactly one moment.
 */
export function useProgressionIncrement() {
  return useQuery<number>({
    queryKey: exerciseKeys.increment(),
    queryFn: () => readProgressionIncrement(getAppDatabase()),
    meta: readsFrom(setting),
  });
}

/**
 * Whether the end of a rest makes the phone vibrate (specs 14.40).
 *
 * Reads `setting` like the increment beside it, so the change bus invalidates
 * both from one table and the toggle takes effect on the session screen without
 * anything enumerating a key.
 */
export function useRestAlert() {
  return useQuery<boolean>({
    queryKey: exerciseKeys.restAlert(),
    queryFn: () => readRestAlert(getAppDatabase()),
    meta: readsFrom(setting),
  });
}

export function useSetRestAlert() {
  return useMutation({
    mutationFn: async (enabled: boolean) => writeRestAlert(getAppDatabase(), enabled),
  });
}

export function useCreateExercise() {
  return useMutation({
    mutationFn: async (draft: ExerciseDraft) => createExercise(getAppDatabase(), draft),
  });
}

export function useUpdateExercise() {
  return useMutation({
    mutationFn: async (input: { id: ExerciseId; draft: ExerciseDraft }) => {
      updateExercise(getAppDatabase(), input.id, input.draft);
    },
  });
}

export function useDeleteExercise() {
  return useMutation({
    mutationFn: async (id: ExerciseId) => {
      deleteExercise(getAppDatabase(), id);
    },
  });
}

export function useSetExerciseFavorite() {
  return useMutation({
    mutationFn: async (input: { id: ExerciseId; isFavorite: boolean }) => {
      setExerciseFavorite(getAppDatabase(), input.id, input.isFavorite);
    },
  });
}

export function useWriteProgressionIncrement() {
  return useMutation({
    mutationFn: async (kg: number) => {
      writeProgressionIncrement(getAppDatabase(), kg);
    },
  });
}
