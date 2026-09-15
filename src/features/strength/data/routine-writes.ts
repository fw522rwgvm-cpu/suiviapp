import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import {
  routine,
  routineBlock,
  routineLine,
  routineWarmupStep,
  type RoutineBlockId,
  type RoutineId,
  type RoutineLineId,
  type RoutineWarmupStepId,
} from '@/core/db/schema';
import {
  isValidRoutineDraft,
  restForLine,
  setIndexOf,
  validateRoutineDraft,
  type RoutineDraft,
} from '../domain/routine-draft';

/**
 * Writes on the routines (specs 10.2), transactional by rule.
 *
 * ## THE CONTENTS ARE REPLACED WHOLESALE, NEVER RECONCILED
 *
 * food_portion's rule, and the one that decided it transfers with more force
 * here. Reconciling would mean matching stored blocks and lines against the
 * draft's, moving positions, and doing it in an order no collision survives —
 * machinery in service of identifiers NOTHING references. A routine line is
 * pointed at by nobody: slice 11's session_set copies its targets rather than
 * linking to it, precisely because a session is history and a routine is not.
 *
 * So: delete the blocks (their lines cascade), delete the warm-up steps, and
 * write the draft. Inside one transaction, so a failure leaves the previous
 * routine exactly as it was.
 *
 * ## POSITIONS COME FROM ARRAY ORDER, AND FROM NOWHERE ELSE
 *
 * The draft carries no position — an array already has one, and two sources for
 * an order is how a list ends up disagreeing with itself. set_index likewise is
 * computed by setIndexOf at write time rather than stored in the draft: it is a
 * function of the order (D9).
 */

function requireValid(draft: RoutineDraft): void {
  if (!isValidRoutineDraft(draft)) {
    // A programming error rather than an expected state: the editor refuses to
    // submit an invalid draft. Expected problems are VALUES.
    throw new Error(
      `invalid routine draft: ${validateRoutineDraft(draft)
        .map((p) => p.kind)
        .join(', ')}`,
    );
  }
}

/**
 * Writes the draft's contents under a routine that already exists.
 *
 * THE REST IS RESOLVED HERE THROUGH restForLine, so what is stored is what the
 * screen showed. A superset writes its rest on the block and NULL on its lines;
 * a single-exercise block writes NULL on the block and the rest on each line.
 * Storing both would leave two numbers and no rule saying which won — the exact
 * shape this project refuses everywhere else.
 */
function writeContents(tx: AppDatabase, routineId: RoutineId, draft: RoutineDraft): void {
  const steps = draft.warmupSteps
    .map((text) => text.trim())
    // A blank line is a line somebody started and abandoned, not a step.
    .filter((text) => text !== '');

  if (steps.length > 0) {
    tx.insert(routineWarmupStep)
      .values(
        steps.map((text, position) => ({
          id: newId<RoutineWarmupStepId>(),
          routineId,
          position,
          text,
        })),
      )
      .run();
  }

  draft.blocks.forEach((block, blockPosition) => {
    const blockId = newId<RoutineBlockId>();
    const superset = new Set(block.lines.map((line) => line.exerciseId)).size > 1;

    tx.insert(routineBlock)
      .values({
        id: blockId,
        routineId,
        position: blockPosition,
        // Only a superset carries one. A single-exercise block storing a rest
        // it does not use would be a value nothing reads and a reader would
        // have to work out why.
        restSeconds: superset ? block.restSeconds : null,
      })
      .run();

    const rows = block.lines.map((line, linePosition) => ({
      id: newId<RoutineLineId>(),
      blockId,
      exerciseId: line.exerciseId,
      position: linePosition,
      setIndex: setIndexOf(block, linePosition),
      setType: line.setType,
      repsMin: line.repsMin,
      repsMax: line.repsMax,
      targetLoadKg: line.targetLoadKg,
      targetRir: line.targetRir,
      // The block's rest wins on a superset, so the line stores none; otherwise
      // the line keeps its own. restForLine is the one place that decides.
      restSeconds: superset ? null : restForLine(block, line),
      progressionEnabled: line.progressionEnabled ? (1 as const) : (0 as const),
      note: line.note.trim() === '' ? null : line.note.trim(),
    }));

    if (rows.length > 0) tx.insert(routineLine).values(rows).run();
  });
}

export function createRoutine(db: AppDatabase, draft: RoutineDraft): RoutineId {
  requireValid(draft);

  return db.transaction((tx) => {
    const id = newId<RoutineId>();
    const now = Date.now();

    tx.insert(routine).values({ id, name: draft.name.trim(), createdAt: now, updatedAt: now }).run();
    writeContents(tx, id, draft);

    return id;
  });
}

export function updateRoutine(
  db: AppDatabase,
  routineId: RoutineId,
  draft: RoutineDraft,
): void {
  requireValid(draft);

  db.transaction((tx) => {
    tx.update(routine)
      .set({ name: draft.name.trim(), updatedAt: Date.now() })
      .where(eq(routine.id, routineId))
      .run();

    // The lines go with their blocks, by cascade. Two deletes, not three.
    tx.delete(routineBlock).where(eq(routineBlock.routineId, routineId)).run();
    tx.delete(routineWarmupStep).where(eq(routineWarmupStep.routineId, routineId)).run();

    writeContents(tx, routineId, draft);
  });
}

/**
 * Deletes a routine (specs 10.2, "Boutons de démarrage, d'édition, de
 * suppression").
 *
 * NOTHING HAS TO BE CLEANED UP HERE, unlike deleteExercise. Every child of a
 * routine cascades — steps, blocks, and the lines under the blocks — because
 * each is owned by it and has no meaning apart from it. The exercises the lines
 * pointed at are untouched, which is the whole reason that link is a reference
 * rather than ownership.
 */
export function deleteRoutine(db: AppDatabase, routineId: RoutineId): void {
  db.delete(routine).where(eq(routine.id, routineId)).run();
}
