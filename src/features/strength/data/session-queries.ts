import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import {
  exercise,
  exerciseNote,
  session,
  sessionBlock,
  sessionSegment,
  sessionSet,
  type ExerciseId,
  type SessionId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  readActiveSession,
  readPendingNotes,
  readSession,
  type SessionView,
} from './session-reads';
import {
  addExerciseNote,
  addExerciseToSession,
  addRound,
  completeSet,
  deleteSession,
  finishSession,
  removeSet,
  saveTypedSet,
  setSessionNotes,
  setSkipped,
  startSession,
} from './session-writes';

/**
 * Reads are hooks; writes are the functions of session-writes.ts (D8).
 *
 * ## WHAT A SESSION QUERY DECLARES, AND THE ONE THAT IS EASY TO MISS
 *
 * session, its blocks, its sets and its SEGMENTS — the last because every write
 * touches them, so a query that left them out would still refresh (the sets
 * moved too) and would be right by accident. It stops being an accident the day
 * a write touches only the segments, which is what a deferred field save on an
 * already-typed value does.
 *
 * `exercise` is in there too, and for the OPPOSITE reason to routine-queries':
 * a session freezes the name, so renaming an exercise must NOT change what it
 * says. What is read live is tracks_duration, which decides whether a row shows
 * repetitions or seconds — so the page has to follow that one.
 */

export const sessionKeys = {
  active: () => ['session', 'active'] as const,
  one: (id: SessionId | null) => ['session', 'one', id] as const,
  notes: (ids: readonly ExerciseId[]) => ['session', 'notes', [...ids].sort()] as const,
};

/**
 * The session in progress, or null (specs 10.3).
 *
 * The banner reads this on every screen, so it is the most-mounted query in the
 * application. It stays cheap because ux_session_active makes "is one running"
 * a single indexed row, and because a session that is not running costs one
 * SELECT that finds nothing.
 *
 * `null` means "no session in progress"; `undefined` means "not read yet". The
 * banner must draw NOTHING for both, and the resume prompt must not appear for
 * either — the rule since slice 4, where folding one onto the other cost two
 * defects.
 */
export function useActiveSession() {
  return useQuery<SessionView | null>({
    queryKey: sessionKeys.active(),
    queryFn: () => readActiveSession(getAppDatabase()),
    meta: readsFrom(session, sessionBlock, sessionSet, sessionSegment, exercise),
  });
}

export function useSession(id: SessionId | null) {
  return useQuery<SessionView | null>({
    queryKey: sessionKeys.one(id),
    queryFn: () => (id === null ? null : readSession(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(session, sessionBlock, sessionSet, sessionSegment, exercise),
  });
}

/**
 * The unconsumed notes of the exercises in this session (specs 6.3, 10.3).
 *
 * > La page d'une séance affiche les notes de ses exercices.
 *
 * One query for the whole session rather than one per exercise — the per-row
 * cost slice 4 refused when quick-add reached the whole library, and the reason
 * specs 14.28 no 2 gives for carrying the notes on the list item.
 */
export function usePendingNotes(exerciseIds: readonly ExerciseId[]) {
  return useQuery<Map<string, string[]>>({
    queryKey: sessionKeys.notes(exerciseIds),
    queryFn: () => readPendingNotes(getAppDatabase(), exerciseIds),
    meta: readsFrom(exerciseNote),
  });
}

/**
 * Starting a session (specs 10.3).
 *
 * The refusal is a VALUE on the result, not an error: a session already running
 * is an expected state with a sentence attached, and the caller decides between
 * offering the resume and saying nothing.
 */
export function useStartSession() {
  return useMutation({
    mutationFn: (input: Parameters<typeof startSession>[1]) =>
      Promise.resolve(startSession(getAppDatabase(), input, { now: Date.now() })),
  });
}

/**
 * Validating a set — the immediate, synchronous rhythm of D12.
 *
 * Wrapped in a mutation for the screen's sake, not for the write's: the write
 * is synchronous SQLite and has already happened by the time the promise
 * resolves. What the mutation buys is a place for the screen to know it is in
 * flight, and nothing else.
 */
export function useCompleteSet() {
  return useMutation({
    mutationFn: (input: {
      setId: Parameters<typeof completeSet>[1];
      sessionId: SessionId;
      recorded: Parameters<typeof completeSet>[3];
    }) =>
      Promise.resolve(
        completeSet(getAppDatabase(), input.setId, input.sessionId, input.recorded, {
          now: Date.now(),
        }),
      ),
  });
}

export function useSkipSet() {
  return useMutation({
    mutationFn: (input: {
      setId: Parameters<typeof setSkipped>[1];
      sessionId: SessionId;
      skipped: boolean;
    }) =>
      Promise.resolve(
        setSkipped(getAppDatabase(), input.setId, input.sessionId, input.skipped, {
          now: Date.now(),
        }),
      ),
  });
}

export function useRemoveSet() {
  return useMutation({
    mutationFn: (input: { setId: Parameters<typeof removeSet>[1]; sessionId: SessionId }) =>
      Promise.resolve(
        removeSet(getAppDatabase(), input.setId, input.sessionId, { now: Date.now() }),
      ),
  });
}

export function useAddRound() {
  return useMutation({
    mutationFn: (input: { blockId: Parameters<typeof addRound>[1]; sessionId: SessionId }) =>
      Promise.resolve(
        addRound(getAppDatabase(), input.blockId, input.sessionId, { now: Date.now() }),
      ),
  });
}

export function useAddExerciseToSession() {
  return useMutation({
    mutationFn: (input: {
      sessionId: SessionId;
      exerciseId: ExerciseId;
      sets: number;
      restSeconds: number | null;
    }) =>
      Promise.resolve(
        addExerciseToSession(
          getAppDatabase(),
          input.sessionId,
          input.exerciseId,
          { sets: input.sets, restSeconds: input.restSeconds },
          { now: Date.now() },
        ),
      ),
  });
}

export function useFinishSession() {
  return useMutation({
    mutationFn: (id: SessionId) =>
      Promise.resolve(finishSession(getAppDatabase(), id, { now: Date.now() })),
  });
}

export function useDeleteSession() {
  return useMutation({
    mutationFn: (id: SessionId) => Promise.resolve(deleteSession(getAppDatabase(), id)),
  });
}

export function useSetSessionNotes() {
  return useMutation({
    mutationFn: (input: { sessionId: SessionId; notes: string }) =>
      Promise.resolve(
        setSessionNotes(getAppDatabase(), input.sessionId, input.notes, { now: Date.now() }),
      ),
  });
}

export function useAddExerciseNote() {
  return useMutation({
    mutationFn: (input: { exerciseId: ExerciseId; text: string }) =>
      Promise.resolve(
        addExerciseNote(getAppDatabase(), input.exerciseId, input.text, { now: Date.now() }),
      ),
  });
}

/**
 * Saving what is being typed — the deferred rhythm of D12.
 *
 * NOT a mutation, and that is deliberate: the screen calls this from a debounce
 * and from the background flush, where there is nothing to render about it and
 * nobody waiting. A mutation would add a state nothing reads.
 *
 * It is the one write in this file called directly, which is why it is here at
 * all rather than left to the screen to import: the flush needs a single door.
 */
export function flushTypedSet(input: {
  setId: Parameters<typeof saveTypedSet>[1];
  sessionId: SessionId;
  typed: Parameters<typeof saveTypedSet>[3];
}): void {
  saveTypedSet(getAppDatabase(), input.setId, input.sessionId, input.typed, { now: Date.now() });
}
