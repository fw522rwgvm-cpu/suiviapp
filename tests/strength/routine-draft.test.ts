import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/id';
import type { ExerciseId } from '../../src/core/db/schema';
import {
  addExerciseBlock,
  addExerciseToBlock,
  duplicateLine,
  emptyRoutineDraft,
  isSuperset,
  isValidRoutineDraft,
  musclesOfDraft,
  newLine,
  removeBlock,
  removeLine,
  restForBlock,
  setBlockRest,
  setIndexOf,
  updateLine,
  validateRoutineDraft,
  type BlockDraft,
  type RoutineDraft,
} from '../../src/features/strength/domain/routine-draft';

/**
 * Building a routine (specs 10.2).
 *
 * The rules worth pinning are the two the specification states in one clause
 * each and which decide everything else: what makes a block a superset, and
 * which of the two rest columns is in force.
 */

const BENCH = newId<ExerciseId>();
const ROW = newId<ExerciseId>();

/**
 * The block at an index, or a failure that names the index.
 *
 * Rather than indexing and asserting the result away: conventions section 4
 * refuses to type by assertion, and an assertion here would turn "the block is
 * missing" into a crash three lines later instead of a message saying which one
 * was expected.
 */
function blockAt(draft: RoutineDraft, index: number): BlockDraft {
  const block = draft.blocks[index];
  if (block === undefined) throw new Error(`no block at ${index}`);
  return block;
}

function withBench(): RoutineDraft {
  return addExerciseBlock({ ...emptyRoutineDraft(), name: 'Haut du corps' }, BENCH, 'Développé couché');
}

describe('what makes a block a superset', () => {
  it('needs two different exercises, not two sets', () => {
    /**
     * THE DISTINCTION THAT DECIDES THE REST. A block holding three sets of one
     * exercise is one exercise done three times, and its rest belongs to its
     * lines. Counting LINES would have made every multi-set block a superset
     * and silently moved its rest to the block — plausible, and wrong for every
     * ordinary exercise in the routine.
     */
    let draft = withBench();
    draft = duplicateLine(draft, 0, 0);
    draft = duplicateLine(draft, 0, 0);

    const block = blockAt(draft, 0);
    expect(block.lines).toHaveLength(3);
    expect(isSuperset(block)).toBe(false);

    draft = addExerciseToBlock(draft, 0, ROW, 'Rowing');
    expect(isSuperset(blockAt(draft, 0))).toBe(true);
  });

  it('is made by adding a second exercise, with no separate gesture', () => {
    // Specs 10.2 describes a superset as "plusieurs exercices dans un bloc" and
    // gives no creation gesture. So the block simply becomes one.
    const draft = addExerciseToBlock(withBench(), 0, ROW, 'Rowing');

    expect(isSuperset(blockAt(draft, 0))).toBe(true);
  });
});

describe('which rest is in force', () => {
  it('is the block\u2019s, in every shape', () => {
    /**
     * THE REST BELONGS TO THE BLOCK, superset or not. Slice 10 first read specs
     * 10.2 as "the superset owns it, the line owns it otherwise" — which was
     * wrong in practice: nobody rests differently between two sets of the same
     * exercise, and giving each row its own rest cost the row the width the
     * load, the reps and the RIR needed.
     *
     * A block holding one exercise IS that exercise, so "rest per block" and
     * "rest per exercise" are the same sentence.
     */
    let draft = withBench();
    draft = setBlockRest(draft, 0, 90);

    expect(restForBlock(blockAt(draft, 0))).toBe(90);

    draft = addExerciseToBlock(draft, 0, ROW, 'Rowing');
    expect(restForBlock(blockAt(draft, 0))).toBe(90);
  });

  it('falls back to a line that carries one, for an archive written before it moved', () => {
    /**
     * routine_line.rest_seconds is frozen in 0008 and nothing writes it any
     * more. A routine saved by the first version of this slice holds one, and
     * the rule since meal-kinds.ts is that rows this application did not write
     * are DISPLAYED, never corrected.
     */
    let draft = withBench();
    draft = updateLine(draft, 0, 0, { restSeconds: 60 });

    const block = blockAt(draft, 0);
    expect(block.restSeconds).toBeNull();
    expect(restForBlock(block)).toBe(60);
  });

  it('prefers the block over a line that still carries one', () => {
    // Both present is only reachable from an old archive that was then edited.
    // The block is what the screen showed, so the block wins.
    let draft = withBench();
    draft = updateLine(draft, 0, 0, { restSeconds: 60 });
    draft = setBlockRest(draft, 0, 120);

    expect(restForBlock(blockAt(draft, 0))).toBe(120);
  });

  it('is null when neither states one', () => {
    expect(restForBlock(blockAt(withBench(), 0))).toBeNull();
  });
});

describe('the set index of a line', () => {
  it('counts per exercise, not per block', () => {
    /**
     * A superset of A and B at three sets each: lines grouped by exercise,
     * positions 0..5, set indices 1,2,3,1,2,3. The routine is a list to be
     * READ; slice 11's session decides the order they are performed in.
     */
    let draft = withBench();
    draft = duplicateLine(draft, 0, 0);
    draft = duplicateLine(draft, 0, 1);
    draft = addExerciseToBlock(draft, 0, ROW, 'Rowing');
    draft = duplicateLine(draft, 0, 3);
    draft = duplicateLine(draft, 0, 4);

    const block = blockAt(draft, 0);
    expect(block.lines.map((_, index) => setIndexOf(block, index))).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('is derived from the order rather than stored', () => {
    // Removing a set renumbers everything after it, with nothing to update.
    let draft = withBench();
    draft = duplicateLine(draft, 0, 0);
    draft = duplicateLine(draft, 0, 0);
    draft = removeLine(draft, 0, 0);

    const block = blockAt(draft, 0);
    expect(block.lines.map((_, index) => setIndexOf(block, index))).toEqual([1, 2]);
  });
});

describe('adding and removing', () => {
  it('adds an exercise as a block with ONE set', () => {
    // Specs 10.2: "l'exercice s'ajoute avec une série unique". One is the
    // smallest thing already correct — duplicating is a tap, deleting two
    // guesses is two swipes.
    const draft = withBench();

    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0]?.lines).toHaveLength(1);
  });

  it('duplicates a set directly after its original, keeping every target', () => {
    let draft = withBench();
    draft = updateLine(draft, 0, 0, { repsMin: 6, repsMax: 8, targetLoadKg: 60, note: 'Pause' });
    draft = duplicateLine(draft, 0, 0);

    const lines = (blockAt(draft, 0)).lines;
    expect(lines).toHaveLength(2);
    expect(lines[1]?.repsMin).toBe(6);
    expect(lines[1]?.targetLoadKg).toBe(60);
    expect(lines[1]?.note).toBe('Pause');
    // A new row, so no stored identity is carried over.
    expect(lines[1]?.id).toBeNull();
  });

  it('removes the block when its last set goes', () => {
    /**
     * A block with no lines is a row nobody can explain. deleteExercise cleans
     * up the same shape on the other path; the two agree rather than one
     * leaving work for the other.
     */
    const draft = removeLine(withBench(), 0, 0);

    expect(draft.blocks).toEqual([]);
  });

  it('keeps the block when one of several sets goes', () => {
    let draft = withBench();
    draft = duplicateLine(draft, 0, 0);
    draft = removeLine(draft, 0, 0);

    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0]?.lines).toHaveLength(1);
  });

  it('never mutates the draft it was given', () => {
    const before = withBench();
    const linesBefore = before.blocks[0]?.lines.length;

    duplicateLine(before, 0, 0);
    removeBlock(before, 0);
    updateLine(before, 0, 0, { note: 'changed' });

    expect(before.blocks[0]?.lines.length).toBe(linesBefore);
    expect(before.blocks[0]?.lines[0]?.note).toBe('');
  });

  it('ignores an index that does not exist rather than throwing', () => {
    const draft = withBench();

    expect(removeLine(draft, 9, 0)).toEqual(draft);
    expect(duplicateLine(draft, 0, 9)).toEqual(draft);
  });
});

describe('validating a routine', () => {
  it('accepts the smallest complete routine', () => {
    expect(validateRoutineDraft(withBench())).toEqual([]);
    expect(isValidRoutineDraft(withBench())).toBe(true);
  });

  it('refuses a routine with no name and no blocks', () => {
    const problems = validateRoutineDraft(emptyRoutineDraft()).map((p) => p.kind);

    expect(problems).toContain('name_missing');
    expect(problems).toContain('no_blocks');
  });

  it('refuses an inverted rep range, before ck_line_reps has to', () => {
    // Caught here so the form points at the set, rather than the write failing
    // with a constraint name on a screen full of sets.
    const draft = updateLine(withBench(), 0, 0, { repsMin: 12, repsMax: 8 });

    expect(validateRoutineDraft(draft)).toContainEqual({
      kind: 'reps_inverted',
      blockIndex: 0,
      lineIndex: 0,
    });
  });

  it('accepts a half-open range and a fixed count', () => {
    for (const range of [
      { repsMin: 8, repsMax: null },
      { repsMin: null, repsMax: 12 },
      { repsMin: 10, repsMax: 10 },
      { repsMin: null, repsMax: null },
    ]) {
      expect(validateRoutineDraft(updateLine(withBench(), 0, 0, range))).toEqual([]);
    }
  });

  it('names the block that is empty', () => {
    const draft: RoutineDraft = {
      name: 'Haut du corps',
      warmupSteps: [],
      blocks: [{ id: null, restSeconds: null, lines: [] }],
    };

    expect(validateRoutineDraft(draft)).toContainEqual({ kind: 'empty_block', blockIndex: 0 });
  });
});

describe('the muscles a routine works', () => {
  it('unions every line, counting an exercise once', () => {
    let draft = withBench();
    draft = duplicateLine(draft, 0, 0);
    draft = addExerciseToBlock(draft, 0, ROW, 'Rowing');

    const worked = musclesOfDraft(draft, (id) =>
      id === BENCH ? ['chest', 'triceps'] : ['lats', 'biceps'],
    );

    expect([...worked].sort()).toEqual(['biceps', 'chest', 'lats', 'triceps']);
  });

  it('is empty for a routine with no blocks', () => {
    expect(musclesOfDraft(emptyRoutineDraft(), () => ['chest']).size).toBe(0);
  });
});

describe('a new line', () => {
  it('defaults to a working set with nothing filled in', () => {
    // `travail` is the default specs 6.3 gives, and it is a fact about the FORM
    // rather than the table — which is why the column has no SQL default.
    const line = newLine(BENCH, 'Développé couché');

    expect(line.setType).toBe('work');
    expect(line.repsMin).toBeNull();
    expect(line.targetLoadKg).toBeNull();
    expect(line.progressionEnabled).toBe(false);
    expect(line.id).toBeNull();
  });
});
