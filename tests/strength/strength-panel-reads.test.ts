import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { ExerciseId, Muscle, SessionId } from '../../src/core/db/schema';
import {
  completeSet,
  finishSession,
  setSetType,
  startSession,
} from '../../src/features/strength/data/session-writes';
import { listSessions, readSession } from '../../src/features/strength/data/session-reads';
import { readStrengthPanel } from '../../src/features/strength/data/strength-panel-reads';
import { tallyMuscles } from '../../src/features/strength/domain/muscle-volume';
import { createExercise, deleteExercise } from '../../src/features/strength/data/exercise-writes';
import { emptyExerciseDraft } from '../../src/features/strength/domain/exercise-draft';
import type { SessionPlan } from '../../src/features/strength/domain/session-plan';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * What the dashboard's strength panel reads (specs 10.6), against a real
 * SQLite file.
 *
 * The folds are tested on rows in strength-panel.test.ts. What is worth
 * asserting here is what only a database can get wrong: which sessions the
 * range covers, and which sets count towards the figures.
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

function anExercise(
  name = 'Développé couché',
  primaryMuscle: Muscle = 'chest',
  secondaryMuscles: Muscle[] = ['triceps'],
): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(2.5),
    name,
    primaryMuscle,
    equipment: 'barbell',
    // A Set, not an array: the draft holds one so that adding a muscle twice
    // is impossible rather than merely wrong. Found by a cast hiding it.
    secondaryMuscles: new Set(secondaryMuscles),
  });
}

function planWith(exerciseId: ExerciseId, name: string, sets: number): SessionPlan {
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

type SessionSetIdLike = Parameters<typeof completeSet>[1];

/** A finished session of `sets` working sets, each at 70 kg × 8. */
function aSession(
  exerciseId: ExerciseId,
  date: string,
  now: number,
  sets = 3,
  name = 'Développé couché',
): SessionId {
  const result = startSession(
    db.db,
    { date: toLocalDate(date), routineId: null, plan: planWith(exerciseId, name, sets) },
    { now },
  );
  if (!result.ok) throw new Error('expected a fresh session');

  const rows = readSession(db.db, result.id)?.blocks[0]?.sets ?? [];
  rows.forEach((set, index) => {
    completeSet(
      db.db,
      set.id as SessionSetIdLike,
      result.id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: now + (index + 1) * MINUTE },
    );
  });
  finishSession(db.db, result.id, { now: now + (sets + 1) * MINUTE });
  return result.id;
}

describe('reading the strength panel', () => {
  it('sums the volume and the repetitions of each session', () => {
    const id = anExercise();
    aSession(id, '2026-09-01', START, 3);

    const panel = readStrengthPanel(db.db, toLocalDate('2026-06-01'), toLocalDate('2026-09-19'));

    expect(panel.sessions).toHaveLength(1);
    expect(panel.sessions[0]?.volumeKg).toBe(1680); // 3 × 70 × 8
    expect(panel.sessions[0]?.reps).toBe(24);
    expect(panel.sessions[0]?.setCount).toBe(3);
  });

  it('takes the duration from the SEGMENTS, agreeing with the list', () => {
    /**
     * D12: a session left open overnight has one long gap in it, and
     * `ended_at - started_at` would count the night. Asserted against
     * listSessions rather than against a literal, so the dashboard and the
     * Séances list cannot disagree about how long a workout was.
     */
    const id = anExercise();
    const sessionId = aSession(id, '2026-09-01', START, 3);

    const panel = readStrengthPanel(db.db, toLocalDate('2026-06-01'), toLocalDate('2026-09-19'));
    const row = listSessions(db.db).find((item) => item.id === sessionId);

    expect(panel.sessions[0]?.durationMs).toBe(row?.recordedDurationMs);
  });

  it('bounds the range by the CIVIL date, not by the instant', () => {
    /**
     * > Un instant ne détermine jamais l'appartenance à une journée. (D3)
     *
     * The session below belongs to a day inside the range and was WRITTEN
     * long after it. Filtering on started_at would drop it.
     */
    const id = anExercise();
    aSession(id, '2026-09-01', START + 200 * DAY, 3);

    const panel = readStrengthPanel(db.db, toLocalDate('2026-08-01'), toLocalDate('2026-09-19'));
    expect(panel.sessions).toHaveLength(1);
  });

  it('excludes what falls outside the range, at both ends', () => {
    const id = anExercise();
    aSession(id, '2026-05-01', START, 3);
    aSession(id, '2026-09-01', START + 130 * DAY, 3);
    aSession(id, '2026-12-01', START + 250 * DAY, 3);

    const panel = readStrengthPanel(db.db, toLocalDate('2026-08-01'), toLocalDate('2026-09-19'));
    expect(panel.sessions.map((row) => row.date)).toEqual(['2026-09-01']);
  });

  it('reads everything when there is no lower bound, which is "tout"', () => {
    const id = anExercise();
    aSession(id, '2020-01-01', START, 3);
    aSession(id, '2026-09-01', START + DAY, 3);

    const panel = readStrengthPanel(db.db, null, toLocalDate('2026-09-19'));
    expect(panel.sessions).toHaveLength(2);
    // Oldest first, the direction every chart is drawn in.
    expect(panel.sessions[0]?.date).toBe('2020-01-01');
  });

  it('leaves out a session still in progress', () => {
    // It has no duration worth charting — it is still accruing — and its sets
    // are half recorded. It joins the dashboard when it becomes a fact.
    const id = anExercise();
    startSession(
      db.db,
      { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(id, 'Développé couché', 3) },
      { now: START },
    );

    expect(readStrengthPanel(db.db, null, toLocalDate('2026-09-19')).sessions).toEqual([]);
  });

  it('counts only the sets specs 10.1 scopes the volume to', () => {
    // The shared predicate, asserted here as well as on the exercise page:
    // two spellings of "which sets count" is what this slice is arranged to
    // avoid, and the dashboard is the second reader.
    const id = anExercise();
    const sessionId = aSession(id, '2026-09-01', START, 3);
    const sets = readSession(db.db, sessionId)?.blocks[0]?.sets ?? [];
    setSetType(db.db, sets[0]?.id as SessionSetIdLike, sessionId, 'warmup', {
      now: START + 10 * MINUTE,
    });

    const panel = readStrengthPanel(db.db, null, toLocalDate('2026-09-19'));
    expect(panel.sessions[0]?.setCount).toBe(2);
    expect(panel.sessions[0]?.volumeKg).toBe(1120);
  });

  it('tallies the muscles of the range, one entry per SET', () => {
    /**
     * tallyMuscles counts sets, not exercises: specs 10.2's map is about how
     * much a muscle was worked, and an exercise done for five sets is not the
     * same as one done for one.
     */
    const bench = anExercise('Développé couché', 'chest', ['triceps']);
    const squat = anExercise('Squat', 'quads', []);
    aSession(bench, '2026-09-01', START, 3);
    aSession(squat, '2026-09-03', START + 2 * DAY, 2, 'Squat');

    const panel = readStrengthPanel(db.db, null, toLocalDate('2026-09-19'));
    const tally = tallyMuscles(panel.volumeSets);

    expect(tally.get('chest')?.direct).toBe(3);
    expect(tally.get('triceps')?.indirect).toBe(3);
    expect(tally.get('quads')?.direct).toBe(2);
  });

  it('keeps the volume of a DELETED exercise while losing its muscles', () => {
    /**
     * The two halves of specs 5.3 pull apart here, and the read has to honour
     * both. The sets really were performed, so their volume stays on the
     * dashboard; the exercise is gone, so there are no muscles left to light
     * and the body map under-reports rather than guessing from a frozen name.
     */
    const id = anExercise();
    aSession(id, '2026-09-01', START, 3);
    deleteExercise(db.db, id);

    const panel = readStrengthPanel(db.db, null, toLocalDate('2026-09-19'));

    expect(panel.sessions[0]?.volumeKg).toBe(1680);
    expect(panel.volumeSets).toEqual([]);
  });

  it('keeps a bodyweight session at null volume while counting its reps', () => {
    const id = anExercise();
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-01'), routineId: null, plan: planWith(id, 'Traction', 2) },
      { now: START },
    );
    if (!result.ok) throw new Error('expected a fresh session');
    const sets = readSession(db.db, result.id)?.blocks[0]?.sets ?? [];
    sets.forEach((set, index) => {
      completeSet(
        db.db,
        set.id as SessionSetIdLike,
        result.id,
        { reps: 10, loadKg: null, durationSeconds: null, rir: 2 },
        { now: START + (index + 1) * MINUTE },
      );
    });
    finishSession(db.db, result.id, { now: START + 5 * MINUTE });

    const panel = readStrengthPanel(db.db, null, toLocalDate('2026-09-19'));
    expect(panel.sessions[0]?.volumeKg).toBeNull();
    expect(panel.sessions[0]?.reps).toBe(20);
  });
});
