import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import { toLocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { toEntityId } from '@/core/id';
import {
  exercise,
  exerciseNote,
  session,
  sessionBlock,
  sessionSegment,
  sessionSet,
  type ExerciseId,
  type RoutineId,
  type SessionId,
  type SetType,
} from '@/core/db/schema';
import { isSetType } from '../domain/vocabulary';
import {
  recordedDurationMs,
  type ActivitySegment,
} from '../domain/session-activity';

/**
 * Reads on the sessions (specs 10.3).
 *
 * ## FOUR QUERIES FOR A WHOLE SESSION, NEVER ONE PER BLOCK
 *
 * routine-reads' rule, and it binds harder here: a session is read on every
 * render of the live screen, which is the screen someone is standing in front
 * of between two sets. Each level is read whole and joined in memory by id, so
 * a session of eight blocks costs what a session of one does.
 */

/** One set as the live screen shows it. */
export interface SessionSetView {
  id: string;
  exerciseId: ExerciseId | null;
  /**
   * The frozen name, always — never the live one.
   *
   * A session is history (specs 5.2), so what it says was performed must not
   * change when an exercise is renamed. This is the opposite choice from
   * routine-reads, which joins for the live name because a routine is a living
   * object. The two tables say so themselves: routine_line has no frozen name
   * and session_set has one, NOT NULL.
   */
  exerciseName: string;
  setIndex: number;
  setType: SetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetLoadKg: number | null;
  targetRir: number | null;
  targetDurationSeconds: number | null;
  actualReps: number | null;
  actualLoadKg: number | null;
  actualRir: number | null;
  actualDurationSeconds: number | null;
  status: string;
  completedAt: number | null;
  /**
   * Whether the exercise is measured in time, read LIVE.
   *
   * The one thing here that is deliberately not frozen, and the reason is what
   * it decides: which COLUMN the row shows. A session whose plank still showed
   * a repetitions field because the flag flipped last week would be a screen
   * that cannot record what is happening. Null when the exercise is gone, and
   * then the target says which it was.
   */
  tracksDuration: 0 | 1 | null;
}

export interface SessionBlockView {
  id: string;
  restSeconds: number | null;
  sets: SessionSetView[];
}

export interface SessionView {
  id: SessionId;
  date: LocalDate;
  /**
   * The routine this came from, if any.
   *
   * INFORMATIVE, exactly as the column is (schema session.routine_id): the
   * snapshot name is what the screen shows. It is exposed because the PRÉCÉDENT
   * column needs to ask "the last time THIS routine was done", which is a
   * question about the routine rather than about its name — two sessions of a
   * routine renamed in between are still the same routine.
   */
  routineId: RoutineId | null;
  routineName: string | null;
  status: 'in_progress' | 'done';
  startedAt: number;
  endedAt: number | null;
  notes: string | null;
  blocks: SessionBlockView[];
  /** Stored intervals, so the caller can derive a live figure with its own clock. */
  segments: ActivitySegment[];
  /** The sum of the segments — what the session records (D9, D12). */
  recordedDurationMs: number;
  doneSets: number;
  totalSets: number;
}

/**
 * The session in progress, if there is one (specs 10.3).
 *
 * Reads by status, which ux_session_active makes a single-row question. What
 * the banner shows and what the resume offers, both.
 */
export function readActiveSession(db: AppDatabase): SessionView | null {
  const [row] = db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.status, 'in_progress'))
    .all();
  return row === undefined ? null : readSession(db, row.id);
}

export function readSession(db: AppDatabase, sessionId: SessionId): SessionView | null {
  const [head] = db.select().from(session).where(eq(session.id, sessionId)).all();
  if (head === undefined) return null;

  const blocks = db
    .select({ id: sessionBlock.id, restSeconds: sessionBlock.restSeconds })
    .from(sessionBlock)
    .where(eq(sessionBlock.sessionId, sessionId))
    .orderBy(asc(sessionBlock.position))
    .all();

  /**
   * The sets of every block in one query, left-joined to the exercise.
   *
   * LEFT and not INNER: exercise_id is nullable and NULL is the ordinary state
   * of a set whose exercise was deleted (D5/R4). An inner join would make those
   * sets DISAPPEAR from their own session — the defect slice 6 found with
   * frozen ingredients, in the same shape.
   */
  const sets = db
    .select({
      id: sessionSet.id,
      blockId: sessionSet.sessionBlockId,
      exerciseId: sessionSet.exerciseId,
      exerciseName: sessionSet.exerciseNameFrozen,
      setIndex: sessionSet.setIndex,
      setType: sessionSet.setType,
      targetRepsMin: sessionSet.targetRepsMin,
      targetRepsMax: sessionSet.targetRepsMax,
      targetLoadKg: sessionSet.targetLoadKg,
      targetRir: sessionSet.targetRir,
      targetDurationSeconds: sessionSet.targetDurationSeconds,
      actualReps: sessionSet.actualReps,
      actualLoadKg: sessionSet.actualLoadKg,
      actualRir: sessionSet.actualRir,
      actualDurationSeconds: sessionSet.actualDurationSeconds,
      status: sessionSet.status,
      completedAt: sessionSet.completedAt,
      tracksDuration: exercise.tracksDuration,
      position: sessionSet.position,
    })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .leftJoin(exercise, eq(sessionSet.exerciseId, exercise.id))
    .where(eq(sessionBlock.sessionId, sessionId))
    .orderBy(asc(sessionSet.position))
    .all();

  const byBlock = new Map<string, SessionSetView[]>();
  let doneSets = 0;
  for (const set of sets) {
    if (set.status === 'done') doneSets += 1;
    const view: SessionSetView = {
      id: set.id,
      // NULL is the ordinary state of a set whose exercise was deleted, so it
      // passes through untouched; anything else is narrowed once, here, rather
      // than by every reader (conventions section 4 refuses assertion).
      exerciseId: set.exerciseId === null ? null : toEntityId<ExerciseId>(set.exerciseId),
      exerciseName: set.exerciseName,
      setIndex: set.setIndex,
      setType: isSetType(set.setType) ? set.setType : 'work',
      targetRepsMin: set.targetRepsMin,
      targetRepsMax: set.targetRepsMax,
      targetLoadKg: set.targetLoadKg,
      targetRir: set.targetRir,
      targetDurationSeconds: set.targetDurationSeconds,
      actualReps: set.actualReps,
      actualLoadKg: set.actualLoadKg,
      actualRir: set.actualRir,
      actualDurationSeconds: set.actualDurationSeconds,
      status: set.status,
      completedAt: set.completedAt,
      tracksDuration: set.tracksDuration,
    };
    const current = byBlock.get(set.blockId);
    if (current === undefined) byBlock.set(set.blockId, [view]);
    else current.push(view);
  }

  const segments = db
    .select({ startedAt: sessionSegment.startedAt, endedAt: sessionSegment.endedAt })
    .from(sessionSegment)
    .where(eq(sessionSegment.sessionId, sessionId))
    .orderBy(asc(sessionSegment.startedAt))
    .all();

  return {
    id: head.id,
    date: toLocalDate(head.date),
    routineId: head.routineId,
    routineName: head.routineNameSnapshot,
    status: head.status === 'done' ? 'done' : 'in_progress',
    startedAt: head.startedAt,
    endedAt: head.endedAt,
    notes: head.notes,
    blocks: blocks.map((block) => ({
      id: block.id,
      restSeconds: block.restSeconds,
      sets: byBlock.get(block.id) ?? [],
    })),
    segments,
    recordedDurationMs: recordedDurationMs(segments),
    doneSets,
    totalSets: sets.length,
  };
}

/**
 * The notes waiting to be read during a session, by exercise (specs 6.3).
 *
 * > Note d'exercice — rattachée à un exercice, destinée à la prochaine séance
 * > le comportant.
 *
 * Unconsumed only: a note that has had its session has said what it had to say,
 * and showing it again would make every workout carry every note ever written.
 *
 * One query for the whole session, keyed by exercise — the per-row cost slice 4
 * refused when quick-add reached the whole library.
 */
export function readPendingNotes(
  db: AppDatabase,
  exerciseIds: readonly ExerciseId[],
): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  if (exerciseIds.length === 0) return notes;

  const wanted = new Set<string>(exerciseIds);
  for (const row of db
    .select({ exerciseId: exerciseNote.exerciseId, text: exerciseNote.text })
    .from(exerciseNote)
    // Unconsumed, decided in SQL on ix_note_exercise rather than by filtering
    // rows already fetched: the table grows without bound and the consumed ones
    // are most of it.
    .where(isNull(exerciseNote.consumedAt))
    .orderBy(asc(exerciseNote.createdAt))
    .all()) {
    if (!wanted.has(row.exerciseId)) continue;
    const current = notes.get(row.exerciseId);
    if (current === undefined) notes.set(row.exerciseId, [row.text]);
    else current.push(row.text);
  }
  return notes;
}

/** One row of the Séances list: what a session WAS, without its sets. */
export interface SessionListItem {
  id: SessionId;
  date: LocalDate;
  routineName: string | null;
  status: 'in_progress' | 'done';
  startedAt: number;
  /** The sum of the stored segments (D9, D12) — never endedAt minus startedAt. */
  recordedDurationMs: number;
  doneSets: number;
  totalSets: number;
}

/**
 * Every session, most recent first (specs 10.3).
 *
 * ## THREE QUERIES FOR ANY NUMBER OF SESSIONS
 *
 * The discipline slice 4 settled when quick-add reached the whole library and
 * slice 6 repeated for recipe tags: heads, then segments grouped by session,
 * then set counts grouped by session. A `readSession` per row would be a query
 * per row plus all of its sets — for a list that shows neither.
 *
 * ## THE DURATION IS SUMMED FROM SEGMENTS, NEVER `endedAt - startedAt`
 *
 * D12's whole point: a session left open overnight has one long gap in it, and
 * the difference between its two ends would count the night. `recordedDurationMs`
 * is the same function the session screen uses, so the list and the page cannot
 * disagree about how long a workout was.
 *
 * ## ORDERED BY DATE THEN BY START, AND BOTH ARE NEEDED
 *
 * `date` is the civil day it belongs to and is what somebody reads; `startedAt`
 * separates two sessions on the same day. Ordering on the instant alone would
 * be right today and wrong the first time a session is logged for yesterday.
 */
export function listSessions(db: AppDatabase): SessionListItem[] {
  const heads = db
    .select({
      id: session.id,
      date: session.date,
      routineName: session.routineNameSnapshot,
      status: session.status,
      startedAt: session.startedAt,
    })
    .from(session)
    .orderBy(desc(session.date), desc(session.startedAt))
    .all();

  if (heads.length === 0) return [];

  const segmentsBySession = new Map<string, ActivitySegment[]>();
  for (const row of db
    .select({
      sessionId: sessionSegment.sessionId,
      startedAt: sessionSegment.startedAt,
      endedAt: sessionSegment.endedAt,
    })
    .from(sessionSegment)
    .orderBy(asc(sessionSegment.startedAt))
    .all()) {
    const current = segmentsBySession.get(row.sessionId);
    const segment = { startedAt: row.startedAt, endedAt: row.endedAt };
    if (current === undefined) segmentsBySession.set(row.sessionId, [segment]);
    else current.push(segment);
  }

  const counts = new Map<string, { done: number; total: number }>();
  for (const row of db
    .select({ sessionId: sessionBlock.sessionId, status: sessionSet.status })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .all()) {
    const current = counts.get(row.sessionId) ?? { done: 0, total: 0 };
    current.total += 1;
    // `status === 'done'` CHARACTER FOR CHARACTER as readSession counts it.
    // Two implementations of "how far through is this session" would agree on
    // every example anybody writes by hand and diverge the day a fourth status
    // appears — and a list disagreeing with the page it opens is the plausible,
    // invisible kind of wrong. A test holds the two together.
    if (row.status === 'done') current.done += 1;
    counts.set(row.sessionId, current);
  }

  return heads.map((head) => {
    const segments = segmentsBySession.get(head.id) ?? [];
    const count = counts.get(head.id) ?? { done: 0, total: 0 };
    return {
      id: head.id,
      date: toLocalDate(head.date),
      routineName: head.routineName,
      status: head.status === 'done' ? ('done' as const) : ('in_progress' as const),
      startedAt: head.startedAt,
      recordedDurationMs: recordedDurationMs(segments),
      doneSets: count.done,
      totalSets: count.total,
    };
  });
}

/** What one set of the previous session recorded, for the PRÉCÉDENT column. */
export interface PreviousSet {
  loadKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rir: number | null;
}

/**
 * How a set of one session is matched to the same set of another (specs 14.39).
 *
 * ## THE EXERCISE AND THE ROUND, NEVER THE POSITION
 *
 * `position` is execution order inside a session and it MOVES: adding an
 * exercise mid-workout, removing a set, reordering a superset all shift it. A
 * column that quietly matched a bench press against last week's curl because a
 * row was inserted above is the plausible, invisible kind of wrong this project
 * treats as serious.
 *
 * `(exercise, set_index)` does not move. `set_index` is the ROUND, so in a
 * superset A/B the pair is unique per session as well: A is 1,2,3 and B is
 * 1,2,3, and the exercise separates them.
 *
 * ## THE ID WHEN THERE IS ONE, THE FROZEN NAME OTHERWISE
 *
 * `exercise_id` is nulled when an exercise is deleted (D5/R4) while the frozen
 * name survives — so matching on the id alone would make every set of a deleted
 * exercise lose its history at the moment the history is all that is left of
 * it. The prefix keeps the two namespaces apart: an exercise called after
 * somebody else's ULID cannot collide with it.
 *
 * ONE FUNCTION, used to build the map and to read it. Two spellings of this key
 * would agree on every example anybody writes and diverge on the deleted
 * exercise, which is the case nobody tries by hand.
 */
export function previousSetKey(
  exerciseId: ExerciseId | null,
  exerciseName: string,
  setIndex: number,
): string {
  const who = exerciseId === null ? `name:${exerciseName}` : `id:${exerciseId}`;
  return `${who}:${setIndex}`;
}

/**
 * What each set did the last time this routine was performed (specs 14.39).
 *
 * > Une colonne PRÉCÉDENT affiche pour chaque série le résultat précédent lors
 * > de la dernière même routine.
 *
 * ## TWO QUERIES, WHATEVER THE SESSION HOLDS
 *
 * One to find the session, one to read its sets. The discipline slice 4 settled
 * on the quick-add window: a read per row is what makes a screen that opens in
 * a tenth of a second open in two.
 *
 * ## THE LAST *DONE* SESSION OF THE SAME ROUTINE, AND EVERY WORD COUNTS
 *
 * - THE SAME ROUTINE, because that is what was asked and because it is what
 *   makes the comparison mean something: the same exercise done in a different
 *   session, after different work, is not the number you are trying to beat.
 *   A free session has no routine, so it has no previous — and that is an
 *   honest empty column rather than a guess.
 * - DONE, because a session abandoned halfway is not a performance. An
 *   in-progress one is excluded for a sharper reason: it may be THIS one.
 * - THE LAST, ordered by civil date then by start, which is the order
 *   listSessions uses. Ordering on the instant alone would be right today and
 *   wrong the first time a session is logged for yesterday.
 *
 * ## ONLY THE SETS THAT WERE THEMSELVES DONE
 *
 * A pending or skipped row of the previous session carries whatever was typed
 * into it before it was abandoned. Showing that as "what you did last time"
 * would put a number nobody performed in the column somebody is about to try to
 * beat.
 */
export function readPreviousSets(
  db: AppDatabase,
  routineId: RoutineId | null,
  currentSessionId: SessionId,
): Map<string, PreviousSet> {
  const empty = new Map<string, PreviousSet>();
  if (routineId === null) return empty;

  const [previous] = db
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.routineId, routineId),
        eq(session.status, 'done'),
        ne(session.id, currentSessionId),
      ),
    )
    .orderBy(desc(session.date), desc(session.startedAt))
    .limit(1)
    .all();

  if (previous === undefined) return empty;

  const rows = db
    .select({
      exerciseId: sessionSet.exerciseId,
      exerciseName: sessionSet.exerciseNameFrozen,
      setIndex: sessionSet.setIndex,
      loadKg: sessionSet.actualLoadKg,
      reps: sessionSet.actualReps,
      durationSeconds: sessionSet.actualDurationSeconds,
      rir: sessionSet.actualRir,
    })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .where(and(eq(sessionBlock.sessionId, previous.id), eq(sessionSet.status, 'done')))
    .all();

  const byKey = new Map<string, PreviousSet>();
  for (const row of rows) {
    const value = {
      loadKg: row.loadKg,
      reps: row.reps,
      durationSeconds: row.durationSeconds,
      rir: row.rir,
    };
    // Filed under BOTH keys when there is an id, so previousFor can fall back.
    byKey.set(previousSetKey(row.exerciseId, row.exerciseName, row.setIndex), value);
    if (row.exerciseId !== null) {
      byKey.set(previousSetKey(null, row.exerciseName, row.setIndex), value);
    }
  }
  return byKey;
}

/**
 * The previous result for one set — the ONE place the lookup rule lives.
 *
 * ## THE ID FIRST, THE FROZEN NAME AS A FALLBACK
 *
 * The id is exact and is what matches in every ordinary case. The name catches
 * the one that is not ordinary and is not rare enough to ignore: an exercise
 * DELETED AND RECREATED. Deleting nulls the id on every set that ever used it
 * (D5/R4) and removes it from the routines, so the new one has a new id — and
 * without the fallback the history of a squat somebody re-added would read as
 * a blank column, which looks like a defect rather than like a consequence.
 *
 * The other direction is covered by the same table: a set whose exercise was
 * deleted MID-SESSION has no id either, and finds its history by name.
 *
 * A caller resolving this by hand would be a second spelling of the rule, and
 * the case it would get wrong is exactly the one nobody tries.
 */
export function previousFor(
  previous: ReadonlyMap<string, PreviousSet>,
  set: { exerciseId: ExerciseId | null; exerciseName: string; setIndex: number },
): PreviousSet | null {
  if (set.exerciseId !== null) {
    const byId = previous.get(previousSetKey(set.exerciseId, set.exerciseName, set.setIndex));
    if (byId !== undefined) return byId;
  }
  return previous.get(previousSetKey(null, set.exerciseName, set.setIndex)) ?? null;
}
