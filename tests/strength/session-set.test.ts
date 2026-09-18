import { describe, expect, it } from 'vitest';
import type { SetTarget, TypedSet } from '../../src/features/strength/domain/session-set';
import {
  RIR_CHOICES,
  countsTowardsVolume,
  fixedReps,
  isFixedReps,
  needsReps,
  recordSet,
} from '../../src/features/strength/domain/session-set';

/**
 * What validating a set records (specs 10.3).
 *
 * The whole point of this module is one decision — what an untouched field
 * means — and it is the decision that can produce a plausible, wrong number.
 */

function target(overrides: Partial<SetTarget> = {}): SetTarget {
  return {
    setType: 'work',
    repsMin: 8,
    repsMax: 8,
    loadKg: 72.5,
    rir: 2,
    durationSeconds: null,
    ...overrides,
  };
}

const nothingTyped: TypedSet = { reps: null, loadKg: null, durationSeconds: null };

describe('a fixed target fills itself', () => {
  it('records what was prescribed when nothing was touched', () => {
    /**
     * A set left alone and then validated is a set performed AS PRESCRIBED —
     * that is what "texte indicatif" means to the person tapping. Recording
     * nulls instead would store "something happened, we do not know what" on
     * the most common path there is, and the volume of specs 10.1 would miss
     * it silently.
     */
    expect(recordSet(target(), nothingTyped, 2)).toEqual({
      reps: 8,
      loadKg: 72.5,
      durationSeconds: null,
      rir: 2,
    });
  });

  it('lets what was typed win over what was prescribed', () => {
    expect(recordSet(target(), { reps: 6, loadKg: 70, durationSeconds: null }, 1)).toEqual({
      reps: 6,
      loadKg: 70,
      durationSeconds: null,
      rir: 1,
    });
  });

  it('treats one end of a range as fixed', () => {
    // "8 reps minimum" and "8 reps" are the same instruction to somebody under
    // a bar; there is exactly one number either way.
    expect(isFixedReps(target({ repsMax: null }))).toBe(true);
    expect(fixedReps(target({ repsMax: null }))).toBe(8);
    expect(isFixedReps(target({ repsMin: null }))).toBe(true);
    expect(fixedReps(target({ repsMin: null }))).toBe(8);
  });
});

describe('a range does NOT fill itself, and that is the decision', () => {
  it('asks for the repetitions before a RIR can validate the set', () => {
    expect(needsReps(target({ repsMin: 6, repsMax: 8 }), nothingTyped)).toBe(true);
  });

  it('stops asking once they are typed', () => {
    expect(
      needsReps(target({ repsMin: 6, repsMax: 8 }), { reps: 7, loadKg: null, durationSeconds: null }),
    ).toBe(false);
  });

  it('NEVER GUESSES THE TOP OF THE RANGE', () => {
    /**
     * THE ASSERTION THAT GUARDS THE PLAUSIBLE, WRONG NUMBER.
     *
     * Filling a range with its top is the tempting default — it is what "did
     * the set as written" feels like — and specs 10.4 makes it the one value
     * that must not be guessed:
     *
     * > Condition : sur la séance la plus récente comportant cet exercice,
     * > toutes les séries de travail ont atteint le haut de la plage.
     *
     * So auto-filling the top proposes a heavier load next week because
     * somebody tapped a RIR. Nobody said they hit eight. Slice 12 reads this
     * column, which is why the test is here and not there.
     *
     * The bottom is the mirror image and equally refused: it under-reports the
     * volume of specs 10.1 for the same non-reason.
     */
    const ranged = target({ repsMin: 6, repsMax: 8 });

    expect(recordSet(ranged, nothingTyped, 2).reps).toBeNull();
    expect(recordSet(ranged, nothingTyped, 2).reps).not.toBe(8);
    expect(recordSet(ranged, nothingTyped, 2).reps).not.toBe(6);
  });

  it('still fills the load, which has only one answer', () => {
    // The asymmetry is not laziness: a target load IS one number, so there is
    // nothing to choose between.
    expect(recordSet(target({ repsMin: 6, repsMax: 8 }), nothingTyped, 2).loadKg).toBe(72.5);
  });
});

describe('a set with no target at all', () => {
  it('asks for its repetitions, having nothing to fall back to', () => {
    // An exercise added live (specs 10.3) prescribes nothing.
    const free = target({ repsMin: null, repsMax: null, loadKg: null });

    expect(needsReps(free, nothingTyped)).toBe(true);
    expect(recordSet(free, nothingTyped, 3)).toEqual({
      reps: null,
      loadKg: null,
      durationSeconds: null,
      rir: 3,
    });
  });
});

describe('an exercise measured in time', () => {
  it('is answered by its duration and never asks for repetitions', () => {
    const plank = target({ repsMin: null, repsMax: null, loadKg: null, durationSeconds: 45 });

    expect(needsReps(plank, nothingTyped)).toBe(false);
    expect(recordSet(plank, nothingTyped, 1)).toEqual({
      reps: null,
      loadKg: null,
      durationSeconds: 45,
      rir: 1,
    });
  });

  it('records what was actually held', () => {
    const plank = target({ repsMin: null, repsMax: null, loadKg: null, durationSeconds: 45 });

    expect(recordSet(plank, { reps: null, loadKg: null, durationSeconds: 52 }, 0)).toEqual({
      reps: null,
      loadKg: null,
      durationSeconds: 52,
      rir: 0,
    });
  });
});

describe('the RIR scale of specs 10.3', () => {
  it('offers exactly the eight values the specification lists', () => {
    expect([...RIR_CHOICES]).toEqual([0, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
  });
});

describe('what counts towards the volume of specs 10.1', () => {
  it('counts a validated working set and nothing else', () => {
    /**
     * > charge × répétitions, sur les séries de travail validées uniquement.
     *
     * A POSITIVE clause, which is exactly why neither set_type nor
     * session_set.status carries a CHECK: a value this build does not know is
     * simply not counted, instead of silently joining a total whose definition
     * excludes it.
     */
    expect(countsTowardsVolume('work', 'done')).toBe(true);
    expect(countsTowardsVolume('warmup', 'done')).toBe(false);
    expect(countsTowardsVolume('work', 'pending')).toBe(false);
    expect(countsTowardsVolume('work', 'skipped')).toBe(false);
  });

  it('excludes a kind nobody has defined a volume rule for', () => {
    // The half that says the missing CHECK is safe rather than forgotten.
    expect(countsTowardsVolume('amrap', 'done')).toBe(false);
    expect(countsTowardsVolume('work', 'abandoned')).toBe(false);
  });
});
