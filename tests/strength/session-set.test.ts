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

describe('a range FILLS ITSELF with its top, which reverses slice 11', () => {
  it('does not ask for the repetitions any more', () => {
    expect(needsReps(target({ repsMin: 6, repsMax: 8 }), nothingTyped)).toBe(false);
  });

  it('RECORDS THE TOP OF THE RANGE, and this test used to assert the opposite', () => {
    /**
     * THE REVERSAL, WITH ITS PRICE WRITTEN NEXT TO IT.
     *
     * This assertion read "NEVER GUESSES THE TOP OF THE RANGE", and the
     * reasoning was sound: specs 10.4 fires the progression suggestion when
     *
     * > toutes les séries de travail ont atteint le haut de la plage
     *
     * so filling the top proposes a heavier load next week because somebody
     * validated a set without saying they hit eight.
     *
     * Requested reversed (specs 14.39). **The consequence is accepted, not
     * argued away: a range left untouched will now propose a progression.**
     * The trade is which case pays — doing the set as written is the common
     * one, and it used to cost a tap on every set of every session; falling
     * short is the rare one, and it is already where you reach for the field.
     *
     * Slice 12 reads this column, which is why the test lives here rather than
     * there: it is the one place that can say what the column will contain.
     */
    const ranged = target({ repsMin: 6, repsMax: 8 });

    expect(recordSet(ranged, nothingTyped, 2).reps).toBe(8);
  });

  it('records what was typed when it was typed, top or not', () => {
    // The field still wins. The default is what happens when nobody said
    // anything, never a value that overrides somebody who did.
    const ranged = target({ repsMin: 6, repsMax: 8 });

    expect(recordSet(ranged, { reps: 6, loadKg: null, durationSeconds: null }, 2).reps).toBe(6);
  });

  it('answers one open end with the number it states', () => {
    // "8 minimum" and "8 maximum" are the same instruction to somebody standing
    // under a bar, and both record eight.
    expect(recordSet(target({ repsMax: null }), nothingTyped, 2).reps).toBe(8);
    expect(recordSet(target({ repsMin: null }), nothingTyped, 2).reps).toBe(8);
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
