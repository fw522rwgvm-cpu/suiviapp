import type { ExerciseId, SetType } from '@/core/db/schema';

/**
 * A routine being built or edited, and what makes it valid (specs 10.2).
 *
 * Pure: it knows neither the database nor React. The editor holds one of these
 * in state, this module says what is wrong with it and how to change it, and
 * routine-writes.ts turns a valid one into rows.
 *
 * ## THE SHAPE IS THE SPECIFICATION'S, NOT THE SCHEMA'S
 *
 * The tables are flat — routine_block, then routine_line pointing at a block.
 * A draft is NESTED, because that is what the editor manipulates: a block holds
 * its lines, and moving a block moves them. Flattening happens once, on the way
 * to SQL, where positions are assigned from array order.
 *
 * That also means NOTHING IN A DRAFT CARRIES A POSITION. An array already has
 * one, and two sources for an order is how a list ends up disagreeing with
 * itself — the defect shape this project has chased out of quantity prefill and
 * refused again in exercise.increment_kg.
 */

export interface LineDraft {
  /** Null for a line being added. Set for one already stored. */
  id: string | null;
  exerciseId: ExerciseId;
  /** Carried so the editor can show a name without a query per line. */
  exerciseName: string;
  setType: SetType;
  /** Null means "not stated". Both null is a set with no target range. */
  repsMin: number | null;
  repsMax: number | null;
  targetLoadKg: number | null;
  targetRir: number | null;
  /**
   * Seconds, for an exercise measured in duration (0009).
   *
   * Read INSTEAD of repsMin/repsMax, never alongside: which one applies is
   * decided by the EXERCISE's tracksDuration, so a block shows one column or
   * the other and never both.
   */
  durationSeconds: number | null;
  /**
   * NOTHING WRITES THIS ANY MORE. The block owns the rest in every shape; this
   * survives for archives written by the first version of slice 10, and
   * restForBlock reads it as a fallback.
   */
  restSeconds: number | null;
  progressionEnabled: boolean;
  note: string;
}

export interface BlockDraft {
  id: string | null;
  /**
   * The rest this block prescribes (specs 10.2), in every shape.
   *
   * > le temps de repos étant défini au niveau du superset
   *
   * The specification states it of a superset; it holds for a single-exercise
   * block too, because such a block IS its exercise. See restForBlock.
   */
  restSeconds: number | null;
  lines: LineDraft[];
}

export interface RoutineDraft {
  name: string;
  /** One step per line typed (specs 10.2). Blank lines are dropped on save. */
  warmupSteps: string[];
  blocks: BlockDraft[];
}

export type RoutineProblem =
  | { kind: 'name_missing' }
  | { kind: 'no_blocks' }
  | { kind: 'empty_block'; blockIndex: number }
  | { kind: 'reps_inverted'; blockIndex: number; lineIndex: number };

/**
 * Whether a block is a superset — which is the question everything else turns
 * on.
 *
 * TWO DISTINCT EXERCISES, not two lines. A block holding three sets of one
 * exercise is not a superset; it is one exercise done three times. Counting LINES
 * instead would have made every multi-set block a superset, which still
 * decides what the screen CALLS a block even now that the rest is always the
 * block's.
 */
export function isSuperset(block: BlockDraft): boolean {
  return new Set(block.lines.map((line) => line.exerciseId)).size > 1;
}

/**
 * The rest that applies to a block.
 *
 * ## THE REST BELONGS TO THE BLOCK, IN EVERY SHAPE
 *
 * Specs 10.2 only says it explicitly of a superset — "le temps de repos étant
 * défini au niveau du superset" — and slice 10 first read that as "the line
 * owns it otherwise". That was wrong in practice: nobody rests differently
 * between two sets of the same exercise, and giving each row its own rest cost
 * the row a column it needed for the load, the reps and the RIR.
 *
 * So the block owns it always. A block holding one exercise IS that exercise,
 * so "rest per block" and "rest per exercise" are the same sentence.
 *
 * `routine_line.rest_seconds` STAYS IN THE SCHEMA and is still read here as a
 * fallback. It is in section 2.6, it is frozen since 0008, and an archive
 * written by the first version of this slice can hold one. Nothing writes it
 * any more; a row that carries one is still shown rather than ignored — the
 * rule since meal-kinds.ts, that rows this application did not write are
 * displayed, never corrected.
 */
export function restForBlock(block: BlockDraft): number | null {
  if (block.restSeconds !== null) return block.restSeconds;
  // An archive from before the rest moved. First line that states one wins:
  // they were only ever written identically.
  return block.lines.find((line) => line.restSeconds !== null)?.restSeconds ?? null;
}

/**
 * The set index of a line: its rank FOR ITS EXERCISE within the block.
 *
 * Derived from the array rather than stored in the draft, because it is a
 * function of the order (D9) — a line moved or removed changes every index
 * after it, and a stored copy would need updating at four call sites.
 *
 * IN A SUPERSET THIS NUMBER IS THE ROUND. A and B at three sets each give
 * indices 1,2,3 for A and 1,2,3 for B, and A's second set and B's second set
 * are performed in the same round. That is what roundsOf groups on.
 */
export function setIndexOf(block: BlockDraft, lineIndex: number): number {
  const line = block.lines[lineIndex];
  if (line === undefined) return 1;
  let rank = 0;
  for (let i = 0; i <= lineIndex; i += 1) {
    if (block.lines[i]?.exerciseId === line.exerciseId) rank += 1;
  }
  return rank;
}

/** One line, with the index it sits at in `block.lines`. */
export interface RoundEntry {
  line: LineDraft;
  lineIndex: number;
}

/**
 * A block, read as ROUNDS rather than as a list of sets.
 *
 * ## A SUPERSET IS PERFORMED ALTERNATING, SO THAT IS HOW IT IS SHOWN
 *
 * The first version of slice 10 grouped a superset by exercise — A,A,A then
 * B,B,B — and defended it as "the routine is a list to be READ, the session
 * decides the order". That was wrong, and the sentence gave it away: a superset
 * has no other execution order than A,B,A,B,A,B, so a page that shows one and a
 * session that performs the other are two answers to one question. Now the
 * order shown IS the order performed, and `routine_line.position` is written in
 * it (architecture 9.15).
 *
 * ## THE ROUNDS ARE DERIVED, NOT A SECOND ORDER
 *
 * Nothing is stored to say which round a line is in: a line's round is its rank
 * for its own exercise, which setIndexOf already computes from the array. The
 * order WITHIN a round is the order the exercises first appear in the block.
 * One source, the array, as the module's opening rule requires.
 *
 * Free consequence: a routine stored by the first version, grouped by exercise,
 * reads as correct rounds without a migration — and is rewritten interleaved
 * the next time it is saved.
 *
 * A block whose exercises have unequal set counts gives short rounds at the
 * end, which is the honest rendering of what was typed rather than a padded
 * grid.
 */
export function roundsOf(block: BlockDraft): RoundEntry[][] {
  const order = exerciseOrder(block);
  const rounds: RoundEntry[][] = [];

  block.lines.forEach((line, lineIndex) => {
    const round = setIndexOf(block, lineIndex) - 1;
    while (rounds.length <= round) rounds.push([]);
    rounds[round]?.push({ line, lineIndex });
  });

  return rounds.map((round) =>
    [...round].sort(
      (a, b) => (order.get(a.line.exerciseId) ?? 0) - (order.get(b.line.exerciseId) ?? 0),
    ),
  );
}

/**
 * The distinct exercises of a block, in the order they first appear.
 *
 * What the block heading names, and what gives each one its letter in a
 * superset — the rows alternate, so a row has to say which exercise it is.
 */
export function exercisesOfBlock(
  block: BlockDraft,
): { exerciseId: ExerciseId; exerciseName: string }[] {
  const seen = new Map<string, { exerciseId: ExerciseId; exerciseName: string }>();
  for (const line of block.lines) {
    if (!seen.has(line.exerciseId)) {
      seen.set(line.exerciseId, { exerciseId: line.exerciseId, exerciseName: line.exerciseName });
    }
  }
  return [...seen.values()];
}

function exerciseOrder(block: BlockDraft): Map<string, number> {
  const order = new Map<string, number>();
  for (const line of block.lines) {
    if (!order.has(line.exerciseId)) order.set(line.exerciseId, order.size);
  }
  return order;
}

export function validateRoutineDraft(draft: RoutineDraft): RoutineProblem[] {
  const problems: RoutineProblem[] = [];

  if (draft.name.trim() === '') problems.push({ kind: 'name_missing' });

  const blocks = draft.blocks;
  if (blocks.length === 0) problems.push({ kind: 'no_blocks' });

  blocks.forEach((block, blockIndex) => {
    if (block.lines.length === 0) problems.push({ kind: 'empty_block', blockIndex });

    block.lines.forEach((line, lineIndex) => {
      // ck_line_reps refuses this in SQL too. Caught here so the form can point
      // at the set rather than the write failing with a constraint name.
      if (
        line.repsMin !== null &&
        line.repsMax !== null &&
        line.repsMin > line.repsMax
      ) {
        problems.push({ kind: 'reps_inverted', blockIndex, lineIndex });
      }
    });
  });

  return problems;
}

export function isValidRoutineDraft(draft: RoutineDraft): boolean {
  return validateRoutineDraft(draft).length === 0;
}

export function emptyRoutineDraft(): RoutineDraft {
  return { name: '', warmupSteps: [], blocks: [] };
}

/** A set with nothing filled in, which is what adding an exercise produces. */
export function newLine(exerciseId: ExerciseId, exerciseName: string): LineDraft {
  return {
    id: null,
    exerciseId,
    exerciseName,
    // Specs 6.3 makes `travail` the default, and it is a fact about the FORM
    // rather than about the table — which is why the column has no SQL default.
    setType: 'work',
    repsMin: null,
    repsMax: null,
    targetLoadKg: null,
    targetRir: null,
    durationSeconds: null,
    restSeconds: null,
    progressionEnabled: false,
    note: '',
  };
}

/**
 * Adding an exercise: a new block holding ONE set (specs 10.2).
 *
 * > l'exercice s'ajoute avec une série unique
 *
 * One set rather than three, because one is the smallest thing that is already
 * correct: duplicating it is a tap, and deleting two guesses is two swipes.
 */
export function addExerciseBlock(
  draft: RoutineDraft,
  exerciseId: ExerciseId,
  exerciseName: string,
): RoutineDraft {
  return {
    ...draft,
    blocks: [...draft.blocks, { id: null, restSeconds: null, lines: [newLine(exerciseId, exerciseName)] }],
  };
}

/**
 * Adding an exercise INTO an existing block, which is how a superset is made.
 *
 * Specs 10.2 describes a superset as "plusieurs exercices dans un bloc" and
 * gives no separate creation gesture, so this is it: the block becomes a
 * superset by holding a second exercise, and isSuperset says so from then on
 * without anything being flagged.
 */
export function addExerciseToBlock(
  draft: RoutineDraft,
  blockIndex: number,
  exerciseId: ExerciseId,
  exerciseName: string,
): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => ({
    ...block,
    lines: [...block.lines, newLine(exerciseId, exerciseName)],
  }));
}

/**
 * Duplicating ONE set, which is how a single line gets a twin.
 *
 * The copy keeps every target — the whole point is "the same again" — and drops
 * the stored id, because it is a new row. Inserted directly after its original,
 * which makes it the next set of that exercise and therefore the next round of
 * it; roundsOf places it.
 *
 * The screen's button is addRound, not this: in a superset, one more set of A
 * alone is an unbalanced block nobody asked for.
 */
export function duplicateLine(
  draft: RoutineDraft,
  blockIndex: number,
  lineIndex: number,
): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => {
    const line = block.lines[lineIndex];
    if (line === undefined) return block;
    const copy: LineDraft = { ...line, id: null };
    const lines = [...block.lines];
    lines.splice(lineIndex + 1, 0, copy);
    return { ...block, lines };
  });
}

/**
 * Adding a ROUND: one more set of every exercise in the block.
 *
 * This is what "Ajouter une série" does, and for an ordinary block it is
 * exactly that — one exercise, one more set. In a superset it is one more set
 * of each, because a superset is performed in rounds and half a round is not a
 * thing anyone trains.
 *
 * Each copy is taken from that exercise's LAST set, so the targets carried
 * forward are the ones most recently adjusted rather than the ones typed first.
 */
export function addRound(draft: RoutineDraft, blockIndex: number): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => {
    const last = new Map<string, LineDraft>();
    for (const line of block.lines) last.set(line.exerciseId, line);

    const copies: LineDraft[] = [];
    for (const { exerciseId } of exercisesOfBlock(block)) {
      const source = last.get(exerciseId);
      if (source !== undefined) copies.push({ ...source, id: null });
    }

    return { ...block, lines: [...block.lines, ...copies] };
  });
}

/**
 * Removing a set (specs 10.2, "Balayer une série vers la gauche la supprime").
 *
 * REMOVING THE LAST SET REMOVES ITS BLOCK. A block with no lines is a row
 * nobody can explain, and it is what deleteExercise cleans up on the other
 * path — the two agree rather than one of them leaving work for the other.
 */
export function removeLine(
  draft: RoutineDraft,
  blockIndex: number,
  lineIndex: number,
): RoutineDraft {
  const block = draft.blocks[blockIndex];
  if (block === undefined) return draft;

  const lines = block.lines.filter((_, index) => index !== lineIndex);
  if (lines.length === 0) {
    return { ...draft, blocks: draft.blocks.filter((_, index) => index !== blockIndex) };
  }
  return mapBlock(draft, blockIndex, (current) => ({ ...current, lines }));
}

export function removeBlock(draft: RoutineDraft, blockIndex: number): RoutineDraft {
  return { ...draft, blocks: draft.blocks.filter((_, index) => index !== blockIndex) };
}

export function updateLine(
  draft: RoutineDraft,
  blockIndex: number,
  lineIndex: number,
  change: Partial<LineDraft>,
): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => ({
    ...block,
    lines: block.lines.map((line, index) => (index === lineIndex ? { ...line, ...change } : line)),
  }));
}

/**
 * Whether the block's working sets carry the progression rule (specs 10.4).
 *
 * ## THE RULE MOVED TO THE BLOCK, THE COLUMN STAYED ON THE LINE
 *
 * It used to be an arrow at the end of a row, per line, as section 10.4
 * describes the column. Removing that arrow was asked for, and a switch nobody
 * can reach is worse than an arrow nobody presses — so the control went where
 * the rest already is. Nobody progresses the second set of an exercise and not
 * the third, and a block holding one exercise IS that exercise.
 *
 * `routine_line.progression_enabled` is untouched: still per line, still what
 * slice 12 reads. This is a reading of it, not a replacement.
 *
 * ON means every WORKING set has it. A warm-up or a drop set is deliberately
 * excluded — a warm-up that crept up by 2,5 kg a week stopped being one — so a
 * block whose only sets are warm-ups reads as off, which it is.
 */
export function blockProgression(block: BlockDraft): boolean {
  const work = block.lines.filter((line) => line.setType === 'work');
  return work.length > 0 && work.every((line) => line.progressionEnabled);
}

/** Applies the rule to every working set of the block, and to no other. */
export function setBlockProgression(
  draft: RoutineDraft,
  blockIndex: number,
  enabled: boolean,
): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => ({
    ...block,
    lines: block.lines.map((line) =>
      line.setType === 'work' ? { ...line, progressionEnabled: enabled } : line,
    ),
  }));
}

export function setBlockRest(
  draft: RoutineDraft,
  blockIndex: number,
  restSeconds: number | null,
): RoutineDraft {
  return mapBlock(draft, blockIndex, (block) => ({ ...block, restSeconds }));
}

/** Every muscle the routine works, for the body map (specs 10.2). */
export function musclesOfDraft(
  draft: RoutineDraft,
  musclesOf: (id: ExerciseId) => readonly string[],
): Set<string> {
  const worked = new Set<string>();
  for (const block of draft.blocks) {
    for (const line of block.lines) {
      for (const muscle of musclesOf(line.exerciseId)) worked.add(muscle);
    }
  }
  return worked;
}

function mapBlock(
  draft: RoutineDraft,
  blockIndex: number,
  change: (block: BlockDraft) => BlockDraft,
): RoutineDraft {
  return {
    ...draft,
    blocks: draft.blocks.map((block, index) => (index === blockIndex ? change(block) : block)),
  };
}
