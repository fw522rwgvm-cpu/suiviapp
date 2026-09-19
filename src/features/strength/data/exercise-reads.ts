import { asc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import {
  exercise,
  exerciseSecondaryMuscle,
  type Equipment,
  type ExerciseId,
  type Muscle,
} from '@/core/db/schema';
import { formatIncrement, type ExerciseDraft } from '../domain/exercise-draft';
import type { SearchableExercise } from '../domain/exercise-search';

/**
 * Reads on the exercise database (specs 10.1).
 *
 * Pure functions taking the database as a parameter, like every read since
 * slice 1: they run in Node against a real SQLite file, and they import no
 * native module.
 *
 * ## ONE QUERY, CACHED, AND THEN SEARCHED IN MEMORY
 *
 * listExercises reads the WHOLE library in one go, and the search is a pure
 * function over it (domain/exercise-search.ts). At the scale D16 budgets for
 * this is the fastest answer available — zero SQL per keystroke — and it is the
 * only way to get accent-insensitive matching at all, SQLite's NOCASE and
 * lower() being ASCII-only.
 *
 * ## TWO QUERIES, NEVER ONE PER ROW
 *
 * The secondary muscles are a second table, so the naive shape is a query per
 * exercise. That is the trap slice 4 hit when quick-add moved from the twenty
 * most recent foods to the whole library: a per-row cost that is capped at
 * twenty is fine, and the same cost over a few hundred rows is a few hundred
 * queries on a path budgeted at three tenths of a second.
 *
 * So: one query for the exercises, one for every secondary muscle row, and the
 * two joined in memory by id.
 */

export interface ExerciseListItem extends SearchableExercise {
  id: ExerciseId;
  name: string;
  primaryMuscle: Muscle;
  equipment: Equipment | null;
  secondaryMuscles: Muscle[];
  isFavorite: 0 | 1;
  /**
   * Whether this exercise is measured in seconds (0009).
   *
   * On the LIST item rather than only on the full view, because the routine
   * editor needs it for every block at once — reading one exercise per block
   * would be a query per block on a screen that already has the catalogue
   * cached.
   */
  tracksDuration: 0 | 1;
  /**
   * The four notes of specs 6.3, on the LIST item for the same reason as
   * tracksDuration: the routine page shows them for every block it draws
   * (specs 14.28), and it already holds the catalogue.
   *
   * They come from the same row and the same query, so carrying them costs
   * nothing — which is the only reason a list item may hold text nobody lists.
   */
  noteExecution: string | null;
  noteSetup: string | null;
  noteBreathing: string | null;
  noteMistakes: string | null;
  /**
   * The thumbnail, on the LIST item for the same reason as the notes above: it
   * comes from the same row and the same query, so carrying it costs nothing.
   *
   * Specs 10.1 asks for it — "chaque résultat affiche vignette, nom, muscle,
   * matériel" — and slice 10 could not honour it: nothing could write
   * `media_uri` then, so every row would have shown the same grey square, which
   * is not a vignette but an apology. The catalogue writes it now.
   */
  mediaUri: string | null;
}

export interface ExerciseView extends ExerciseListItem {
  incrementKg: number;
}

/** Every secondary muscle row, grouped by exercise. One query, not n. */
function secondaryMusclesByExercise(db: AppDatabase): Map<string, Muscle[]> {
  const grouped = new Map<string, Muscle[]>();
  for (const row of db
    .select({
      exerciseId: exerciseSecondaryMuscle.exerciseId,
      muscle: exerciseSecondaryMuscle.muscle,
    })
    .from(exerciseSecondaryMuscle)
    .all()) {
    const current = grouped.get(row.exerciseId);
    if (current === undefined) grouped.set(row.exerciseId, [row.muscle]);
    else current.push(row.muscle);
  }
  return grouped;
}

/**
 * The whole library, ordered by name.
 *
 * ORDERED IN SQL rather than in the search, because this order is what an empty
 * term returns and what the list rests at. ix_exercise_name is NOCASE for
 * exactly this: without it "arraché" sorts after every capitalised name.
 */
export function listExercises(db: AppDatabase): ExerciseListItem[] {
  const secondary = secondaryMusclesByExercise(db);

  return db
    .select({
      id: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.primaryMuscle,
      equipment: exercise.equipment,
      isFavorite: exercise.isFavorite,
      tracksDuration: exercise.tracksDuration,
      noteExecution: exercise.noteExecution,
      noteSetup: exercise.noteSetup,
      noteBreathing: exercise.noteBreathing,
      noteMistakes: exercise.noteMistakes,
      mediaUri: exercise.mediaUri,
    })
    .from(exercise)
    .orderBy(asc(sql`${exercise.name} COLLATE NOCASE`))
    .all()
    .map((row) => ({ ...row, secondaryMuscles: secondary.get(row.id) ?? [] }));
}

export function readExercise(db: AppDatabase, exerciseId: ExerciseId): ExerciseView | null {
  const rows = db.select().from(exercise).where(eq(exercise.id, exerciseId)).all();
  const row = rows[0];
  if (row === undefined) return null;

  const secondary = db
    .select({ muscle: exerciseSecondaryMuscle.muscle })
    .from(exerciseSecondaryMuscle)
    .where(eq(exerciseSecondaryMuscle.exerciseId, exerciseId))
    .all()
    .map((item) => item.muscle);

  return {
    id: row.id,
    name: row.name,
    primaryMuscle: row.primaryMuscle,
    equipment: row.equipment,
    secondaryMuscles: secondary,
    isFavorite: row.isFavorite,
    tracksDuration: row.tracksDuration,
    mediaUri: row.mediaUri,
    noteExecution: row.noteExecution,
    noteSetup: row.noteSetup,
    noteBreathing: row.noteBreathing,
    noteMistakes: row.noteMistakes,
    incrementKg: row.incrementKg,
  };
}

/**
 * An exercise as a draft, for the editor.
 *
 * THE INCREMENT COMES FROM THE ROW, NEVER FROM THE SETTING. Specs 6.3 makes the
 * global value an INITIAL one: an exercise created last month keeps the
 * increment it was created with, whatever the setting says today. Reading the
 * setting here would make editing any exercise silently adopt the current
 * default — a correction that changes something nobody asked to change, on the
 * screen where it would be noticed last.
 *
 * NULL columns become empty strings, because a text field cannot hold absence.
 * That is the terminal exception slice 4 named: everything upstream keeps the
 * null, and the deviation happens where the user is about to type over it.
 */
export function readExerciseDraft(
  db: AppDatabase,
  exerciseId: ExerciseId,
): ExerciseDraft | null {
  const view = readExercise(db, exerciseId);
  if (view === null) return null;

  return {
    name: view.name,
    primaryMuscle: view.primaryMuscle,
    equipment: view.equipment,
    secondaryMuscles: new Set(view.secondaryMuscles),
    noteExecution: view.noteExecution ?? '',
    noteSetup: view.noteSetup ?? '',
    noteBreathing: view.noteBreathing ?? '',
    noteMistakes: view.noteMistakes ?? '',
    incrementKg: formatIncrement(view.incrementKg),
    tracksDuration: view.tracksDuration === 1,
    isFavorite: view.isFavorite === 1,
  };
}

/** Whether the library holds anything at all, for the empty state. */
export function countExercises(db: AppDatabase): number {
  const rows = db.select({ n: sql<number>`count(*)` }).from(exercise).all();
  return rows[0]?.n ?? 0;
}
