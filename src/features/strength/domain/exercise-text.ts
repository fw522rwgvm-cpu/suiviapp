import type { ExerciseUsage } from '../data/exercise-writes';
import type { ExerciseProblem } from './exercise-draft';
import { muscleLabel } from './vocabulary';

/**
 * The French an exercise is described in. Pure, so it is testable (D9).
 */

/**
 * What deleting an exercise will destroy, in words (specs 5.3).
 *
 * > Supprimer un exercice possédant des séances affiche un avertissement
 * > nommant explicitement ce qui sera perdu. [...] C'est la seule suppression
 * > de l'application qui détruise réellement quelque chose.
 *
 * SO IT NAMES, RATHER THAN COUNTS. "Utilisé par 2 routines" tells you less than
 * "Haut du corps A, Full body": the second lets you decide without opening
 * anything, which is the entire purpose of a warning on a destructive action.
 *
 * Being able to name it is why routine_line.exercise_id is NO ACTION rather
 * than CASCADE — a cascade does the same work silently, and this sentence would
 * have had to guess at what it had done.
 *
 * WHAT IT DOES NOT SAY YET: the sessions, the charts and the records specs 5.3
 * also lists. They need session_set, which is slice 11's. Claiming them now
 * would be a warning about data that does not exist — worse than silence,
 * because the reader has no way to check.
 */
export function deletionWarning(usage: ExerciseUsage): string {
  if (usage.routineNames.length === 0) {
    return 'Cet exercice n’est utilisé par aucune routine.';
  }

  const names = usage.routineNames.join(', ');
  const lines =
    usage.lineCount === 1 ? 'Une série sera retirée' : `${usage.lineCount} séries seront retirées`;

  return usage.routineNames.length === 1
    ? `${lines} de la routine « ${names} ».`
    : `${lines} des routines suivantes : ${names}.`;
}

/**
 * What a validation problem says to the person looking at the form.
 *
 * A sentence that names the field and what to do, never a code. The switch has
 * no default on purpose: adding a problem to ExerciseProblem without wording it
 * fails the build here, which is the same device Record<Muscle, string> uses for
 * the labels.
 */
export function problemText(problem: ExerciseProblem): string {
  switch (problem.kind) {
    case 'name_missing':
      return 'Donnez un nom à l’exercice.';
    case 'increment_missing':
      return 'Indiquez un incrément de progression.';
    case 'increment_not_positive':
      return 'L’incrément doit être supérieur à zéro.';
    case 'secondary_repeats_primary':
      return `« ${muscleLabel(problem.muscle)} » est déjà le muscle principal.`;
  }
}

/**
 * Why the list is empty, in the words that say what to do next.
 *
 * THREE DIFFERENT NOTHINGS, and telling them apart is the whole point: an empty
 * LIBRARY needs a button, an empty SEARCH needs a different word, and an empty
 * FILTER needs a chip cleared. One generic "aucun resultat" would leave the
 * reader to work out which of the three they are in.
 *
 * It lives here rather than in the screen because it is a pure function, and
 * D9 puts no calculation in a component. That is also what makes it testable:
 * importing it from a .tsx would drag React Native into a Node test run.
 */
export function emptyListMessage(state: {
  held: number;
  term: string;
  filtering: boolean;
}): string {
  if (state.held === 0) {
    return 'Aucun exercice pour l\u2019instant. Touchez + pour en cr\u00e9er un.';
  }
  // Ordinary spaces inside the guillemets, as library-text.ts has spelled them
  // since slice 3. Two conventions for one punctuation mark is one too many.
  if (state.term !== '' && state.filtering) {
    return `Aucun exercice ne correspond \u00e0 \u00ab ${state.term} \u00bb avec ces filtres.`;
  }
  if (state.term !== '') return `Aucun exercice ne correspond \u00e0 \u00ab ${state.term} \u00bb.`;
  return 'Aucun exercice ne correspond \u00e0 ces filtres.';
}
