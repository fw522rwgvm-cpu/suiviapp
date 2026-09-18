import { eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import {
  exercise,
  exerciseSecondaryMuscle,
  routine,
  routineBlock,
  routineLine,
  sessionBlock,
  sessionSet,
  type ExerciseId,
  type Muscle,
} from '@/core/db/schema';
import {
  incrementOf,
  isValidExerciseDraft,
  validateExerciseDraft,
  type ExerciseDraft,
} from '../domain/exercise-draft';

/**
 * Writes on the exercise database (specs 10.1), transactional by rule.
 *
 * Plain functions taking the database as a parameter, like every write since
 * slice 1, so they run in Node against a real SQLite file (D15). Nothing here
 * imports a native module.
 *
 * Every one of these touches more than one table, which is exactly when
 * conventions section 4 requires a transaction: an exercise is a row plus its
 * secondary muscles, and deleting one reaches into two more tables still.
 */

function requireValid(draft: ExerciseDraft): void {
  if (!isValidExerciseDraft(draft)) {
    // A programming error rather than an expected state: the editor refuses to
    // submit an invalid draft, so reaching here means a caller skipped it.
    // Expected problems are VALUES, returned by validateExerciseDraft.
    throw new Error(
      `invalid exercise draft: ${validateExerciseDraft(draft)
        .map((p) => p.kind)
        .join(', ')}`,
    );
  }
}

function columnsOf(draft: ExerciseDraft) {
  const trimmedOrNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  return {
    name: draft.name.trim(),
    primaryMuscle: draft.primaryMuscle,
    equipment: draft.equipment,
    /**
     * An empty note is NULL, never an empty string.
     *
     * The same rule food.barcode carries, for a different reason: there is no
     * unique index here, so an empty string breaks nothing — it just makes
     * "has a note" two questions instead of one, and the screen that shows the
     * notes would render an empty section for a note nobody wrote.
     */
    noteExecution: trimmedOrNull(draft.noteExecution),
    noteSetup: trimmedOrNull(draft.noteSetup),
    noteBreathing: trimmedOrNull(draft.noteBreathing),
    noteMistakes: trimmedOrNull(draft.noteMistakes),
    incrementKg: incrementOf(draft),
    /**
     * WRITTEN HERE SINCE SLICE 11, AND THE OMISSION IS THE POINT.
     *
     * The column landed in `0009` and nothing ever projected it: read in four
     * places, written in none, so tracks_duration was 0 on every exercise that
     * has ever existed and the "Temps" column could not appear. Found the same
     * way slice 10 found duration_seconds one level down — by touching this
     * table, not by a screen failing, because the read returned the default the
     * write had never overridden and the round trip was coherent and wrong.
     */
    tracksDuration: draft.tracksDuration ? (1 as const) : (0 as const),
  };
}

/**
 * The secondary muscles, replaced WHOLESALE rather than reconciled.
 *
 * food_portion's rule, and the reasoning transfers exactly: the primary key is
 * (exercise_id, muscle), so any sequential update that swaps two muscles
 * collides with whichever it writes first. Reconciling would be machinery in
 * service of identifiers NOTHING references — a routine line points at the
 * exercise, never at one of its muscle rows.
 *
 * Delete-then-insert inside the caller's transaction, so a failure leaves the
 * previous set intact.
 */
function replaceSecondaryMuscles(
  tx: AppDatabase,
  exerciseId: ExerciseId,
  muscles: ReadonlySet<Muscle>,
): void {
  tx.delete(exerciseSecondaryMuscle)
    .where(eq(exerciseSecondaryMuscle.exerciseId, exerciseId))
    .run();

  const rows = [...muscles].map((muscle) => ({ exerciseId, muscle }));
  if (rows.length > 0) tx.insert(exerciseSecondaryMuscle).values(rows).run();
}

export function createExercise(db: AppDatabase, draft: ExerciseDraft): ExerciseId {
  requireValid(draft);

  return db.transaction((tx) => {
    const id = newId<ExerciseId>();
    const now = Date.now();

    tx.insert(exercise)
      .values({
        id,
        ...columnsOf(draft),
        isFavorite: draft.isFavorite ? (1 as const) : (0 as const),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    replaceSecondaryMuscles(tx, id, draft.secondaryMuscles);

    return id;
  });
}

/**
 * Corrects an exercise, without any time limit (specs 5.3).
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH: the increment already stored. It is
 * edited here like any other field, and the global setting is never re-read —
 * specs 6.3 makes the setting an initial value, and an edit is not a creation.
 *
 * Routine lines follow, because they hold no copy: a line points at the
 * exercise and reads its name and muscles live. That is the right behaviour
 * for a routine, which specs 5.3 classes as a living object rather than
 * history — the freezing starts in slice 11, with session_set.
 */
export function updateExercise(
  db: AppDatabase,
  exerciseId: ExerciseId,
  draft: ExerciseDraft,
): void {
  requireValid(draft);

  db.transaction((tx) => {
    tx.update(exercise)
      .set({
        ...columnsOf(draft),
        isFavorite: draft.isFavorite ? (1 as const) : (0 as const),
        updatedAt: Date.now(),
      })
      .where(eq(exercise.id, exerciseId))
      .run();
    replaceSecondaryMuscles(tx, exerciseId, draft.secondaryMuscles);
  });
}

/**
 * What deleting an exercise would destroy, counted BEFORE it is destroyed.
 *
 * Specs 5.3 asks for a warning "nommant explicitement ce qui sera perdu", and
 * naming means counting first. That is the whole reason routine_line.exercise_id
 * is NO ACTION rather than CASCADE: a cascade does this work silently, and the
 * warning would have to guess at what it had done.
 *
 * Returns the routines by name, because a count is not a name. "Utilisé par 2
 * routines" tells you less than "Haut du corps A, Full body" — the second lets
 * you decide without opening anything.
 */
export interface ExerciseUsage {
  /** Distinct routine names using this exercise, in alphabetical order. */
  routineNames: string[];
  /** How many routine lines will go, which is what actually disappears. */
  lineCount: number;
  /**
   * How many recorded sets lose their link to this exercise (slice 11).
   *
   * ## THE HALF SPECS 5.3 ASKED FOR AND SLICE 10 COULD NOT GIVE
   *
   * Specs 14.20 no 3 wrote that the warning mentions "ni séances, ni records,
   * ni graphiques" because they need session_set, "table de la tranche 11", and
   * announcing a loss that does not exist is worse than silence.
   *
   * That reason expires with this slice, and this is what it expires into. The
   * amendment is honoured rather than left to rot — a motive that has lapsed
   * and a sentence that never changes is exactly how a warning stops telling
   * the truth without anybody editing it.
   *
   * COUNTED, NOT NAMED, where the routines are named. The asymmetry is real:
   * routine names let you decide without opening anything, and "Séance du 14
   * septembre, séance du 9 septembre, ..." is a list that grows without bound
   * and identifies nothing — nobody recognises a workout by its date. What the
   * reader needs here is the SIZE of what breaks.
   */
  setCount: number;
  /** How many sessions those sets belong to, which is the unit of history. */
  sessionCount: number;
}

export function readExerciseUsage(db: AppDatabase, exerciseId: ExerciseId): ExerciseUsage {
  const rows = db
    .select({ routineId: routineBlock.routineId, lineId: routineLine.id })
    .from(routineLine)
    .innerJoin(routineBlock, eq(routineLine.blockId, routineBlock.id))
    .where(eq(routineLine.exerciseId, exerciseId))
    .all();

  /**
   * Read on ix_set_exercise, whose first caller this is — the index exists for
   * slice 12's per-exercise history and earns its keep a slice early.
   */
  const setRows = db
    .select({ sessionId: sessionBlock.sessionId })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .where(eq(sessionSet.exerciseId, exerciseId))
    .all();
  const setCount = setRows.length;
  const sessionCount = new Set(setRows.map((row) => row.sessionId)).size;

  if (rows.length === 0) return { routineNames: [], lineCount: 0, setCount, sessionCount };

  const routineIds = [...new Set(rows.map((row) => row.routineId))];
  const names = db
    .select({ name: routine.name })
    .from(routine)
    .where(inArray(routine.id, routineIds))
    .all()
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));

  return { routineNames: names, lineCount: rows.length, setCount, sessionCount };
}

/**
 * Deletes an exercise and everything that pointed at it (specs 5.3).
 *
 * ## THE FOREIGN KEY IS THE NET; THIS IS THE POLICY
 *
 * routine_line.exercise_id is NO ACTION, so SQLite would REFUSE this delete
 * while any line still references the exercise — and specs 5.3 says no
 * deletion is ever blocked. The precedent is deleteFood(), which freezes the
 * ingredients and then deletes, in one transaction.
 *
 * Nothing is frozen on the way out here, unlike an ingredient: a routine line
 * without its exercise says nothing at all, where an ingredient keeps its
 * macros and stays meaningful. So the lines go.
 *
 * ## THE SESSIONS ARE THE OPPOSITE CASE, AND THE SCHEMA SAYS SO IN TWO COLUMNS
 *
 * session_set.exercise_id is NO ACTION too, so this function would simply start
 * THROWING the day a session referenced the exercise — the defect this slice
 * had to find rather than meet. But the answer is not to delete those rows:
 * a session is HISTORY, and specs 5.3 promises history survives.
 *
 * exercise_id is nullable and exercise_name_frozen is NOT NULL, which is the
 * whole mechanism written into the table: the link dies, the name survives. So
 * the sets are UNLINKED, not removed, and a workout from two years ago still
 * says what was performed. D5/R4 calls this link "vivant" precisely so that it
 * can be cut.
 *
 * Done here rather than by ON DELETE SET NULL for the reason the routine lines
 * are done here: specs 5.3 wants a warning naming what will be lost, and to
 * name it the application must count it first. Having counted, it can cut what
 * it announced.
 *
 * exercise_note cascades and needs nothing: a note is advice for next time and
 * means nothing without the movement it is about.
 *
 * ## AND THE BLOCKS EMPTIED BY THAT GO TOO
 *
 * The consequence that is easy to miss: removing the last line of a block
 * leaves a block with no lines, which the routine page would render as an empty
 * row nobody can explain. Cleaned up in the same transaction, and only the
 * blocks this delete actually emptied — a block someone deliberately left empty
 * while building a routine is not this function's business.
 *
 * exercise_secondary_muscle needs nothing: its foreign key cascades.
 */
export function deleteExercise(db: AppDatabase, exerciseId: ExerciseId): void {
  db.transaction((tx) => {
    // History first: unlink, never delete. The name is already frozen on the
    // row, so nothing about what was performed is lost.
    tx
      .update(sessionSet)
      .set({ exerciseId: null })
      .where(eq(sessionSet.exerciseId, exerciseId))
      .run();

    const affectedBlocks = [
      ...new Set(
        tx
          .select({ blockId: routineLine.blockId })
          .from(routineLine)
          .where(eq(routineLine.exerciseId, exerciseId))
          .all()
          .map((row) => row.blockId),
      ),
    ];

    tx.delete(routineLine).where(eq(routineLine.exerciseId, exerciseId)).run();

    if (affectedBlocks.length > 0) {
      // The blocks among those that now hold no line at all. Read back rather
      // than inferred: a block may have held lines for two exercises.
      const stillFilled = new Set(
        tx
          .select({ blockId: routineLine.blockId })
          .from(routineLine)
          .where(inArray(routineLine.blockId, affectedBlocks))
          .all()
          .map((row) => row.blockId),
      );
      const emptied = affectedBlocks.filter((id) => !stillFilled.has(id));
      if (emptied.length > 0) {
        tx.delete(routineBlock).where(inArray(routineBlock.id, emptied)).run();
      }
    }

    tx.delete(exercise).where(eq(exercise.id, exerciseId)).run();
  });
}

/**
 * Marks or unmarks a favourite (specs 10.1, "Favoris en tête").
 *
 * Its own function rather than a round trip through the editor, on
 * setFoodFavorite's precedent: it is a one-tap action from a list, and loading
 * a whole draft to flip one flag would reopen the door to saving a stale copy
 * of everything else.
 */
export function setExerciseFavorite(
  db: AppDatabase,
  exerciseId: ExerciseId,
  isFavorite: boolean,
): void {
  db.update(exercise)
    .set({ isFavorite: isFavorite ? 1 : 0, updatedAt: Date.now() })
    .where(eq(exercise.id, exerciseId))
    .run();
}
