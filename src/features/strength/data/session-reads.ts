import { asc, eq, isNull } from 'drizzle-orm';
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
