import { asc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { toEntityId } from '@/core/id';
import {
  exercise,
  exerciseSecondaryMuscle,
  routine,
  routineBlock,
  routineLine,
  routineWarmupStep,
  type ExerciseId,
  type Muscle,
  type RoutineId,
  type SetType,
} from '@/core/db/schema';
import type { BlockDraft, LineDraft, RoutineDraft } from '../domain/routine-draft';
import { isSetType } from '../domain/vocabulary';

/**
 * Reads on the routines (specs 10.2).
 *
 * ## FOUR QUERIES FOR A WHOLE ROUTINE, NEVER ONE PER BLOCK
 *
 * A routine is four tables deep — routine, its warm-up steps, its blocks, their
 * lines — and the naive shape is a query per block and another per line. The
 * trap slice 4 named: a per-row cost capped at twenty is fine, the same cost
 * over a real routine is dozens of queries on a screen budgeted in tenths of a
 * second.
 *
 * So each level is read whole and joined in memory by id. A routine of eight
 * blocks costs exactly what a routine of one does.
 */

export interface RoutineListItem {
  id: RoutineId;
  name: string;
  /** How many sets it holds, which is the one figure a list row can carry. */
  setCount: number;
  /** Distinct exercises, for the second line. */
  exerciseCount: number;
}

export interface RoutineLineView {
  id: string;
  /**
   * Narrowed HERE, once, rather than by every reader.
   *
   * The value comes off a column, so it is outside data — and conventions
   * section 4 refuses to type outside data by assertion. Narrowing it at the
   * single point where it enters the application means no screen has to, and
   * the one place that can be wrong is the one place that checks.
   */
  exerciseId: ExerciseId;
  exerciseName: string;
  /** set_type carries no CHECK, so an unknown value reads as a working set. */
  setType: SetType;
  repsMin: number | null;
  repsMax: number | null;
  targetLoadKg: number | null;
  targetRir: number | null;
  restSeconds: number | null;
  progressionEnabled: 0 | 1;
  note: string | null;
}

export interface RoutineBlockView {
  id: string;
  restSeconds: number | null;
  lines: RoutineLineView[];
}

export interface RoutineView {
  id: RoutineId;
  name: string;
  warmupSteps: string[];
  blocks: RoutineBlockView[];
  /** Every muscle worked, primary and secondary, for the body map. */
  muscles: Muscle[];
}

/**
 * The routines, with the two figures a list row states.
 *
 * COUNTED IN SQL rather than by reading every line: this is the list screen,
 * and it must not pay for the contents of routines nobody has opened.
 */
export function listRoutines(db: AppDatabase): RoutineListItem[] {
  const counts = new Map<string, { sets: number; exercises: Set<string> }>();
  for (const row of db
    .select({
      routineId: routineBlock.routineId,
      exerciseId: routineLine.exerciseId,
    })
    .from(routineLine)
    .innerJoin(routineBlock, eq(routineLine.blockId, routineBlock.id))
    .all()) {
    const current = counts.get(row.routineId) ?? { sets: 0, exercises: new Set<string>() };
    current.sets += 1;
    current.exercises.add(row.exerciseId);
    counts.set(row.routineId, current);
  }

  return db
    .select({ id: routine.id, name: routine.name })
    .from(routine)
    .orderBy(asc(sql`${routine.name} COLLATE NOCASE`))
    .all()
    .map((row) => {
      const count = counts.get(row.id);
      return {
        id: row.id,
        name: row.name,
        setCount: count?.sets ?? 0,
        exerciseCount: count?.exercises.size ?? 0,
      };
    });
}

export function readRoutine(db: AppDatabase, routineId: RoutineId): RoutineView | null {
  const rows = db.select().from(routine).where(eq(routine.id, routineId)).all();
  const head = rows[0];
  if (head === undefined) return null;

  const warmupSteps = db
    .select({ text: routineWarmupStep.text })
    .from(routineWarmupStep)
    .where(eq(routineWarmupStep.routineId, routineId))
    .orderBy(asc(routineWarmupStep.position))
    .all()
    .map((row) => row.text);

  const blocks = db
    .select({ id: routineBlock.id, restSeconds: routineBlock.restSeconds })
    .from(routineBlock)
    .where(eq(routineBlock.routineId, routineId))
    .orderBy(asc(routineBlock.position))
    .all();

  /**
   * The lines of every block of this routine, in one query, joined back to the
   * exercise for its name.
   *
   * The name is read LIVE rather than frozen, and that is specs 5.3's
   * distinction: a routine is a living object, so renaming an exercise renames
   * it here. Freezing starts in slice 11, where session_set keeps
   * exercise_name_frozen precisely because a session IS history.
   */
  const lines = db
    .select({
      id: routineLine.id,
      blockId: routineLine.blockId,
      exerciseId: routineLine.exerciseId,
      exerciseName: exercise.name,
      setType: routineLine.setType,
      repsMin: routineLine.repsMin,
      repsMax: routineLine.repsMax,
      targetLoadKg: routineLine.targetLoadKg,
      targetRir: routineLine.targetRir,
      restSeconds: routineLine.restSeconds,
      progressionEnabled: routineLine.progressionEnabled,
      note: routineLine.note,
      position: routineLine.position,
    })
    .from(routineLine)
    .innerJoin(routineBlock, eq(routineLine.blockId, routineBlock.id))
    .innerJoin(exercise, eq(routineLine.exerciseId, exercise.id))
    .where(eq(routineBlock.routineId, routineId))
    .orderBy(asc(routineLine.position))
    .all();

  const byBlock = new Map<string, RoutineLineView[]>();
  for (const line of lines) {
    const current = byBlock.get(line.blockId);
    const view: RoutineLineView = {
      id: line.id,
      exerciseId: toExerciseId(line.exerciseId),
      exerciseName: line.exerciseName,
      setType: toSetType(line.setType),
      repsMin: line.repsMin,
      repsMax: line.repsMax,
      targetLoadKg: line.targetLoadKg,
      targetRir: line.targetRir,
      restSeconds: line.restSeconds,
      progressionEnabled: line.progressionEnabled,
      note: line.note,
    };
    if (current === undefined) byBlock.set(line.blockId, [view]);
    else current.push(view);
  }

  return {
    id: head.id,
    name: head.name,
    warmupSteps,
    blocks: blocks.map((block) => ({
      id: block.id,
      restSeconds: block.restSeconds,
      lines: byBlock.get(block.id) ?? [],
    })),
    muscles: readRoutineMuscles(db, routineId),
  };
}

/**
 * Every muscle a routine works, primary and secondary (specs 10.2, the body
 * map).
 *
 * TWO QUERIES AND A UNION, not a walk over the blocks. The map does not care
 * which block a muscle came from or how many times — it lights or it does not —
 * so the shape of the routine is irrelevant here and reading it would be work
 * thrown away.
 *
 * Secondary muscles count. A bench press works the triceps, and a body map that
 * showed only primaries would tell someone their push routine misses them.
 */
export function readRoutineMuscles(db: AppDatabase, routineId: RoutineId): Muscle[] {
  const worked = new Set<Muscle>();

  for (const row of db
    .select({ muscle: exercise.primaryMuscle })
    .from(routineLine)
    .innerJoin(routineBlock, eq(routineLine.blockId, routineBlock.id))
    .innerJoin(exercise, eq(routineLine.exerciseId, exercise.id))
    .where(eq(routineBlock.routineId, routineId))
    .all()) {
    worked.add(row.muscle);
  }

  for (const row of db
    .select({ muscle: exerciseSecondaryMuscle.muscle })
    .from(routineLine)
    .innerJoin(routineBlock, eq(routineLine.blockId, routineBlock.id))
    .innerJoin(
      exerciseSecondaryMuscle,
      eq(routineLine.exerciseId, exerciseSecondaryMuscle.exerciseId),
    )
    .where(eq(routineBlock.routineId, routineId))
    .all()) {
    worked.add(row.muscle);
  }

  return [...worked];
}

/** A routine as a draft, for the editor. */
export function readRoutineDraft(db: AppDatabase, routineId: RoutineId): RoutineDraft | null {
  const view = readRoutine(db, routineId);
  if (view === null) return null;

  return {
    name: view.name,
    warmupSteps: view.warmupSteps,
    blocks: view.blocks.map(
      (block): BlockDraft => ({
        id: block.id,
        restSeconds: block.restSeconds,
        lines: block.lines.map(
          (line): LineDraft => ({
            id: line.id,
            exerciseId: line.exerciseId,
            exerciseName: line.exerciseName,
            setType: line.setType,
            repsMin: line.repsMin,
            repsMax: line.repsMax,
            targetLoadKg: line.targetLoadKg,
            targetRir: line.targetRir,
            restSeconds: line.restSeconds,
            progressionEnabled: line.progressionEnabled === 1,
            // A text field cannot hold absence: NULL becomes '' here and
            // nowhere earlier, which is slice 4's terminal exception.
            note: line.note ?? '',
          }),
        ),
      }),
    ),
  };
}

/**
 * The stored id, carried across without being asserted.
 *
 * A foreign key guarantees the row exists, so the value IS an exercise id — but
 * conventions section 4 refuses to type outside data by assertion, and the
 * branded type has a constructor for exactly this. An unparseable one would be
 * a row no version of this application wrote.
 */
function toExerciseId(value: string): ExerciseId {
  const parsed = toEntityId<ExerciseId>(value);
  if (parsed === null) throw new Error(`routine_line.exercise_id is not an identifier: ${value}`);
  return parsed;
}

/**
 * set_type carries NO CHECK, so a hand-repaired archive can hold anything.
 * An unknown value is carried through rather than corrected — the rule since
 * meal-kinds.ts — and the editor displays it as it stands.
 */
function toSetType(value: string): SetType {
  return isSetType(value) ? value : 'work';
}
