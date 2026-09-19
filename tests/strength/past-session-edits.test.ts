import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { toLocalDate } from '../../src/core/date';
import type { ExerciseId, SessionId } from '../../src/core/db/schema';
import {
  completeSet,
  finishSession,
  removeSet,
  reopenSet,
  saveTypedSet,
  setSessionNotes,
  setSetRir,
  setSetType,
  startSession,
} from '../../src/features/strength/data/session-writes';
import { listSessions, readSession } from '../../src/features/strength/data/session-reads';
import { readExerciseHistory } from '../../src/features/strength/data/history-reads';
import { exerciseSessionPoints, personalRecords } from '../../src/features/strength/domain/exercise-stats';
import { createExercise } from '../../src/features/strength/data/exercise-writes';
import { emptyExerciseDraft } from '../../src/features/strength/domain/exercise-draft';
import type { SessionPlan } from '../../src/features/strength/domain/session-plan';
import { SESSION_ACTIVE_GAP_MS } from '../../src/features/strength/domain/session-activity';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Editing a session that is already over (specs 10.5, 5.3).
 *
 * > Une séance terminée reste éditable et supprimable. (Specs 10.3)
 * > Aucune limite temporelle d'édition. (Specs 5.3)
 *
 * Every assertion here is about a consequence of that sentence rather than
 * about the edit itself: the writes are the live session's own and are already
 * tested. What is new is that they are now called weeks after the workout, and
 * two things must not move when they are.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEK = 7 * DAY;
const START = 1_789_600_000_000;

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

function anExercise(name = 'Développé couché'): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(2.5),
    name,
    primaryMuscle: 'chest',
    equipment: 'barbell',
  });
}

function planWith(exerciseId: ExerciseId, sets: number): SessionPlan {
  return {
    routineName: 'Haut du corps',
    blocks: [
      {
        restSeconds: 120,
        sets: Array.from({ length: sets }, (_, index) => ({
          exerciseId,
          exerciseName: 'Développé couché',
          setIndex: index + 1,
          setType: 'work' as const,
          targetRepsMin: 6,
          targetRepsMax: 8,
          targetLoadKg: 70,
          targetRir: 2,
          targetDurationSeconds: null,
          progressionEnabled: true,
        })),
      },
    ],
  };
}

type SessionSetIdLike = Parameters<typeof completeSet>[1];

/**
 * A session performed in ten minutes and finished, leaving one set untouched.
 *
 * The spare pending set is what the "validated after the fact" cases need, and
 * having it here keeps each test to the one thing it is about.
 */
function aFinishedSession(exerciseId: ExerciseId): {
  id: SessionId;
  endedAt: number;
} {
  const result = startSession(
    db.db,
    { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(exerciseId, 3) },
    { now: START },
  );
  if (!result.ok) throw new Error('expected a fresh session');

  const sets = readSession(db.db, result.id)?.blocks[0]?.sets ?? [];
  [0, 1].forEach((index) => {
    completeSet(
      db.db,
      sets[index]?.id as SessionSetIdLike,
      result.id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + (index + 1) * MINUTE },
    );
  });

  const endedAt = START + 10 * MINUTE;
  finishSession(db.db, result.id, { now: endedAt });
  return { id: result.id, endedAt };
}

/** The recorded duration, read back the way every screen reads it. */
function durationOf(id: SessionId): number {
  return readSession(db.db, id)?.recordedDurationMs ?? -1;
}

describe('editing a finished session does not lengthen it', () => {
  it('adds no time when a load is corrected three weeks later', () => {
    /**
     * THE DEFECT THIS SLICE WENT LOOKING FOR, and it is the invisible kind.
     *
     * Every write calls touchSession, which opens a new activity segment
     * whenever the last one ended more than thirty minutes ago (D12). Three
     * weeks is well past that, so without a guard the session would acquire a
     * second segment and its "temps actif" would grow by however long somebody
     * spent fixing a typo — on the very figure specs 10.6 draws.
     */
    const { id } = aFinishedSession(anExercise());
    const before = durationOf(id);
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    saveTypedSet(
      db.db,
      setId as SessionSetIdLike,
      id,
      { reps: 8, loadKg: 72.5, durationSeconds: null },
      { now: START + 3 * WEEK },
    );

    expect(durationOf(id)).toBe(before);
    expect(readSession(db.db, id)?.segments).toHaveLength(1);
    // And the correction really happened, so the assertion above is about a
    // guard rather than about a write that silently did nothing.
    expect(readSession(db.db, id)?.blocks[0]?.sets[0]?.actualLoadKg).toBe(72.5);
  });

  it('adds no time on any of the other edits either', () => {
    // One guard in touchSession, so no write site has to remember it. This
    // asserts that every door really does go through that one place.
    const { id } = aFinishedSession(anExercise());
    const before = durationOf(id);
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];
    const later = START + 3 * WEEK;

    setSetRir(db.db, sets[0]?.id as SessionSetIdLike, id, 3, { now: later });
    setSetType(db.db, sets[1]?.id as SessionSetIdLike, id, 'dropset', { now: later + MINUTE });
    reopenSet(db.db, sets[0]?.id as SessionSetIdLike, id, { now: later + 2 * MINUTE });
    removeSet(db.db, sets[2]?.id as SessionSetIdLike, id, { now: later + 3 * MINUTE });
    setSessionNotes(db.db, id, 'Bon travail', { now: later + 4 * MINUTE });

    expect(durationOf(id)).toBe(before);
    expect(readSession(db.db, id)?.segments).toHaveLength(1);
  });

  it('still stamps updated_at, because the row really did change', () => {
    // The guard drops the SEGMENT, not the write. An edited session that
    // claimed never to have been touched would be its own small lie.
    const { id } = aFinishedSession(anExercise());
    const later = START + 3 * WEEK;
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    setSetRir(db.db, setId as SessionSetIdLike, id, 1, { now: later });

    // Raw SQL: updated_at is not on SessionView, and measuring a reader
    // against itself is what the round-trip test refuses.
    const [row] = db.db.all<{ updated_at: number }>(
      sql`SELECT updated_at FROM session WHERE id = ${id}`,
    );
    expect(row?.updated_at).toBe(later);
  });

  it('DOES still extend a session that is merely paused, not finished', () => {
    /**
     * The guard keys on `status`, so the ordinary case must keep working: a
     * session left alone for forty minutes and then written to opens its
     * second segment exactly as D12 says. Without this, "no new segments" and
     * "the feature is broken" would look the same.
     */
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(anExercise(), 2) },
      { now: START },
    );
    if (!result.ok) throw new Error('expected a fresh session');
    const setId = readSession(db.db, result.id)?.blocks[0]?.sets[0]?.id ?? '';

    completeSet(
      db.db,
      setId as SessionSetIdLike,
      result.id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + SESSION_ACTIVE_GAP_MS + MINUTE },
    );

    expect(readSession(db.db, result.id)?.segments).toHaveLength(2);
  });

  it('keeps the final segment finishing gives it', () => {
    // finishSession touches the segment BEFORE flipping the status, so
    // pressing "Terminer" is itself inside the session. The guard must not
    // have taken that away.
    const { id, endedAt } = aFinishedSession(anExercise());
    const segments = readSession(db.db, id)?.segments ?? [];

    expect(segments).toHaveLength(1);
    expect(segments[0]?.endedAt).toBe(endedAt);
    expect(durationOf(id)).toBe(endedAt - START);
  });
});

describe('completing a set after the session is over', () => {
  it('stamps it with the session end, never with today', () => {
    /**
     * "I forgot to tick the third set" is an ordinary correction a week later,
     * and specs 5.3 puts no time limit on it. Today's clock would place the
     * set a week AFTER the session it belongs to — `ix_set_exercise` is built
     * on this column, and the row would sort among sets it has nothing to do
     * with.
     */
    const id = anExercise();
    const { id: sessionId, endedAt } = aFinishedSession(id);
    const pending = readSession(db.db, sessionId)?.blocks[0]?.sets[2]?.id ?? '';

    completeSet(
      db.db,
      pending as SessionSetIdLike,
      sessionId,
      { reps: 7, loadKg: 70, durationSeconds: null, rir: 3 },
      { now: START + 3 * WEEK },
    );

    const set = readSession(db.db, sessionId)?.blocks[0]?.sets[2];
    expect(set?.status).toBe('done');
    expect(set?.completedAt).toBe(endedAt);
  });

  it('still uses the wall clock while the session is running', () => {
    // The live behaviour slice 11 shipped, unchanged — and the assertion that
    // makes the one above about a branch rather than about a constant.
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(anExercise(), 1) },
      { now: START },
    );
    if (!result.ok) throw new Error('expected a fresh session');
    const setId = readSession(db.db, result.id)?.blocks[0]?.sets[0]?.id ?? '';

    completeSet(
      db.db,
      setId as SessionSetIdLike,
      result.id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );

    expect(readSession(db.db, result.id)?.blocks[0]?.sets[0]?.completedAt).toBe(
      START + 5 * MINUTE,
    );
  });

  it('puts the set in the history of its OWN session, not of a later week', () => {
    // The consequence the stamp exists for, asserted through the reader that
    // would have shown it wrong.
    const exerciseId = anExercise();
    const { id: sessionId } = aFinishedSession(exerciseId);
    const pending = readSession(db.db, sessionId)?.blocks[0]?.sets[2]?.id ?? '';

    completeSet(
      db.db,
      pending as SessionSetIdLike,
      sessionId,
      { reps: 7, loadKg: 70, durationSeconds: null, rir: 3 },
      { now: START + 3 * WEEK },
    );

    const history = readExerciseHistory(db.db, exerciseId);
    expect(history.filter((set) => set.status === 'done')).toHaveLength(3);
    // One session, one point — not a second point three weeks later.
    expect(exerciseSessionPoints(history)).toHaveLength(1);
    expect(exerciseSessionPoints(history)[0]?.date).toBe('2026-09-01');
  });
});

describe('what an edit moves, and it should', () => {
  it('moves the records, because nothing derived was stored', () => {
    /**
     * D9's payoff, stated as a test rather than as a claim: correcting a load
     * changes the record immediately, with nothing to invalidate by hand.
     * Editing history is only cheap because the records are a fold.
     */
    const exerciseId = anExercise();
    const { id } = aFinishedSession(exerciseId);

    expect(personalRecords(readExerciseHistory(db.db, exerciseId)).maxLoadKg?.value).toBe(70);

    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';
    saveTypedSet(
      db.db,
      setId as SessionSetIdLike,
      id,
      { reps: 8, loadKg: 90, durationSeconds: null },
      { now: START + WEEK },
    );

    expect(personalRecords(readExerciseHistory(db.db, exerciseId)).maxLoadKg?.value).toBe(90);
  });

  it('leaves the list and the page agreeing about the session', () => {
    // listSessions and readSession count `status === 'done'` the same way, and
    // an edit must not be the thing that separates them.
    const { id } = aFinishedSession(anExercise());
    const setId = readSession(db.db, id)?.blocks[0]?.sets[2]?.id ?? '';

    completeSet(
      db.db,
      setId as SessionSetIdLike,
      id,
      { reps: 6, loadKg: 70, durationSeconds: null, rir: 3 },
      { now: START + WEEK },
    );

    const page = readSession(db.db, id);
    const row = listSessions(db.db).find((item) => item.id === id);
    expect(row?.doneSets).toBe(page?.doneSets);
    expect(row?.totalSets).toBe(page?.totalSets);
    expect(row?.recordedDurationMs).toBe(page?.recordedDurationMs);
  });
});
