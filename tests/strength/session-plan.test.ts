import { describe, expect, it } from 'vitest';
import type { ExerciseId } from '../../src/core/db/schema';
import type {
  PlannableBlock,
  PlannableLine,
} from '../../src/features/strength/domain/session-plan';
import { emptyPlan, planFromRoutine } from '../../src/features/strength/domain/session-plan';
import {
  restForBlock,
  setIndexOf,
  type BlockDraft,
  type LineDraft,
} from '../../src/features/strength/domain/routine-draft';

/**
 * The snapshot a session takes of a routine (specs 5.2, 10.3).
 */

const A = 'exercise-a' as ExerciseId;
const B = 'exercise-b' as ExerciseId;

function line(exerciseId: ExerciseId, overrides: Partial<PlannableLine> = {}): PlannableLine {
  return {
    exerciseId,
    exerciseName: exerciseId === A ? 'Développé couché' : 'Rowing barre',
    setType: 'work',
    repsMin: 6,
    repsMax: 8,
    targetLoadKg: 60,
    targetRir: 2,
    durationSeconds: null,
    progressionEnabled: 1,
    restSeconds: null,
    tracksDuration: 0,
    ...overrides,
  };
}

/**
 * restForBlock takes the two fields it reads, so a PlannableBlock IS one.
 *
 * It used to need an adapter rebuilding a LineDraft, which was a second place
 * that knew what a block looks like. Widening the domain signature removed it —
 * and the point of the widening is that there is ONE rest resolution, so a
 * session and the routine it came from can never prescribe different rests.
 */
const rest = restForBlock;

describe('a routine becomes a session', () => {
  it('copies the targets a set was prescribed', () => {
    const plan = planFromRoutine('Haut du corps', [{ restSeconds: 120, lines: [line(A)] }], rest);

    expect(plan.routineName).toBe('Haut du corps');
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]?.restSeconds).toBe(120);
    expect(plan.blocks[0]?.sets[0]).toEqual({
      exerciseId: A,
      exerciseName: 'Développé couché',
      setIndex: 1,
      setType: 'work',
      targetRepsMin: 6,
      targetRepsMax: 8,
      targetLoadKg: 60,
      targetRir: 2,
      targetDurationSeconds: null,
      progressionEnabled: true,
    });
  });

  it('keeps a superset in the order it is performed', () => {
    /**
     * THE PAYOFF OF THE REVERSAL IN ARCHITECTURE 9.18 no 1.
     *
     * Slice 10 first stored a superset grouped by exercise — A,A,A then B,B,B —
     * and defended it with "la routine est une liste à LIRE, c'est la séance
     * qui décidera de l'ordre d'exécution". Had that stood, this function would
     * have had to re-derive an execution order the writer already knew, and a
     * routine page showing one order while the session performed another would
     * have been two answers to one question.
     *
     * So this test is not about the snapshot being faithful. It is about there
     * being nothing to decide.
     */
    const superset: PlannableBlock = {
      restSeconds: 90,
      lines: [line(A), line(B), line(A), line(B), line(A), line(B)],
    };

    const sets = planFromRoutine('Push', [superset], rest).blocks[0]?.sets ?? [];

    expect(sets.map((set) => set.exerciseId)).toEqual([A, B, A, B, A, B]);
    // And set_index is the ROUND: each exercise's own rank, so A's second set
    // and B's second set are the same round.
    expect(sets.map((set) => set.setIndex)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('numbers the rounds exactly as the routine editor does', () => {
    /**
     * TWO IMPLEMENTATIONS OF ONE QUESTION, HELD TOGETHER BY A TEST.
     *
     * setIndexOf works on a LineDraft array in the editor; this module derives
     * the same rank from what SQL gave back. They cannot share code — the
     * inputs are different shapes — so they are kept honest the way the two
     * prefill readings of slice 4 are: by comparing them on the same block.
     *
     * Letting them drift would renumber the rounds of a session against the
     * routine it came from, and both numberings would look perfectly plausible.
     */
    const lines = [line(A), line(B), line(A), line(B), line(A)];
    const asDraft: BlockDraft = {
      id: null,
      restSeconds: 90,
      lines: lines.map(
        (item): LineDraft => ({
          id: null,
          exerciseId: item.exerciseId,
          exerciseName: item.exerciseName,
          setType: item.setType,
          repsMin: item.repsMin,
          repsMax: item.repsMax,
          targetLoadKg: item.targetLoadKg,
          targetRir: item.targetRir,
          durationSeconds: item.durationSeconds,
          restSeconds: null,
          progressionEnabled: item.progressionEnabled === 1,
          note: '',
        }),
      ),
    };

    const planned = planFromRoutine('Push', [{ restSeconds: 90, lines }], rest).blocks[0]?.sets ?? [];

    expect(planned.map((set) => set.setIndex)).toEqual(
      lines.map((_, index) => setIndexOf(asDraft, index)),
    );
  });

  it('resolves the rest once, so the session never re-asks', () => {
    // A routine written by the first version of slice 10 states its rest on the
    // LINE. restForBlock reads it as a fallback, and the answer is what the
    // session stores — rows this application did not write are displayed, never
    // corrected, and never carried forward as a second question.
    const legacy: PlannableBlock = {
      restSeconds: null,
      lines: [line(A, { restSeconds: 150 })],
    };

    expect(planFromRoutine('X', [legacy], rest).blocks[0]?.restSeconds).toBe(150);
  });

  it('prefers the block over a line that also states one', () => {
    // The other side, and the invariant of specs 14.21 no 3: the block owns the
    // rest in every shape, so a line's value is a FALLBACK and never a rival.
    const both: PlannableBlock = {
      restSeconds: 90,
      lines: [line(A, { restSeconds: 150 })],
    };

    expect(planFromRoutine('X', [both], rest).blocks[0]?.restSeconds).toBe(90);
  });
});

describe('a duration target only survives if the exercise tracks duration', () => {
  it('carries the seconds of a timed exercise', () => {
    const plank = line(A, { tracksDuration: 1, durationSeconds: 45, repsMin: null, repsMax: null });

    expect(
      planFromRoutine('Core', [{ restSeconds: 60, lines: [plank] }], rest).blocks[0]?.sets[0]
        ?.targetDurationSeconds,
    ).toBe(45);
  });

  it('drops seconds left on a line whose exercise stopped tracking duration', () => {
    /**
     * The flag is on the EXERCISE, not on the line (specs 14.21 no 1), so a
     * duration on a line whose exercise no longer tracks time is stale data.
     * Carried into a session it would put a seconds field on a bench press —
     * and the routine page would not show it, so the two screens would
     * disagree about what the same line prescribes.
     */
    const stale = line(A, { tracksDuration: 0, durationSeconds: 45 });

    expect(
      planFromRoutine('X', [{ restSeconds: 60, lines: [stale] }], rest).blocks[0]?.sets[0]
        ?.targetDurationSeconds,
    ).toBeNull();
  });
});

describe('what does not become a session block', () => {
  it('drops a block with no lines', () => {
    // It would write no sets, so it would be a block nothing can render — the
    // unexplainable row deleteExercise cleans up on the routine side.
    const plan = planFromRoutine('X', [{ restSeconds: 90, lines: [] }, { restSeconds: null, lines: [line(A)] }], rest);

    expect(plan.blocks).toHaveLength(1);
  });

  it('starts from nothing at all', () => {
    // Specs 10.3 allows adding exercises live, so an empty session is a real
    // path — and it is why session.routine_id is nullable.
    expect(emptyPlan()).toEqual({ routineName: null, blocks: [] });
  });
});
