import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/id';
import type { ExerciseId } from '../../src/core/db/schema';
import { newLine } from '../../src/features/strength/domain/routine-draft';
import {
  blockTitle,
  repsText,
  restText,
  routineProblemText,
  setSummary,
} from '../../src/features/strength/domain/routine-text';

/**
 * How a routine reads (specs 10.2).
 *
 * The case that decides the shape is the INCOMPLETE set: a routine is built
 * over time, an exercise arrives with one empty set, and every row has to read
 * correctly at each stage of that.
 */

const EXERCISE = newId<ExerciseId>();

function line(over: Partial<ReturnType<typeof newLine>> = {}) {
  return { ...newLine(EXERCISE, 'Développé couché'), ...over };
}

describe('a set summarised in one line', () => {
  it('states only the facts that exist', () => {
    /**
     * Rendering "— kg" for a load nobody set would put a placeholder where a
     * fact goes, and a column of dashes reads as missing data rather than as
     * data not yet needed.
     */
    expect(setSummary(line({ repsMin: 6, repsMax: 8 }), null)).toBe('6-8 reps');
    expect(setSummary(line({ targetLoadKg: 60 }), null)).toBe('60 kg');
    expect(setSummary(line({ repsMin: 10, repsMax: 10, targetLoadKg: 60 }), 120)).toBe(
      '10 reps · 60 kg · 2 min',
    );
  });

  it('says so plainly when a set holds nothing yet', () => {
    // The state an exercise arrives in: one set, nothing filled.
    expect(setSummary(line(), null)).toBe('Série à définir');
  });

  it('carries the rest it is given, which the block may have decided', () => {
    // setSummary takes the rest rather than reading it, so restForLine stays
    // the one place that decides between the block's and the line's.
    expect(setSummary(line({ repsMin: 8, repsMax: 8 }), 90)).toContain('1 min 30');
  });

  it('writes a decimal load with a comma', () => {
    expect(setSummary(line({ targetLoadKg: 62.5 }), null)).toBe('62,5 kg');
    expect(setSummary(line({ targetRir: 1.5 }), null)).toBe('RIR 1,5');
  });
});

describe('a rep target', () => {
  it('reads a range, a fixed count, and each half-open form', () => {
    /**
     * A HALF-OPEN RANGE IS NOT AN ERROR — ck_line_reps allows one bound alone,
     * and both readings are things people write down. Collapsing either to a
     * fixed count would state a target nobody set.
     */
    expect(repsText(6, 8)).toBe('6-8 reps');
    expect(repsText(10, 10)).toBe('10 reps');
    expect(repsText(8, null)).toBe('8+ reps');
    expect(repsText(null, 12)).toBe('jusqu’à 12 reps');
    expect(repsText(null, null)).toBeNull();
  });
});

describe('a rest', () => {
  it('reads in the unit a gym timer is read in', () => {
    expect(restText(45)).toBe('45 s');
    expect(restText(90)).toBe('1 min 30');
    expect(restText(120)).toBe('2 min');
    expect(restText(0)).toBe('0 s');
  });

  it('drops the seconds on a round minute', () => {
    // "2 min", never "2 min 0".
    expect(restText(180)).toBe('3 min');
  });
});

describe('what a block is called', () => {
  it('names a superset and says nothing about an ordinary block', () => {
    /**
     * A superset is NAMED because it changes how the block is performed and
     * where its rest comes from, neither of which is visible from the rows. A
     * single-exercise block is the ordinary case: labelling it would leave the
     * exceptional one indistinguishable.
     */
    expect(blockTitle(['Développé couché', 'Rowing'])).toBe(
      'Superset · Développé couché + Rowing',
    );
    expect(blockTitle(['Développé couché'])).toBeNull();
    // Three sets of one exercise is not a superset, however many rows it has.
    expect(blockTitle(['Squat', 'Squat', 'Squat'])).toBeNull();
  });
});

describe('what a routine problem says', () => {
  it('names the field or the block, never a code', () => {
    expect(routineProblemText({ kind: 'name_missing' })).toContain('nom');
    expect(routineProblemText({ kind: 'no_blocks' })).toContain('exercice');
    expect(routineProblemText({ kind: 'empty_block', blockIndex: 0 })).toContain('bloc 1');
    expect(
      routineProblemText({ kind: 'reps_inverted', blockIndex: 1, lineIndex: 2 }),
    ).toContain('série 3');
  });

  it('numbers from one, because the reader counts from one', () => {
    expect(routineProblemText({ kind: 'empty_block', blockIndex: 2 })).toContain('bloc 3');
  });
});
