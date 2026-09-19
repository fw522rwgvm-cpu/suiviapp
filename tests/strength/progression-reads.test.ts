import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { ExerciseId, SessionId } from '../../src/core/db/schema';
import {
  completeSet,
  finishSession,
  startSession,
} from '../../src/features/strength/data/session-writes';
import { readSession } from '../../src/features/strength/data/session-reads';
import { readProgressionSuggestions } from '../../src/features/strength/data/history-reads';
import { createExercise, updateExercise } from '../../src/features/strength/data/exercise-writes';
import { emptyExerciseDraft } from '../../src/features/strength/domain/exercise-draft';
import type { SessionPlan } from '../../src/features/strength/domain/session-plan';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The progression suggestions of a live session (specs 10.4), against a real
 * SQLite file.
 *
 * The domain rule is tested on rows in progression.test.ts. What is worth
 * asserting here is the part only a database can get wrong: WHICH session the
 * rule is read from.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const START = 1_789_600_000_000;

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

function anExercise(name = 'Développé couché', incrementKg = 2.5): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(incrementKg),
    name,
    primaryMuscle: 'chest',
    equipment: 'barbell',
  });
}

function planWith(
  exerciseId: ExerciseId,
  name: string,
  sets: number,
  targetLoadKg = 70,
): SessionPlan {
  return {
    routineName: 'Haut du corps',
    blocks: [
      {
        restSeconds: 120,
        sets: Array.from({ length: sets }, (_, index) => ({
          exerciseId,
          exerciseName: name,
          setIndex: index + 1,
          setType: 'work' as const,
          targetRepsMin: 6,
          targetRepsMax: 8,
          targetLoadKg,
          targetRir: 2,
          targetDurationSeconds: null,
          progressionEnabled: true,
        })),
      },
    ],
  };
}

type SessionSetIdLike = Parameters<typeof completeSet>[1];

/** Starts a session and leaves it running. */
function startRunning(
  exerciseId: ExerciseId,
  date: string,
  now: number,
  name = 'Développé couché',
  targetLoadKg = 70,
): SessionId {
  const result = startSession(
    db.db,
    { date: toLocalDate(date), routineId: null, plan: planWith(exerciseId, name, 3, targetLoadKg) },
    { now },
  );
  if (!result.ok) throw new Error('expected a fresh session');
  return result.id;
}

/** Validates every set of a running session at the given reps, then finishes it. */
function performAndFinish(sessionId: SessionId, now: number, reps: number, loadKg = 70): void {
  const sets = readSession(db.db, sessionId)?.blocks[0]?.sets ?? [];
  sets.forEach((set, index) => {
    completeSet(
      db.db,
      set.id as SessionSetIdLike,
      sessionId,
      { reps, loadKg, durationSeconds: null, rir: 2 },
      { now: now + index * MINUTE },
    );
  });
  finishSession(db.db, sessionId, { now: now + sets.length * MINUTE });
}

describe('reading the progression suggestions of a session', () => {
  it('suggests the increment when the last session hit the top of the range', () => {
    const id = anExercise();
    performAndFinish(startRunning(id, '2026-09-01', START), START, 8);

    const today = startRunning(id, '2026-09-08', START + 7 * DAY);
    const suggestions = readProgressionSuggestions(db.db, today);

    expect(suggestions.get(id)).toEqual({ loadKg: 72.5, incrementKg: 2.5, fromLoadKg: 70 });
  });

  it('suggests nothing when the last session fell short', () => {
    const id = anExercise();
    // Six repetitions where the range tops out at eight.
    performAndFinish(startRunning(id, '2026-09-01', START), START, 6);

    const today = startRunning(id, '2026-09-08', START + 7 * DAY);

    expect(readProgressionSuggestions(db.db, today).has(id)).toBe(false);
  });

  it('EXCLUDES the running session from its own evidence', () => {
    /**
     * THE ASSERTION THIS FILE EXISTS FOR.
     *
     * Left in, the session in front of you would become the "most recent one
     * containing this exercise": validate three sets at the top of the range
     * and the suggestion would appear mid-workout, telling you to go up on the
     * strength of the very sets you are using it to decide.
     *
     * There is no earlier session here at all, so any suggestion that appears
     * can only have come from this one.
     *
     * TWO GUARDS HOLD THIS, and mutation says so: removing either one alone
     * leaves the test green, because a running session is excluded both by its
     * status and by its id. The test below isolates the id, which is the one
     * that has to survive a caller passing a FINISHED session.
     */
    const id = anExercise();
    const today = startRunning(id, '2026-09-08', START);
    const sets = readSession(db.db, today)?.blocks[0]?.sets ?? [];
    sets.forEach((set, index) => {
      completeSet(
        db.db,
        set.id as SessionSetIdLike,
        today,
        { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
        { now: START + index * MINUTE },
      );
    });

    expect(readProgressionSuggestions(db.db, today).size).toBe(0);
  });

  it('excludes a session from itself even once it is FINISHED', () => {
    /**
     * The test that actually pins `session.id <> currentSessionId`, found by
     * mutating it away and watching everything stay green.
     *
     * A running session is already excluded by its status, so the id guard is
     * unexercised until the session handed in is a finished one — which is
     * exactly what the history screen of specs 10.5 makes reachable. Without
     * the guard, a finished perfect session asked about itself would answer
     * "add 2,5 kg" on the strength of the sets it is showing.
     *
     * `status = 'done'` beside it stays, and is redundant by construction:
     * ux_session_active allows one session in progress at a time, so the only
     * non-finished session there can be is the current one. It is kept because
     * the rule is "the last session you FINISHED", and an index is a poor
     * place to read that from.
     */
    const id = anExercise();
    const finished = startRunning(id, '2026-09-08', START);
    performAndFinish(finished, START, 8);

    expect(readProgressionSuggestions(db.db, finished).size).toBe(0);
  });

  it('reads the LAST finished session, not the best one', () => {
    /**
     * Specs 10.4 says "la séance la plus récente", and the difference shows
     * only when the two disagree: a perfect session followed by a poor one
     * must not propose more weight.
     */
    const id = anExercise();
    performAndFinish(startRunning(id, '2026-09-01', START), START, 8);
    performAndFinish(startRunning(id, '2026-09-08', START + 7 * DAY), START + 7 * DAY, 6);

    const today = startRunning(id, '2026-09-15', START + 14 * DAY);

    expect(readProgressionSuggestions(db.db, today).has(id)).toBe(false);
  });

  it('orders those sessions by CIVIL date, not by the instant', () => {
    /**
     * The tuple SESSION_ORDER states once in session-reads, spelled again in
     * SQL by the window function. The case that separates the two spellings is
     * a session logged for an earlier day but WRITTEN later — specs 10.3
     * resumes "sans limite de temps", so it is ordinary.
     *
     * Here the good session belongs to the later civil day and was written
     * first; the poor one belongs to the earlier day and was written second.
     * Ordering on started_at would pick the poor one and suggest nothing.
     */
    const id = anExercise();
    performAndFinish(startRunning(id, '2026-09-08', START), START, 8);
    performAndFinish(startRunning(id, '2026-09-01', START + DAY), START + DAY, 6);

    const today = startRunning(id, '2026-09-15', START + 14 * DAY);

    expect(readProgressionSuggestions(db.db, today).get(id)?.loadKg).toBe(72.5);
  });

  it('answers per exercise, and only for the ones in this session', () => {
    const bench = anExercise();
    const squat = anExercise('Squat', 5);
    performAndFinish(startRunning(bench, '2026-09-01', START), START, 8);
    performAndFinish(
      startRunning(squat, '2026-09-02', START + DAY, 'Squat', 100),
      START + DAY,
      8,
      100,
    );

    // Today is bench only: the squat has earned a suggestion and must not be
    // in a map keyed for this session's card.
    const today = startRunning(bench, '2026-09-08', START + 7 * DAY);
    const suggestions = readProgressionSuggestions(db.db, today);

    expect(suggestions.get(bench)?.loadKg).toBe(72.5);
    expect(suggestions.has(squat)).toBe(false);
  });

  it('follows the exercise increment when it is changed', () => {
    /**
     * Specs 6.3: the increment is "propre à l'exercice". The query joins
     * `exercise` for it, and useProgressionSuggestions declares that table so
     * the bus re-reads when the editor changes it — this is the half that can
     * be tested from Node.
     */
    const id = anExercise();
    performAndFinish(startRunning(id, '2026-09-01', START), START, 8);
    updateExercise(db.db, id, {
      ...emptyExerciseDraft(5),
      name: 'Développé couché',
      primaryMuscle: 'chest',
      equipment: 'barbell',
    });

    const today = startRunning(id, '2026-09-08', START + 7 * DAY);

    expect(readProgressionSuggestions(db.db, today).get(id)?.loadKg).toBe(75);
  });

  it('is empty for a session whose exercises have never been trained', () => {
    const id = anExercise();
    const today = startRunning(id, '2026-09-08', START);

    expect(readProgressionSuggestions(db.db, today).size).toBe(0);
  });
});
