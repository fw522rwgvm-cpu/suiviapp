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
 * ## THE SESSIONS ARRIVE HERE IN SLICE 11, AND THAT WAS PROMISED
 *
 * This comment used to end by saying the sessions, charts and records specs 5.3
 * lists "need session_set, which is slice 11's", and that claiming them early
 * would be a warning about data that does not exist. session_set exists now, so
 * the sentence says them.
 *
 * ## THE TWO HALVES ARE WORDED DIFFERENTLY ON PURPOSE
 *
 * The routines are NAMED and the history is COUNTED. Naming routines lets you
 * decide without opening anything; naming sessions would produce a list that
 * grows without bound and identifies nothing, because nobody recognises a
 * workout by its date.
 *
 * And they are two different KINDS of loss, which is why they are two
 * sentences rather than one list. A routine line is REMOVED — it says nothing
 * without its exercise, so it goes. A recorded set is KEPT and merely unlinked:
 * exercise_name_frozen carries what was performed, so nothing about the past
 * disappears. What breaks is the CONTINUITY — specs 5.3's "la continuité
 * statistique est rompue définitivement" — and that distinction is the only
 * reason this warning exists at all. Saying "seront perdues" of the sets would
 * be the reassuring-direction lie this project never allows.
 */
export function deletionWarning(usage: ExerciseUsage): string {
  const routines = routineSentence(usage);
  const history = historySentence(usage);

  if (history === null) {
    return routines ?? 'Cet exercice n’est utilisé par aucune routine.';
  }
  // The history goes second: it is the part that cannot be undone, and it reads
  // as the consequence of the deletion rather than as a second inventory.
  return routines === null ? history : `${routines} ${history}`;
}

function routineSentence(usage: ExerciseUsage): string | null {
  if (usage.routineNames.length === 0) return null;

  const names = usage.routineNames.join(', ');
  const lines =
    usage.lineCount === 1 ? 'Une série sera retirée' : `${usage.lineCount} séries seront retirées`;

  return usage.routineNames.length === 1
    ? `${lines} de la routine « ${names} ».`
    : `${lines} des routines suivantes : ${names}.`;
}

/**
 * What the recorded history loses, in the words that say it is not erased.
 *
 * "Ne compteront plus" rather than "seront perdues": the rows stay, with the
 * name of the exercise on them. It is the progression charts and the records of
 * specs 10.1 that stop being computable, which is exactly what specs 5.3 calls
 * the statistical continuity being broken.
 */
function historySentence(usage: ExerciseUsage): string | null {
  if (usage.setCount === 0) return null;

  const sets =
    usage.setCount === 1 ? '1 série enregistrée' : `${usage.setCount} séries enregistrées`;
  const sessions =
    usage.sessionCount === 1 ? '1 séance' : `${usage.sessionCount} séances`;

  return (
    `${sets} sur ${sessions} garderont le nom de l’exercice mais ne compteront ` +
    'plus dans ses graphiques ni dans ses records, définitivement.'
  );
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
