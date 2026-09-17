import { foldForSearch } from '@/core/search/fold';
import type { Equipment, Muscle } from '@/core/db/schema';
import { equipmentLabel, muscleLabel } from './vocabulary';

/**
 * Searching and filtering the exercise database (specs 10.1).
 *
 * > Par nom, muscle, matériel ; filtrage par muscle et matériel.
 * > Favoris en tête.
 *
 * Two mechanisms, composed, never folded into one — the shape TagFilter settled
 * in slice 6. The TERM searches; the FILTERS narrow. Typing "pectoraux" and
 * tapping the Pectoraux chip are different questions, and a search that
 * understood both would have to rank one against the other, which has no
 * defensible answer.
 *
 * ## WHAT IS SHARED WITH THE FOOD SEARCH, AND WHAT IS NOT
 *
 * The FOLD is shared: core/search/fold.ts, with its probe, its two branches and
 * its escape-written tables. That is the hard part and it is genuinely one
 * problem — Hermes is no likelier to carry Unicode tables for exercises than
 * for foods.
 *
 * The RANKING is not, and that is deliberate rather than duplication. A food
 * ranks a name then a brand; an exercise ranks a name, then the muscle it
 * works, then the equipment. Those are different questions with different
 * answers, and a shared barème would have meant the first exercise that sorted
 * oddly being fixed in a file the foods also read.
 *
 * ## ZERO SQL PER KEYSTROKE, for the reason D16 gives for foods
 *
 * A pure function over one cached list. ix_exercise_name buys the ORDER BY and
 * nothing else: LIKE '%x%' uses no index, ever, and accent-insensitive matching
 * is unreachable from SQLite at all, whose NOCASE and lower() are ASCII-only.
 */

export interface SearchableExercise {
  name: string;
  primaryMuscle: string;
  equipment: string | null;
  /** Empty when the exercise names none. */
  secondaryMuscles: readonly string[];
  isFavorite: 0 | 1;
}

/**
 * The two axes, each single-select, composed by intersection.
 *
 * SINGLE-SELECT PER AXIS is TagFilter's answer to a question nobody has
 * answered: two chips selected within one axis immediately pose union or
 * intersection, where every answer is invented and neither is visible from the
 * chips. Between DIFFERENT axes the question does not arise — "pectoraux and
 * haltères" has one reading — so the axes intersect and each stays singular.
 */
export interface ExerciseFilter {
  muscle: Muscle | null;
  equipment: Equipment | null;
}

export const NO_FILTER: ExerciseFilter = { muscle: null, equipment: null };

export function isFiltering(filter: ExerciseFilter): boolean {
  return filter.muscle !== null || filter.equipment !== null;
}

/**
 * Whether an exercise answers the filters.
 *
 * THE MUSCLE FILTER MATCHES SECONDARIES TOO. Filtering on Triceps and being
 * shown only the exercises whose PRIMARY muscle is triceps would hide the
 * bench press, which is exactly what someone building a push routine is looking
 * for. Specs 10.1 says "filtrage par muscle", not "par muscle primaire", and
 * the useful reading of that is the one that includes the work an exercise
 * actually does.
 *
 * THE EQUIPMENT FILTER DOES NOT MATCH NULL, and that is the honest answer
 * rather than a guess. NULL means "not stated" — the editor never writes it,
 * but an old archive can hold it. Matching it against every filter would claim
 * the exercise uses whatever was asked for; matching it against none says only
 * that nobody said.
 */
export function matchesFilter(exercise: SearchableExercise, filter: ExerciseFilter): boolean {
  if (filter.muscle !== null) {
    const works =
      exercise.primaryMuscle === filter.muscle ||
      exercise.secondaryMuscles.includes(filter.muscle);
    if (!works) return false;
  }
  if (filter.equipment !== null && exercise.equipment !== filter.equipment) return false;
  return true;
}

/**
 * How well an exercise answers a term. Higher is better; 0 means it does not.
 *
 * The ranks descend by how directly the term names the thing: the exercise's
 * own name first, then the muscle it works, then what it is done with. A term
 * matching a name is almost always the one meant — "curl" is an exercise, not a
 * muscle — so nothing about a muscle can outrank a name match.
 *
 * MUSCLES AND EQUIPMENT ARE MATCHED ON THEIR FRENCH LABELS, because that is
 * what the user types. Nobody searches for "lower_back"; they type "lombaires".
 * The stored value is English so the column and the export stay in one
 * language, and this is the one place the two meet.
 */
export function scoreExercise(exercise: SearchableExercise, foldedTerm: string): number {
  if (foldedTerm === '') return 1;

  const name = foldForSearch(exercise.name);
  if (name === foldedTerm) return 100;
  if (name.startsWith(foldedTerm)) return 80;
  // A word inside the name: "couche" should find "Développé couché", which is
  // how most French exercise names are built.
  if (name.includes(` ${foldedTerm}`)) return 60;
  if (name.includes(foldedTerm)) return 40;

  const primary = foldForSearch(muscleLabel(exercise.primaryMuscle));
  if (primary.startsWith(foldedTerm)) return 30;

  for (const muscle of exercise.secondaryMuscles) {
    const label = foldForSearch(muscleLabel(muscle));
    if (label.startsWith(foldedTerm)) return 20;
  }

  const equipmentName = equipmentLabel(exercise.equipment);
  if (equipmentName !== null && foldForSearch(equipmentName).startsWith(foldedTerm)) {
    return 10;
  }

  return 0;
}

/**
 * The exercises answering a term and the filters, favourites first.
 *
 * FAVOURITES LEAD, WHICH OUTRANKS THE SCORE, and specs 10.1 asks for exactly
 * that ("Favoris en tête"). It is worth stating what that costs: a favourite
 * that merely mentions the term sits above a non-favourite whose name IS the
 * term. That is the specified behaviour and the useful one — a favourite is a
 * standing answer to "what do I actually do", which is a stronger signal than
 * a substring.
 *
 * An empty term returns everything, alphabetically: the list's resting state,
 * so the screen needs no separate "browse" path.
 */
export function searchExercises<T extends SearchableExercise>(
  exercises: readonly T[],
  term: string,
  filter: ExerciseFilter = NO_FILTER,
): T[] {
  const folded = foldForSearch(term);

  return exercises
    .filter((exercise) => matchesFilter(exercise, filter))
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, folded) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.exercise.isFavorite - a.exercise.isFavorite ||
        b.score - a.score ||
        // Compared on the folded names, so that "Arraché" and "arraché" do not
        // sort either side of every capital letter — the reason ix_exercise_name
        // is NOCASE.
        foldForSearch(a.exercise.name).localeCompare(foldForSearch(b.exercise.name)),
    )
    .map((entry) => entry.exercise);
}

/**
 * The muscles and equipment actually present in the library, for the chips.
 *
 * DERIVED FROM THE LIST RATHER THAN FROM THE VOCABULARY, so that a chip never
 * offers a filter that returns nothing. TagFilter's rule, restated: a control
 * with nothing behind it reads as broken, and fifteen chips over a library of
 * four exercises would be thirteen dead ends.
 *
 * Secondary muscles count. Filtering on Triceps is worth offering the moment
 * any exercise works them, primarily or not — which is the same reading of
 * specs 10.1 that matchesFilter takes.
 */
export function availableMuscles(exercises: readonly SearchableExercise[]): Set<string> {
  const present = new Set<string>();
  for (const exercise of exercises) {
    present.add(exercise.primaryMuscle);
    for (const muscle of exercise.secondaryMuscles) present.add(muscle);
  }
  return present;
}

export function availableEquipment(exercises: readonly SearchableExercise[]): Set<string> {
  const present = new Set<string>();
  for (const exercise of exercises) {
    if (exercise.equipment !== null) present.add(exercise.equipment);
  }
  return present;
}
