import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import {
  exercise,
  exerciseSecondaryMuscle,
  routine,
  routineBlock,
  routineLine,
  routineWarmupStep,
  type Muscle,
  type RoutineId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import type { RoutineDraft } from '../domain/routine-draft';
import {
  listRoutines,
  readRoutine,
  readRoutineDraft,
  readRoutineMuscles,
  type RoutineListItem,
  type RoutineView,
} from './routine-reads';
import { createRoutine, deleteRoutine, updateRoutine } from './routine-writes';

/**
 * Reads are hooks; writes are the functions of routine-writes.ts (D8).
 *
 * ## WHAT A ROUTINE QUERY DECLARES IT READS, AND WHY IT IS FIVE TABLES
 *
 * A routine's page joins routine, its steps, its blocks, their lines AND the
 * exercises those lines point at — because the exercise NAME is read live
 * rather than frozen (specs 5.3 makes a routine a living object). So renaming
 * an exercise has to refresh this page, which only happens if `exercise` is
 * declared here.
 *
 * That is the under-declaration this shape invites: listing only the four
 * routine tables looks complete, and the failure it produces is a routine page
 * showing an exercise's old name until something else happens to invalidate it.
 * The muscles query declares exercise_secondary_muscle for the same reason.
 */

export const routineKeys = {
  list: () => ['routine', 'list'] as const,
  one: (id: RoutineId | null) => ['routine', 'one', id] as const,
  draft: (id: RoutineId | null) => ['routine', 'draft', id] as const,
  muscles: (id: RoutineId | null) => ['routine', 'muscles', id] as const,
};

export function useRoutines() {
  return useQuery<RoutineListItem[]>({
    queryKey: routineKeys.list(),
    queryFn: () => listRoutines(getAppDatabase()),
    meta: readsFrom(routine, routineBlock, routineLine),
  });
}

/**
 * One routine, whole.
 *
 * `null` means "no such routine", which is what a stale link gets; `undefined`
 * means the query has not answered. Keeping the two apart is the rule slice 4
 * paid for twice.
 */
export function useRoutine(id: RoutineId | null) {
  return useQuery<RoutineView | null>({
    queryKey: routineKeys.one(id),
    queryFn: () => (id === null ? null : readRoutine(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(
      routine,
      routineWarmupStep,
      routineBlock,
      routineLine,
      exercise,
      exerciseSecondaryMuscle,
    ),
  });
}

export function useRoutineDraft(id: RoutineId | null) {
  return useQuery<RoutineDraft | null>({
    queryKey: routineKeys.draft(id),
    queryFn: () => (id === null ? null : readRoutineDraft(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(routine, routineWarmupStep, routineBlock, routineLine, exercise),
  });
}

/** The muscles the body map lights (specs 10.2). */
export function useRoutineMuscles(id: RoutineId | null) {
  return useQuery<Muscle[]>({
    queryKey: routineKeys.muscles(id),
    queryFn: () => (id === null ? [] : readRoutineMuscles(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(routineBlock, routineLine, exercise, exerciseSecondaryMuscle),
  });
}

export function useCreateRoutine() {
  return useMutation({
    mutationFn: async (draft: RoutineDraft) => createRoutine(getAppDatabase(), draft),
  });
}

export function useUpdateRoutine() {
  return useMutation({
    mutationFn: async (input: { id: RoutineId; draft: RoutineDraft }) => {
      updateRoutine(getAppDatabase(), input.id, input.draft);
    },
  });
}

export function useDeleteRoutine() {
  return useMutation({
    mutationFn: async (id: RoutineId) => {
      deleteRoutine(getAppDatabase(), id);
    },
  });
}
