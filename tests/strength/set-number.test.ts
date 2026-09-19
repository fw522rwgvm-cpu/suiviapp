import { describe, expect, it } from 'vitest';
import { workSetNumbers } from '../../src/features/strength/domain/set-number';

/**
 * What number a set shows (specs 14.41).
 *
 * The rule is one sentence — only working sets count — and it is worth a module
 * of its own for one reason: TWO tables apply it. The routine page numbers the
 * sets you plan and the session page numbers the sets you do, and slice 10
 * settled that they must look the same ("présentation identique à la
 * création"). Two spellings of this would agree on the easy blocks and diverge
 * on a superset with a warm-up.
 */

describe('workSetNumbers', () => {
  it('does not let a warm-up consume the number 1', () => {
    // The request, in its own words: if the first set is a warm-up, the second
    // is number 1.
    const numbers = workSetNumbers([
      { key: 'squat', setType: 'warmup' },
      { key: 'squat', setType: 'work' },
      { key: 'squat', setType: 'work' },
    ]);

    expect(numbers).toEqual([null, 1, 2]);
  });

  it('numbers an ordinary block exactly as before', () => {
    // The common case must not move: a block with no warm-up is 1, 2, 3.
    const numbers = workSetNumbers([
      { key: 'squat', setType: 'work' },
      { key: 'squat', setType: 'work' },
      { key: 'squat', setType: 'work' },
    ]);

    expect(numbers).toEqual([1, 2, 3]);
  });

  it('skips a drop set and a long set in the middle of a block', () => {
    // All three exceptional kinds, not just the warm-up: each states its own
    // word, so none of them can hold a number.
    const numbers = workSetNumbers([
      { key: 'bench', setType: 'work' },
      { key: 'bench', setType: 'dropset' },
      { key: 'bench', setType: 'work' },
      { key: 'bench', setType: 'long' },
      { key: 'bench', setType: 'work' },
    ]);

    expect(numbers).toEqual([1, null, 2, null, 3]);
  });

  it('COUNTS EACH EXERCISE OF A SUPERSET ON ITS OWN', () => {
    /**
     * A superset alternates A, B, A, B — each exercise has its own first
     * working set, and the letter beside the number is what says which. Counting
     * across the block would call A's second set 3, which is the number of
     * nothing.
     */
    const numbers = workSetNumbers([
      { key: 'curl', setType: 'work' },
      { key: 'pushdown', setType: 'work' },
      { key: 'curl', setType: 'work' },
      { key: 'pushdown', setType: 'work' },
    ]);

    expect(numbers).toEqual([1, 1, 2, 2]);
  });

  it('keeps the two exercises of a superset apart when only one warms up', () => {
    const numbers = workSetNumbers([
      { key: 'curl', setType: 'warmup' },
      { key: 'pushdown', setType: 'work' },
      { key: 'curl', setType: 'work' },
      { key: 'pushdown', setType: 'work' },
    ]);

    expect(numbers).toEqual([null, 1, 1, 2]);
  });

  it('gives a block of nothing but warm-ups no numbers at all', () => {
    const numbers = workSetNumbers([
      { key: 'squat', setType: 'warmup' },
      { key: 'squat', setType: 'warmup' },
    ]);

    expect(numbers).toEqual([null, null]);
  });

  it('answers an empty block with an empty list', () => {
    expect(workSetNumbers([])).toEqual([]);
  });
});
