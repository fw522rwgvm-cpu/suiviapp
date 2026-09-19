import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { toLocalDate } from '../../src/core/date';
import type { ExerciseId, SessionId } from '../../src/core/db/schema';
import {
  completeSet,
  finishSession,
  setSetType,
  setSkipped,
  startSession,
} from '../../src/features/strength/data/session-writes';
import { readSession } from '../../src/features/strength/data/session-reads';
import { readExerciseHistory } from '../../src/features/strength/data/history-reads';
import { exerciseSessionPoints } from '../../src/features/strength/domain/exercise-stats';
import { createExercise, deleteExercise } from '../../src/features/strength/data/exercise-writes';
import { emptyExerciseDraft } from '../../src/features/strength/domain/exercise-draft';
import type { SessionPlan } from '../../src/features/strength/domain/session-plan';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Reading one exercise's past (specs 10.1, 10.4), against a real SQLite file.
 *
 * The interesting assertions are the two boundaries: what the scope lets
 * through, and what specs 5.3 says must NOT come back after a deletion.
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

function anExercise(name = 'Développé couché'): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(2.5),
    name,
    primaryMuscle: 'chest',
    equipment: 'barbell',
  });
}

function planWith(exerciseId: ExerciseId, name = 'Développé couché', sets = 2): SessionPlan {
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
          targetRepsMin: 8,
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

/** A whole finished session, every set validated at the given load and reps. */
function aFinishedSession(
  exerciseId: ExerciseId,
  date: string,
  now: number,
  performed: { loadKg: number | null; reps: number }[],
): SessionId {
  const result = startSession(
    db.db,
    { date: toLocalDate(date), routineId: null, plan: planWith(exerciseId, 'Développé couché', performed.length) },
    { now },
  );
  if (!result.ok) throw new Error('expected a fresh session');

  const view = readSession(db.db, result.id);
  const sets = view?.blocks[0]?.sets ?? [];
  sets.forEach((set, index) => {
    const done = performed[index];
    if (done === undefined) return;
    completeSet(
      db.db,
      set.id as SessionSetIdLike,
      result.id,
      { reps: done.reps, loadKg: done.loadKg, durationSeconds: null, rir: 2 },
      { now: now + index * MINUTE },
    );
  });
  finishSession(db.db, result.id, { now: now + performed.length * MINUTE });
  return result.id;
}

/** completeSet's id parameter, without importing the branded type for one cast. */
type SessionSetIdLike = Parameters<typeof completeSet>[1];

describe('reading an exercise history', () => {
  it('returns its working sets, oldest first, with the SESSION date', () => {
    const id = anExercise();
    aFinishedSession(id, '2026-09-01', START, [
      { loadKg: 60, reps: 10 },
      { loadKg: 70, reps: 8 },
    ]);
    aFinishedSession(id, '2026-09-08', START + 7 * DAY, [{ loadKg: 72.5, reps: 8 }]);

    const history = readExerciseHistory(db.db, id);

    expect(history).toHaveLength(3);
    expect(history.map((set) => set.date)).toEqual([
      '2026-09-01',
      '2026-09-01',
      '2026-09-08',
    ]);
    expect(history.map((set) => set.loadKg)).toEqual([60, 70, 72.5]);
  });

  it('carries the pending and skipped sets, because specs 10.4 needs them', () => {
    /**
     * The one thing about this read that is easy to get wrong. The charts want
     * validated sets only and say so through countsTowardsVolume; the
     * progression condition needs the others, since a set left undone is what
     * makes "toutes les séries ont atteint le haut" false. Filtering here would
     * make an abandoned session look like a perfect one.
     */
    const id = anExercise();
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(id) },
      { now: START },
    );
    if (!result.ok) throw new Error('expected a fresh session');
    const sets = readSession(db.db, result.id)?.blocks[0]?.sets ?? [];
    setSkipped(db.db, sets[1]?.id as SessionSetIdLike, result.id, true, { now: START + MINUTE });

    const history = readExerciseHistory(db.db, id);

    expect(history).toHaveLength(2);
    expect(history.map((set) => set.status).sort()).toEqual(['pending', 'skipped']);
    // And the fold drops them, so the two rules live in two places on purpose.
    expect(exerciseSessionPoints(history)).toEqual([]);
  });

  it('leaves out a set retyped as a warm-up', () => {
    // set_type is settled in SQL because all three folds want it. Changing a
    // set to warm-up mid-session must take it out of the statistics for good
    // (specs 14.39 no 3).
    const id = anExercise();
    const sessionId = aFinishedSession(id, '2026-09-01', START, [
      { loadKg: 60, reps: 10 },
      { loadKg: 70, reps: 8 },
    ]);
    const sets = readSession(db.db, sessionId)?.blocks[0]?.sets ?? [];
    setSetType(db.db, sets[0]?.id as SessionSetIdLike, sessionId, 'warmup', { now: START + MINUTE });

    expect(readExerciseHistory(db.db, id)).toHaveLength(1);
  });

  it('does NOT resurrect the history of a deleted exercise by its frozen name', () => {
    /**
     * THE BOUNDARY SPECS 5.3 DRAWS, AND IT IS THE OPPOSITE OF previousFor's.
     *
     * > Les séances passées conservent le nom figé de l'exercice, mais la
     * > continuité statistique est rompue définitivement.
     *
     * The user is warned of exactly that before confirming the deletion.
     * Matching on the frozen name here would hand back the records they were
     * told had been destroyed — so the two rules differ on purpose, and this
     * is the test that stops somebody unifying them.
     */
    const first = anExercise();
    aFinishedSession(first, '2026-09-01', START, [{ loadKg: 100, reps: 5 }]);
    deleteExercise(db.db, first);

    // Recreated with the SAME name, which is what somebody undoing a mistake
    // would do.
    const second = anExercise();

    expect(readExerciseHistory(db.db, second)).toEqual([]);

    /*
      AND THE ROWS ARE STILL THERE, which is what makes the assertion above
      mean something. Without this, the test would pass just as well against a
      read that always returned nothing, or against a cascade that had deleted
      the history outright — two very different worlds, one of which specs 5.3
      forbids ("les séances passées conservent le nom figé").

      Read in raw SQL rather than through the function under test, for the
      reason the round-trip test gives: measuring a reader against itself is
      circular.
    */
    const orphans = db.db.all<{ n: number; name: string }>(
      sql`SELECT count(*) AS n, max(exercise_name_frozen) AS name
          FROM session_set WHERE exercise_id IS NULL`,
    );
    expect(orphans[0]?.n).toBe(1);
    expect(orphans[0]?.name).toBe('Développé couché');
  });

  it('orders a session logged for yesterday by its CIVIL date', () => {
    /**
     * Specs 10.3 resumes a session "sans limite de temps", so logging
     * yesterday's workout this morning is an ordinary act. Ordering on the
     * instant alone would put it after today's.
     */
    const id = anExercise();
    // Written second, in wall-clock terms, but belongs to the earlier day.
    aFinishedSession(id, '2026-09-08', START, [{ loadKg: 80, reps: 8 }]);
    aFinishedSession(id, '2026-09-01', START + DAY, [{ loadKg: 60, reps: 8 }]);

    expect(readExerciseHistory(db.db, id).map((set) => set.date)).toEqual([
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  it('tells two exercises apart', () => {
    const bench = anExercise();
    const squat = anExercise('Squat');
    aFinishedSession(bench, '2026-09-01', START, [{ loadKg: 70, reps: 8 }]);
    aFinishedSession(squat, '2026-09-02', START + DAY, [{ loadKg: 100, reps: 5 }]);

    expect(readExerciseHistory(db.db, bench).map((set) => set.loadKg)).toEqual([70]);
    expect(readExerciseHistory(db.db, squat).map((set) => set.loadKg)).toEqual([100]);
  });
});
