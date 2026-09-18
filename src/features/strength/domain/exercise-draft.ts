import type { Equipment, Muscle } from '@/core/db/schema';

/**
 * The progression increment a new exercise starts from, in kilograms
 * (specs 6.3, 10.4, 12).
 *
 * ASSUMPTION, FLAGGED: no document gives this number. 2.5 kg is the smallest
 * step a barbell actually takes — a 1.25 kg plate on each side — which makes it
 * the increment that fits the most exercises without being useless for any. It
 * is a SETTING precisely so the guess can be corrected without a migration,
 * the way export_reminder_days was in slice 2.
 *
 * Clamped rather than validated on the way in AND on the way out, which is this
 * project's answer to a bad settings value everywhere: reading protects against
 * a row this application did not write, writing means the stored value is the
 * one the user will be shown back. A settings row is never a reason to refuse
 * to work.
 *
 * The bounds are what a plate set can express: a gram is not an increment, and
 * past 50 kg it is not a progression.
 */
export const DEFAULT_PROGRESSION_INCREMENT_KG = 2.5;
export const MIN_PROGRESSION_INCREMENT_KG = 0.1;
export const MAX_PROGRESSION_INCREMENT_KG = 50;

export function normalizeProgressionIncrement(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DEFAULT_PROGRESSION_INCREMENT_KG;
  }
  if (value < MIN_PROGRESSION_INCREMENT_KG) return MIN_PROGRESSION_INCREMENT_KG;
  if (value > MAX_PROGRESSION_INCREMENT_KG) return MAX_PROGRESSION_INCREMENT_KG;
  // Rounded to the gram: the field accepts what a scale can express, and a
  // stored 2.4999999999 would read back as a number nobody typed.
  return Math.round(value * 1000) / 1000;
}

/**
 * An exercise being created or edited, and what makes it valid (specs 10.1).
 *
 * Pure: it knows neither the database nor React. The editor holds one of these
 * in state, this module says what is wrong with it, and exercise-writes.ts
 * turns a valid one into rows. No calculation lives in the component (D9).
 *
 * PROBLEMS ARE VALUES, NEVER EXCEPTIONS (conventions section 4), and every
 * problem is collected rather than stopping at the first — food-draft.ts's
 * shape, for the reason it gives: fixing a form one error per attempt is a path
 * you walk once, badly.
 */

export interface ExerciseDraft {
  name: string;
  primaryMuscle: Muscle;
  /** NULL means "not stated"; the editor always offers a choice. */
  equipment: Equipment | null;
  /**
   * Secondary muscles, without the primary one (specs 6.3).
   *
   * A Set rather than an array, because the table's composite primary key says
   * the same thing: a muscle is either secondary to this exercise or it is not,
   * and twice is once. The editor toggles, so a Set is also what it holds.
   */
  secondaryMuscles: ReadonlySet<Muscle>;
  noteExecution: string;
  noteSetup: string;
  noteBreathing: string;
  noteMistakes: string;
  /**
   * Kilograms, in the step this exercise progresses by (specs 6.3, 10.4).
   *
   * A STRING while it is being typed, and that is not laziness. Slice 8 found
   * that binding a decimal field to a number moves the caret: "2." parses to 2,
   * re-renders as "2", and the dot the user just typed disappears. The string
   * is what the field holds; the number is what validation reads.
   */
  incrementKg: string;
  /**
   * Whether this exercise is measured in SECONDS rather than repetitions
   * (specs 14.21 no 1).
   *
   * ## THE COLUMN EXISTED SINCE `0009` AND NOTHING COULD EVER SET IT
   *
   * Found in slice 11, by writing a session that has to perform a plank. The
   * flag was read in four places — exercise-reads, routine-reads, SetTable,
   * RoutineBody — and written in none: it was absent from this draft, from
   * columnsOf and from readExerciseDraft. So tracks_duration was 0 on every
   * exercise that has ever existed, the "Temps" column could never appear, and
   * routine_line.duration_seconds was unreachable.
   *
   * THE SAME DEFECT SLICE 10 ALREADY FIXED ONE LEVEL DOWN, and the same way it
   * was found: by touching a projection rather than by a screen failing.
   * duration_seconds was read everywhere and written nowhere, and the lesson
   * written down then applies here word for word — the round trip was coherent
   * and wrong, because the read faithfully returned the default the write had
   * never overridden.
   *
   * A BOOLEAN IN THE DRAFT AND 0 | 1 IN THE TABLE, like isFavorite: every
   * column must map to a JSON scalar, and a draft is not a row.
   */
  tracksDuration: boolean;
  isFavorite: boolean;
}

export type ExerciseProblem =
  | { kind: 'name_missing' }
  | { kind: 'increment_missing' }
  | { kind: 'increment_not_positive' }
  | { kind: 'secondary_repeats_primary'; muscle: Muscle };

/**
 * The increment as a number, or null when the field does not hold one.
 *
 * Comma accepted because a French keyboard offers one, and refusing it would
 * make the field reject what the phone suggests. The project already does this
 * for every decimal it reads.
 */
export function parseIncrement(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  // Number('') is 0 and Number(' ') is 0: the emptiness is checked first, which
  // is the rule slice 4 wrote down — absent must never become zero.
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateExerciseDraft(draft: ExerciseDraft): ExerciseProblem[] {
  const problems: ExerciseProblem[] = [];

  if (draft.name.trim() === '') problems.push({ kind: 'name_missing' });

  const increment = parseIncrement(draft.incrementKg);
  if (increment === null) {
    problems.push({ kind: 'increment_missing' });
  } else if (increment <= 0) {
    // ck_exercise_increment refuses this in SQL too. Caught here first so the
    // form says which field is wrong, rather than the write failing with a
    // constraint name — the food_portion.name argument, applied to a form.
    problems.push({ kind: 'increment_not_positive' });
  }

  /**
   * A muscle cannot be both primary and secondary.
   *
   * Not a database constraint, and could not be one: the two live in different
   * tables, so SQL has nowhere to put it. What it would produce is a body map
   * lit identically by two claims and a search that matches the same exercise
   * twice for one term — plausible, and wrong in a way nobody would look for.
   */
  if (draft.secondaryMuscles.has(draft.primaryMuscle)) {
    problems.push({ kind: 'secondary_repeats_primary', muscle: draft.primaryMuscle });
  }

  return problems;
}

export function isValidExerciseDraft(draft: ExerciseDraft): boolean {
  return validateExerciseDraft(draft).length === 0;
}

/**
 * A blank draft, with the increment already filled from the global setting.
 *
 * THE CALLER PASSES THE SETTING, which is the whole point of the signature.
 * Specs 6.3 and 10.4 say the increment is "propre à l'exercice, initialisé
 * depuis la valeur globale des Réglages": an INITIAL VALUE read once, copied,
 * and thereafter the exercise's own. A default read on every access would make
 * changing the setting rewrite every exercise retroactively, which "propre à
 * l'exercice" rules out.
 *
 * So there is exactly one path from the setting to the column, and it runs
 * through here. That is also why `exercise.increment_kg` carries no SQL
 * DEFAULT: a second source for the same initial value would be free to drift
 * from this one, silently, both numbers being plausible.
 */
export function emptyExerciseDraft(defaultIncrementKg: number): ExerciseDraft {
  return {
    name: '',
    primaryMuscle: 'chest',
    equipment: null,
    secondaryMuscles: new Set(),
    noteExecution: '',
    noteSetup: '',
    noteBreathing: '',
    noteMistakes: '',
    incrementKg: formatIncrement(defaultIncrementKg),
    tracksDuration: false,
    isFavorite: false,
  };
}

/**
 * A number in the field's spelling: a comma, and no trailing zeroes.
 *
 * 2.5 reads as "2,5" and 2 as "2" rather than "2,0" — the field is a place to
 * type, not a place to display a formatted figure.
 */
export function formatIncrement(value: number): string {
  return String(value).replace('.', ',');
}

/** What is stored, once the draft is valid. Null never reaches this. */
export function incrementOf(draft: ExerciseDraft): number {
  return parseIncrement(draft.incrementKg) ?? 0;
}

/** Toggling a secondary muscle, which is what the editor does to the Set. */
export function toggleSecondary(
  muscles: ReadonlySet<Muscle>,
  muscle: Muscle,
): ReadonlySet<Muscle> {
  const next = new Set(muscles);
  if (next.has(muscle)) next.delete(muscle);
  else next.add(muscle);
  return next;
}

/** What an exercise asks of a muscle (specs 6.3). */
export type MuscleRole = 'primary' | 'secondary';

/**
 * The muscles an exercise works, each with the part it plays.
 *
 * For the body map on the editor: the drawing shades by ROLE there, not by
 * volume, because an exercise has no sets. Pure, and here rather than in the
 * screen, because it is a reading of a draft and section 4 keeps calculation
 * out of components.
 *
 * The primary wins a tie. A draft that lists its primary among its secondaries
 * is refused by validateExerciseDraft, but this runs on every keystroke of a
 * draft being built — including the moment between choosing a new primary and
 * the old one being cleared — and a muscle that is both is principally the one
 * it is principally.
 */
export function muscleRoles(
  primaryMuscle: string,
  secondaryMuscles: Iterable<string>,
): Map<string, MuscleRole> {
  const roles = new Map<string, MuscleRole>();
  for (const muscle of secondaryMuscles) roles.set(muscle, 'secondary');
  roles.set(primaryMuscle, 'primary');
  return roles;
}

/**
 * Whether two drafts say the same thing (specs 14.27).
 *
 * ## WHY THIS IS NOT A DEEP COMPARISON OF ANY KIND
 *
 * What is being asked is "is there anything to lose", and that question is
 * answered field by field or not at all. A generic deep equality would have to
 * be told about the Set anyway, and would silently start comparing whatever
 * field is added next — including one nobody meant to guard.
 *
 * Written out, adding a field to ExerciseDraft and forgetting it here is caught
 * by nothing, which is why the test names every field of the draft rather than
 * checking a couple of them.
 *
 * `incrementKg` is compared as the STRING it is: "2,5" and "2.5" parse to the
 * same number and are not the same thing to type over, and a confirmation is
 * about what would be lost rather than about what would be stored.
 */
export function sameExerciseDraft(a: ExerciseDraft, b: ExerciseDraft): boolean {
  return (
    a.name === b.name &&
    a.primaryMuscle === b.primaryMuscle &&
    a.equipment === b.equipment &&
    a.incrementKg === b.incrementKg &&
    a.tracksDuration === b.tracksDuration &&
    a.isFavorite === b.isFavorite &&
    a.noteExecution === b.noteExecution &&
    a.noteSetup === b.noteSetup &&
    a.noteBreathing === b.noteBreathing &&
    a.noteMistakes === b.noteMistakes &&
    sameMuscles(a.secondaryMuscles, b.secondaryMuscles)
  );
}

function sameMuscles(a: ReadonlySet<Muscle>, b: ReadonlySet<Muscle>): boolean {
  if (a.size !== b.size) return false;
  for (const muscle of a) if (!b.has(muscle)) return false;
  return true;
}
