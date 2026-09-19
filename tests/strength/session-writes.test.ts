import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { toLocalDate } from '../../src/core/date';
import { newId } from '../../src/core/id';
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
} from '../../src/core/db/schema';
import { SESSION_ACTIVE_GAP_MS } from '../../src/features/strength/domain/session-activity';
import type { SessionPlan } from '../../src/features/strength/domain/session-plan';
import {
  addExerciseToSession,
  addRound,
  completeSet,
  deleteSession,
  finishSession,
  removeSet,
  reopenSet,
  saveTypedSet,
  setSetRir,
  setSetType,
  setSkipped,
  startSession,
  addExerciseNote,
} from '../../src/features/strength/data/session-writes';
import {
  listSessions,
  previousFor,
  readActiveSession,
  readPendingNotes,
  readPreviousSets,
  readSession,
} from '../../src/features/strength/data/session-reads';
import { createExercise, deleteExercise } from '../../src/features/strength/data/exercise-writes';
import { emptyExerciseDraft } from '../../src/features/strength/domain/exercise-draft';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Writing and reading a live session (specs 10.3), against a real SQLite file.
 *
 * What is worth testing here is not that an insert inserts. It is the places
 * where more than one table moves at once — a validated set and the segment
 * that has to contain it — and the invariant the database carries rather than
 * the application.
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

function anExercise(name = 'Développé couché', tracksDuration = false): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(2.5),
    name,
    primaryMuscle: 'chest',
    equipment: 'barbell',
    tracksDuration,
  });
}

function planWith(exerciseId: ExerciseId, sets = 2): SessionPlan {
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

function start(plan: SessionPlan, now = START): SessionId {
  const result = startSession(
    db.db,
    { date: toLocalDate('2026-09-18'), routineId: null, plan },
    { now },
  );
  if (!result.ok) throw new Error('expected a fresh session');
  return result.id;
}

/** The id of a session's first set, which several tests need. */
function firstSetOf(id: SessionId): string {
  return readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';
}

describe('starting a session', () => {
  it('writes the plan and opens the first segment', () => {
    const id = start(planWith(anExercise()));
    const view = readSession(db.db, id);

    expect(view?.blocks).toHaveLength(1);
    expect(view?.blocks[0]?.sets).toHaveLength(2);
    expect(view?.blocks[0]?.restSeconds).toBe(120);
    // Starting IS the first act: a session whose first set comes twenty minutes
    // later did not begin then.
    expect(view?.segments).toHaveLength(1);
    expect(view?.segments[0]?.startedAt).toBe(START);
    // Zero length until the next write, and never NULL — which is what makes a
    // force quit right here cost nothing.
    expect(view?.segments[0]?.endedAt).toBe(START);
  });

  it('refuses a second one with a value, not an exception', () => {
    /**
     * Section 4: an expected error is a return value. Tapping a routine's start
     * button while a session runs is an expected state with a sentence attached
     * — and the sentence needs to name the live session, which is why the
     * refusal carries its id.
     */
    const first = start(planWith(anExercise()));
    const second = startSession(
      db.db,
      { date: toLocalDate('2026-09-18'), routineId: null, plan: planWith(anExercise('Squat')) },
      { now: START + MINUTE },
    );

    expect(second).toEqual({ ok: false, reason: 'already_in_progress', id: first });
  });

  it('is stopped by the DATABASE, not by that check', () => {
    /**
     * THE ASSERTION THAT SAYS WHERE THE INVARIANT ACTUALLY LIVES.
     *
     * D12 requires the database to carry it, "pas par une vérification
     * applicative, qu'un écran distrait ou une condition de course peut
     * contourner". The read in startSession() exists to give a screen something
     * to say; ux_session_active is what makes it true.
     *
     * So this bypasses the function entirely and writes the row directly. If
     * the index were ever dropped, every other test here would still pass.
     */
    start(planWith(anExercise()));

    expect(() =>
      db.db
        .insert(session)
        .values({
          id: newId<SessionId>(),
          date: toLocalDate('2026-09-18'),
          status: 'in_progress',
          startedAt: START + MINUTE,
        })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('lets a new one start once the previous is finished', () => {
    const first = start(planWith(anExercise()));
    finishSession(db.db, first, { now: START + 30 * MINUTE });

    const second = startSession(
      db.db,
      { date: toLocalDate('2026-09-19'), routineId: null, plan: planWith(anExercise('Squat')) },
      { now: START + 24 * 60 * MINUTE },
    );

    expect(second.ok).toBe(true);
  });

  it('keeps the routine name as a snapshot, with no live link', () => {
    // Specs 5.2: a session is a snapshot of the routine at start. The id is
    // informative and carries no foreign key, so deleting the routine later
    // cannot take the session with it.
    const routineId = newId<RoutineId>();
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-18'), routineId, plan: planWith(anExercise()) },
      { now: START },
    );
    expect(result.ok).toBe(true);

    const [row] = db.db.select().from(session).all();
    expect(row?.routineId).toBe(routineId);
    expect(row?.routineNameSnapshot).toBe('Haut du corps');
  });
});

describe('validating a set', () => {
  it('records it and extends the segment IN ONE TRANSACTION', () => {
    /**
     * A recorded set and the time that contains it are ONE fact. Killed between
     * them, the application would hold a set whose work no segment accounts for
     * — and specs 2.2 makes "between them" a real place, at every instant.
     *
     * What a test in Node can hold is that one call does both. That the process
     * cannot die in the middle is SQLite's transaction, not this assertion.
     */
    const id = start(planWith(anExercise()));
    const view = readSession(db.db, id);
    const setId = view?.blocks[0]?.sets[0]?.id ?? '';

    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 72.5, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );

    const after = readSession(db.db, id);
    expect(after?.blocks[0]?.sets[0]?.status).toBe('done');
    expect(after?.blocks[0]?.sets[0]?.actualLoadKg).toBe(72.5);
    expect(after?.blocks[0]?.sets[0]?.completedAt).toBe(START + 5 * MINUTE);
    // One segment still, now five minutes long.
    expect(after?.segments).toHaveLength(1);
    expect(after?.recordedDurationMs).toBe(5 * MINUTE);
  });

  it('counts towards the session progress', () => {
    const id = start(planWith(anExercise()));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + MINUTE },
    );

    const after = readSession(db.db, id);
    expect(after?.doneSets).toBe(1);
    expect(after?.totalSets).toBe(2);
  });
});

describe('the segments a real workout produces', () => {
  it('stays one segment while the writes keep coming', () => {
    const id = start(planWith(anExercise(), 3));
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];

    sets.forEach((set, index) => {
      completeSet(
        db.db,
        set.id as never,
        id,
        { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
        { now: START + (index + 1) * 4 * MINUTE },
      );
    });

    const after = readSession(db.db, id);
    expect(after?.segments).toHaveLength(1);
    expect(after?.recordedDurationMs).toBe(12 * MINUTE);
  });

  it('OPENS A NEW ONE AFTER A NIGHT, AND NEVER COUNTS THE NIGHT', () => {
    /**
     * THE EXIT CRITERION, AGAINST A REAL DATABASE.
     *
     * session-activity.test.ts holds the arithmetic; this holds that the write
     * path applies it. Forty minutes of work, the phone put down, the session
     * picked up fourteen hours later.
     *
     * Nothing ran during those fourteen hours, which is the whole point: the
     * previous segment was already ended by its own last write, so the resume
     * has nothing to repair.
     */
    const id = start(planWith(anExercise(), 5));
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];
    const done = (index: number, now: number): void => {
      completeSet(
        db.db,
        sets[index]?.id as never,
        id,
        { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
        { now },
      );
    };

    // Thirty minutes of sets, ten minutes apart — a real workout writes often.
    done(0, START + 10 * MINUTE);
    done(1, START + 20 * MINUTE);
    done(2, START + 30 * MINUTE);

    const resumedAt = START + 30 * MINUTE + 14 * 60 * MINUTE;
    done(3, resumedAt);
    done(4, resumedAt + 20 * MINUTE);

    const after = readSession(db.db, id);
    expect(after?.segments).toHaveLength(2);
    // Thirty minutes, then twenty. Not fourteen hours and fifty minutes.
    expect(after?.recordedDurationMs).toBe(50 * MINUTE);
    expect(resumedAt + 20 * MINUTE - START).toBe(14 * 60 * MINUTE + 50 * MINUTE);
  });

  it('DOES NOT COUNT A SILENCE LONGER THAN THE GAP, EVEN AT THE VERY START', () => {
    /**
     * CONSEQUENCE ACCEPTED AND WRITTEN DOWN, found by a test whose first
     * version assumed otherwise.
     *
     * D12's rule is "trente minutes sans aucune ÉCRITURE", and a warm-up is
     * writing nothing: specs 10.2 makes it a list of text lines to read, not
     * sets to record. So a session started, warmed up for forty minutes and
     * then worked counts the work and not the warm-up.
     *
     * That is the rule applied rather than a hole in it, and the alternative is
     * worse: counting a silence because it happens to be the first one would
     * mean the same silence counts at the start of a workout and not in the
     * middle of it. Two answers to one question, decided by position.
     *
     * The mitigation, if it is ever wanted, is not here — it is a warm-up the
     * user ticks off, which writes.
     */
    const id = start(planWith(anExercise(), 2));
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];

    completeSet(
      db.db,
      sets[0]?.id as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + 40 * MINUTE },
    );
    completeSet(
      db.db,
      sets[1]?.id as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + 45 * MINUTE },
    );

    const after = readSession(db.db, id);
    // The opening segment is zero-length; the work is the five minutes between
    // the two sets.
    expect(after?.recordedDurationMs).toBe(5 * MINUTE);
  });

  it('extends rather than splitting at exactly the threshold', () => {
    const id = start(planWith(anExercise(), 2));
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];

    completeSet(
      db.db,
      sets[0]?.id as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + SESSION_ACTIVE_GAP_MS },
    );

    expect(readSession(db.db, id)?.segments).toHaveLength(1);
  });

  it('counts a deferred field write as activity too', () => {
    // Both rhythms of D12 touch the segments: typing a load is work happening,
    // even though it does not validate the set.
    const id = start(planWith(anExercise()));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    saveTypedSet(
      db.db,
      setId as never,
      id,
      { reps: null, loadKg: 75, durationSeconds: null },
      { now: START + 3 * MINUTE },
    );

    const after = readSession(db.db, id);
    expect(after?.recordedDurationMs).toBe(3 * MINUTE);
    // And the set is NOT validated: only a RIR does that (specs 10.3).
    expect(after?.blocks[0]?.sets[0]?.status).toBe('pending');
    expect(after?.blocks[0]?.sets[0]?.actualLoadKg).toBe(75);
  });
});

describe('changing the session while it runs', () => {
  it('adds a round to a superset, one set of each exercise', () => {
    /**
     * Specs 14.23 no 1: in a superset "Ajouter une série" becomes "Ajouter un
     * tour", because half a round of a superset is not something anybody
     * trains. The order is the block's own, which is what keeps A,B,A,B.
     */
    const a = anExercise('Développé couché');
    const b = anExercise('Rowing barre');
    const id = start({
      routineName: 'Push/Pull',
      blocks: [
        {
          restSeconds: 90,
          sets: [
            { exerciseId: a, exerciseName: 'Développé couché', setIndex: 1, setType: 'work', targetRepsMin: 8, targetRepsMax: 8, targetLoadKg: 70, targetRir: 2, targetDurationSeconds: null, progressionEnabled: false },
            { exerciseId: b, exerciseName: 'Rowing barre', setIndex: 1, setType: 'work', targetRepsMin: 10, targetRepsMax: 10, targetLoadKg: 50, targetRir: 2, targetDurationSeconds: null, progressionEnabled: false },
          ],
        },
      ],
    });
    const blockId = readSession(db.db, id)?.blocks[0]?.id ?? '';

    addRound(db.db, blockId as never, id, { now: START + 5 * MINUTE });

    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];
    expect(sets.map((set) => set.exerciseName)).toEqual([
      'Développé couché',
      'Rowing barre',
      'Développé couché',
      'Rowing barre',
    ]);
    // The round number, not the position: each exercise's own rank.
    expect(sets.map((set) => set.setIndex)).toEqual([1, 1, 2, 2]);
    // And the targets come from the previous set of the SAME exercise, so the
    // commonest live action does not ask the most.
    expect(sets[2]?.targetLoadKg).toBe(70);
    expect(sets[3]?.targetLoadKg).toBe(50);
  });

  it('adds an exercise as its own block, never into the previous one', () => {
    // Appending to the last block would silently turn the previous exercise
    // into a superset — a decision about what rests together, made by accident.
    const id = start(planWith(anExercise()));
    const extra = anExercise('Squat');

    addExerciseToSession(db.db, id, extra, { sets: 3, restSeconds: 180 }, { now: START + MINUTE });

    const view = readSession(db.db, id);
    expect(view?.blocks).toHaveLength(2);
    expect(view?.blocks[1]?.sets).toHaveLength(3);
    expect(view?.blocks[1]?.restSeconds).toBe(180);
    // Nothing prescribed: an exercise added live has no target to copy.
    expect(view?.blocks[1]?.sets[0]?.targetLoadKg).toBeNull();
  });

  it('removes a set, and the block it emptied', () => {
    const id = start(planWith(anExercise(), 1));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    removeSet(db.db, setId as never, id, { now: START + MINUTE });

    // A block with no sets renders as a row nobody can explain —
    // deleteExercise's precedent, applied to the session.
    expect(readSession(db.db, id)?.blocks).toEqual([]);
  });

  it('keeps a block that still holds another set', () => {
    const id = start(planWith(anExercise(), 2));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    removeSet(db.db, setId as never, id, { now: START + MINUTE });

    expect(readSession(db.db, id)?.blocks).toHaveLength(1);
  });

  it('skips a set without erasing that it was prescribed', () => {
    /**
     * `skipped` rather than deleted: the set WAS prescribed and not doing it is
     * a fact about the workout. Deleting would make the session look like it
     * never asked.
     */
    const id = start(planWith(anExercise(), 2));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    setSkipped(db.db, setId as never, id, true, { now: START + MINUTE });

    const view = readSession(db.db, id);
    expect(view?.blocks[0]?.sets).toHaveLength(2);
    expect(view?.blocks[0]?.sets[0]?.status).toBe('skipped');
    // Not counted as done, so the progress figure stays honest.
    expect(view?.doneSets).toBe(0);
  });

  it('returns a skipped set to untouched', () => {
    const id = start(planWith(anExercise(), 1));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';

    setSkipped(db.db, setId as never, id, true, { now: START + MINUTE });
    setSkipped(db.db, setId as never, id, false, { now: START + 2 * MINUTE });

    expect(readSession(db.db, id)?.blocks[0]?.sets[0]?.status).toBe('pending');
  });
});

describe('finishing and deleting', () => {
  it('closes the session with the act that finished it inside a segment', () => {
    /**
     * The segment is touched BEFORE the status changes: pressing "Terminer" is
     * itself an act, and a session whose final segment ended before its own
     * ending would be a few seconds short of the truth.
     */
    const id = start(planWith(anExercise(), 2));
    const sets = readSession(db.db, id)?.blocks[0]?.sets ?? [];
    completeSet(
      db.db,
      sets[0]?.id as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + 10 * MINUTE },
    );
    completeSet(
      db.db,
      sets[1]?.id as never,
      id,
      { reps: 8, loadKg: 70, durationSeconds: null, rir: 2 },
      { now: START + 20 * MINUTE },
    );

    finishSession(db.db, id, { now: START + 25 * MINUTE });

    const view = readSession(db.db, id);
    expect(view?.status).toBe('done');
    expect(view?.endedAt).toBe(START + 25 * MINUTE);
    // The five minutes between the last set and pressing "Terminer" are inside
    // the segment: touchSession runs BEFORE the status changes, because
    // finishing is itself an act.
    expect(view?.recordedDurationMs).toBe(25 * MINUTE);
    // And nothing is live any more.
    expect(readActiveSession(db.db)).toBeNull();
  });

  it('takes its blocks, sets and segments with it when deleted', () => {
    const id = start(planWith(anExercise()));

    deleteSession(db.db, id);

    expect(db.db.select().from(sessionBlock).all()).toEqual([]);
    expect(db.db.select().from(sessionSet).all()).toEqual([]);
    expect(db.db.select().from(sessionSegment).all()).toEqual([]);
  });
});

describe('the notes waiting for a session', () => {
  it('offers only the unconsumed ones', () => {
    const id = anExercise();
    addExerciseNote(db.db, id, 'Monter à 75', { now: START });

    expect(readPendingNotes(db.db, [id]).get(id)).toEqual(['Monter à 75']);
  });

  it('is consumed by the session that contained the exercise, and kept', () => {
    /**
     * Specs 6.3: a note is "destinée à la prochaine séance le comportant". This
     * WAS that session.
     *
     * MARKED, NEVER DELETED, and no document says which. A note is something
     * the user wrote; removing it because a screen displayed it destroys it
     * without anybody asking, and specs 5.2 says history is not rewritten.
     */
    const exerciseId = anExercise();
    addExerciseNote(db.db, exerciseId, 'Monter à 75', { now: START });
    const id = start(planWith(exerciseId));

    finishSession(db.db, id, { now: START + 40 * MINUTE });

    expect(readPendingNotes(db.db, [exerciseId]).size).toBe(0);
    // The row survives, with its text.
    const rows = db.db.select().from(exerciseNote).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe('Monter à 75');
    expect(rows[0]?.consumedAt).toBe(START + 40 * MINUTE);
  });

  it('leaves the notes of exercises the session did not contain', () => {
    const performed = anExercise('Développé couché');
    const untouched = anExercise('Squat');
    addExerciseNote(db.db, untouched, 'Descendre plus bas', { now: START });
    const id = start(planWith(performed));

    finishSession(db.db, id, { now: START + 40 * MINUTE });

    expect(readPendingNotes(db.db, [untouched]).get(untouched)).toEqual(['Descendre plus bas']);
  });

  it('ignores an empty note rather than storing a blank row', () => {
    const id = anExercise();
    addExerciseNote(db.db, id, '   ', { now: START });

    expect(db.db.select().from(exerciseNote).all()).toEqual([]);
  });
});

describe('a session whose exercise was deleted', () => {
  it('still shows what was performed', () => {
    /**
     * D5/R4 seen from the reading side: a LEFT join, never an inner one.
     * exercise_id is NULL for a deleted exercise, and an inner join would make
     * those sets disappear from their own session — the defect slice 6 found
     * with frozen ingredients, in the same shape.
     */
    const exerciseId = anExercise();
    const id = start(planWith(exerciseId, 1));
    const setId = readSession(db.db, id)?.blocks[0]?.sets[0]?.id ?? '';
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 72.5, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );

    db.db.update(sessionSet).set({ exerciseId: null }).run();
    db.db.delete(exercise).where(eq(exercise.id, exerciseId)).run();

    const view = readSession(db.db, id);
    expect(view?.blocks[0]?.sets).toHaveLength(1);
    expect(view?.blocks[0]?.sets[0]?.exerciseName).toBe('Développé couché');
    expect(view?.blocks[0]?.sets[0]?.actualLoadKg).toBe(72.5);
    expect(view?.blocks[0]?.sets[0]?.exerciseId).toBeNull();
  });
});

describe('listing the sessions', () => {
  it('AGREES WITH readSession, session by session', () => {
    /**
     * TWO IMPLEMENTATIONS OF ONE QUESTION, held together by a test rather than
     * by care — the shape slice 4 settled when the quick-add window needed a
     * window function saying the same thing as readLastEntryForFood.
     *
     * `readSession` walks one session's sets and counts `status === 'done'`;
     * `listSessions` counts the same thing for every session in one grouped
     * query, because a read per row is what slice 4 refused. They agree on
     * every example anybody writes by hand, and the day they diverge the list
     * says "3/8" over a page that says "4/8" — plausible on both screens.
     */
    const first = start(planWith(anExercise()), START);
    completeSet(
      db.db,
      firstSetOf(first) as never,
      first,
      { reps: 8, loadKg: 60, durationSeconds: null, rir: 2 },
      { now: START + MINUTE },
    );
    finishSession(db.db, first, { now: START + 30 * MINUTE });

    // A running session with a SKIPPED set, so the comparison covers the state
    // where the two counters could most easily disagree.
    const second = start(planWith(anExercise()), START + 2 * DAY);
    setSkipped(db.db, firstSetOf(second) as never, second, true, {
      now: START + 2 * DAY + MINUTE,
    });

    const listed = listSessions(db.db);
    expect(listed).toHaveLength(2);

    for (const row of listed) {
      const full = readSession(db.db, row.id);
      expect(full, row.id).not.toBeNull();
      expect(row.doneSets, `${row.id}: doneSets`).toBe(full?.doneSets);
      expect(row.totalSets, `${row.id}: totalSets`).toBe(full?.totalSets);
      expect(row.recordedDurationMs, `${row.id}: duration`).toBe(full?.recordedDurationMs);
      expect(row.status, `${row.id}: status`).toBe(full?.status);
      expect(row.date, `${row.id}: date`).toBe(full?.date);
    }

    // Non-vacuous: the two sessions must actually differ, or the loop above
    // would pass against any pair of identical rows.
    expect(listed[0]?.id).not.toBe(listed[1]?.id);
    expect(listed.map((row) => row.status).sort()).toEqual(['done', 'in_progress']);
  });

  it('puts the most recent first, and separates two sessions on one day', () => {
    // `date` is what somebody reads and `startedAt` is what separates two
    // sessions on the same day. Ordering on the instant alone would be right
    // today and wrong the first time a session is logged for yesterday.
    const older = start(planWith(anExercise()), START);
    finishSession(db.db, older, { now: START + 10 * MINUTE });
    const newer = start(planWith(anExercise()), START + 2 * MINUTE);

    expect(listSessions(db.db).map((row) => row.id)).toEqual([newer, older]);
  });

  it('does not count a skipped set as done', () => {
    // Specs 10.3 makes skipping an outcome of its own. Counting it as done
    // would say somebody trained when they deliberately did not.
    const id = start(planWith(anExercise()), START);
    setSkipped(db.db, firstSetOf(id) as never, id, true, { now: START + MINUTE });

    const [row] = listSessions(db.db);
    expect(row?.doneSets).toBe(0);
    expect(row?.totalSets).toBeGreaterThan(0);
  });

  it('is empty on a database with no sessions, without reading anything else', () => {
    expect(listSessions(db.db)).toEqual([]);
  });
});

describe('correcting a set after it was validated', () => {
  it('REOPENS it without losing what was recorded', () => {
    /**
     * Slice 11 froze a validated row, arguing that correcting belonged to the
     * finished session. Requested reversed (specs 14.38): you notice the wrong
     * load one set later, not one session later.
     *
     * What must survive is the recording. Reopening a set to fix its reps that
     * dropped its load would make the correction cost more than the mistake.
     */
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 72.5, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );

    reopenSet(db.db, setId as never, id, { now: START + 6 * MINUTE });

    const set = readSession(db.db, id)?.blocks[0]?.sets[0];
    expect(set?.status).toBe('pending');
    expect(set?.actualLoadKg).toBe(72.5);
    expect(set?.actualReps).toBe(8);
    expect(set?.actualRir).toBe(2);
  });

  it('CLEARS completed_at, because a reopened set anchors no rest', () => {
    /**
     * `completed_at` is the instant the rest timer counts from (D12) and the
     * column `ix_set_exercise` is built on. A set that is no longer done must
     * not start a countdown and must not appear in a history of things that
     * were lifted.
     */
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 60, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );
    expect(readSession(db.db, id)?.blocks[0]?.sets[0]?.completedAt).toBe(START + 5 * MINUTE);

    reopenSet(db.db, setId as never, id, { now: START + 6 * MINUTE });

    expect(readSession(db.db, id)?.blocks[0]?.sets[0]?.completedAt).toBeNull();
  });

  it('takes the set back out of the done count', () => {
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 60, durationSeconds: null, rir: 2 },
      { now: START + 5 * MINUTE },
    );
    expect(readSession(db.db, id)?.doneSets).toBe(1);

    reopenSet(db.db, setId as never, id, { now: START + 6 * MINUTE });

    expect(readSession(db.db, id)?.doneSets).toBe(0);
    // And the list read agrees, which is the pair slice 12 will depend on.
    expect(listSessions(db.db)[0]?.doneSets).toBe(0);
  });
});

describe('recording a RIR on its own', () => {
  it('DOES NOT validate the set, which is the whole point of the split', () => {
    /**
     * Slice 11 made picking a RIR the act of validating. That put two things in
     * one control and made the second unreachable — no way to change a
     * mis-tapped RIR, no way to record one before the set was done.
     *
     * This is the test that would fail if the two were ever folded back
     * together, which is the tempting simplification.
     */
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);

    setSetRir(db.db, setId as never, id, 1.5, { now: START + MINUTE });

    const set = readSession(db.db, id)?.blocks[0]?.sets[0];
    expect(set?.actualRir).toBe(1.5);
    expect(set?.status).toBe('pending');
    expect(set?.completedAt).toBeNull();
    expect(readSession(db.db, id)?.doneSets).toBe(0);
  });

  it('can be changed on a set that is already done, without reopening it', () => {
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 60, durationSeconds: null, rir: 3 },
      { now: START + 5 * MINUTE },
    );

    setSetRir(db.db, setId as never, id, 0, { now: START + 6 * MINUTE });

    const set = readSession(db.db, id)?.blocks[0]?.sets[0];
    expect(set?.actualRir).toBe(0);
    expect(set?.status).toBe('done');
    // Still done, so still counted and still anchoring its rest.
    expect(set?.completedAt).toBe(START + 5 * MINUTE);
    expect(readSession(db.db, id)?.doneSets).toBe(1);
  });
});

describe('what each set did last time', () => {
  const ROUTINE = 'routine-abc' as RoutineId;
  const OTHER = 'routine-xyz' as RoutineId;

  /**
   * ONE exercise for every session here, which is the whole point.
   *
   * `anExercise()` creates a new one each call, so three sessions built from
   * three calls would carry three different ids — and the column would find
   * nothing while looking perfectly correct. The first version of this test did
   * exactly that and failed, which is the defect it is meant to catch.
   */
  let sharedExercise: ExerciseId;

  function startFor(routineId: RoutineId | null, now: number): SessionId {
    const result = startSession(
      db.db,
      { date: toLocalDate('2026-09-18'), routineId, plan: planWith(sharedExercise) },
      { now },
    );
    if (!result.ok) throw new Error('expected a fresh session');
    return result.id;
  }

  beforeEach(() => {
    sharedExercise = anExercise();
  });

  function finishWith(id: SessionId, loadKg: number, reps: number, rir: number, now: number): void {
    completeSet(
      db.db,
      firstSetOf(id) as never,
      id,
      { reps, loadKg, durationSeconds: null, rir },
      { now },
    );
    finishSession(db.db, id, { now: now + MINUTE });
  }

  it('reads the last DONE session of the SAME routine', () => {
    const older = startFor(ROUTINE, START);
    finishWith(older, 60, 8, 3, START + MINUTE);

    const newer = startFor(ROUTINE, START + DAY);
    finishWith(newer, 65, 8, 2, START + DAY + MINUTE);

    const current = startFor(ROUTINE, START + 2 * DAY);
    const set = readSession(db.db, current)?.blocks[0]?.sets[0];
    const found = previousFor(readPreviousSets(db.db, ROUTINE, current), {
      exerciseId: set?.exerciseId ?? null,
      exerciseName: set?.exerciseName ?? '',
      setIndex: 1,
    });

    // The MOST RECENT one, not the first one found.
    expect(found?.loadKg).toBe(65);
    expect(found?.reps).toBe(8);
    expect(found?.rir).toBe(2);
  });

  it('IGNORES a session of another routine', () => {
    /**
     * What makes the comparison mean anything: the same exercise done in a
     * different session, after different work, is not the number you are trying
     * to beat. A column that quietly showed it would be plausible and wrong.
     */
    const elsewhere = startFor(OTHER, START);
    finishWith(elsewhere, 100, 3, 0, START + MINUTE);

    const current = startFor(ROUTINE, START + DAY);

    expect(readPreviousSets(db.db, ROUTINE, current).size).toBe(0);
  });

  it('IGNORES a session still in progress, including this one', () => {
    // A session abandoned halfway is not a performance — and an in-progress one
    // may be the very session asking the question.
    const current = startFor(ROUTINE, START);
    completeSet(
      db.db,
      firstSetOf(current) as never,
      current,
      { reps: 8, loadKg: 80, durationSeconds: null, rir: 1 },
      { now: START + MINUTE },
    );

    expect(readPreviousSets(db.db, ROUTINE, current).size).toBe(0);
  });

  it('ignores the sets of the previous session that were not themselves done', () => {
    // A pending row carries whatever was typed before it was abandoned. Showing
    // that as "what you did last time" would put a number nobody performed in
    // the column somebody is about to try to beat.
    const older = startFor(ROUTINE, START);
    saveTypedSet(
      db.db,
      firstSetOf(older) as never,
      older,
      { reps: 99, loadKg: 999, durationSeconds: null },
      { now: START + MINUTE },
    );
    finishSession(db.db, older, { now: START + 2 * MINUTE });

    const current = startFor(ROUTINE, START + DAY);

    expect(readPreviousSets(db.db, ROUTINE, current).size).toBe(0);
  });

  it('has nothing to say about a free session', () => {
    const older = startFor(ROUTINE, START);
    finishWith(older, 60, 8, 3, START + MINUTE);

    const free = startFor(null, START + DAY);

    expect(readPreviousSets(db.db, null, free).size).toBe(0);
  });

  it('SURVIVES an exercise deleted and recreated, on the frozen name', () => {
    /**
     * THE CASE THAT DECIDED THE LOOKUP RULE, and the first version got it wrong.
     *
     * Deleting an exercise nulls its id on every set that ever used it (D5/R4)
     * and removes it from the routines. Somebody who deletes a squat and adds
     * it back gets a NEW id — so an id-only match would show a blank column for
     * work they actually did, which reads as a defect rather than as a
     * consequence.
     *
     * The frozen name is what bridges the two, and previousFor is the single
     * place that rule lives.
     */
    const older = startFor(ROUTINE, START);
    finishWith(older, 60, 8, 3, START + MINUTE);

    const before = readSession(db.db, older)?.blocks[0]?.sets[0];
    const name = before?.exerciseName ?? '';
    deleteExercise(db.db, before?.exerciseId as never);

    // Re-created under the same name, which is what somebody correcting a
    // mistaken deletion does.
    sharedExercise = createExercise(db.db, {
      ...emptyExerciseDraft(2.5),
      name,
      primaryMuscle: 'chest',
    });
    const current = startFor(ROUTINE, START + DAY);
    const set = readSession(db.db, current)?.blocks[0]?.sets[0];

    const found = previousFor(readPreviousSets(db.db, ROUTINE, current), {
      exerciseId: set?.exerciseId ?? null,
      exerciseName: set?.exerciseName ?? '',
      setIndex: set?.setIndex ?? 1,
    });

    expect(found?.loadKg).toBe(60);
    expect(found?.rir).toBe(3);
  });

  it('matches on the id when there is one, which is the ordinary case', () => {
    const older = startFor(ROUTINE, START);
    finishWith(older, 60, 8, 3, START + MINUTE);

    const current = startFor(ROUTINE, START + DAY);
    const set = readSession(db.db, current)?.blocks[0]?.sets[0];

    const found = previousFor(readPreviousSets(db.db, ROUTINE, current), {
      exerciseId: set?.exerciseId ?? null,
      exerciseName: set?.exerciseName ?? '',
      setIndex: set?.setIndex ?? 1,
    });

    expect(found?.loadKg).toBe(60);
  });

  it('gives nothing for a set with no history, rather than somebody else s', () => {
    const older = startFor(ROUTINE, START);
    finishWith(older, 60, 8, 3, START + MINUTE);

    const current = startFor(ROUTINE, START + DAY);
    const set = readSession(db.db, current)?.blocks[0]?.sets[0];

    // Round two of the same exercise: the previous session only did round one.
    const found = previousFor(readPreviousSets(db.db, ROUTINE, current), {
      exerciseId: set?.exerciseId ?? null,
      exerciseName: set?.exerciseName ?? '',
      setIndex: 2,
    });

    expect(found).toBeNull();
  });
});

describe('changing the kind of a set mid-session', () => {
  it('writes the type and leaves everything else alone', () => {
    /**
     * Not cosmetic: specs 10.1 counts volume on WORKING sets only and specs
     * 10.4 reads "toutes les séries de travail" to decide a progression. A
     * warm-up recorded as work inflates both, quietly and for ever.
     */
    const id = start(planWith(anExercise()));
    const setId = firstSetOf(id);
    completeSet(
      db.db,
      setId as never,
      id,
      { reps: 8, loadKg: 60, durationSeconds: null, rir: 2 },
      { now: START + MINUTE },
    );

    setSetType(db.db, setId as never, id, 'warmup', { now: START + 2 * MINUTE });

    const set = readSession(db.db, id)?.blocks[0]?.sets[0];
    expect(set?.setType).toBe('warmup');
    expect(set?.status).toBe('done');
    expect(set?.actualLoadKg).toBe(60);
  });
});
