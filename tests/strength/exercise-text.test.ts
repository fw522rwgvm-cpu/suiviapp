import { describe, expect, it } from 'vitest';
import {
  deletionWarning,
  emptyListMessage,
  problemText,
} from '../../src/features/strength/domain/exercise-text';

/**
 * The French an exercise is described in.
 *
 * Pure functions rather than strings inside components (D9), so the wording of
 * a destructive confirmation is something a test can hold still.
 */

describe('the deletion warning specs 5.3 requires', () => {
  it('names the routines rather than counting them', () => {
    /**
     * > Supprimer un exercice possédant des séances affiche un avertissement
     * > nommant explicitement ce qui sera perdu.
     *
     * Naming is the requirement. "2 routines" tells you less than the names,
     * which let you decide without opening anything — and being able to name
     * them is why the foreign key is NO ACTION rather than CASCADE.
     */
    const text = deletionWarning({
      routineNames: ['Full body', 'Haut du corps'],
      lineCount: 5,
      setCount: 0,
      sessionCount: 0,
    });

    expect(text).toContain('Full body');
    expect(text).toContain('Haut du corps');
    expect(text).toContain('5 séries');
  });

  it('says so plainly when nothing uses the exercise', () => {
    expect(
      deletionWarning({ routineNames: [], lineCount: 0, setCount: 0, sessionCount: 0 }),
    ).toBe('Cet exercice n’est utilisé par aucune routine.');
  });

  it('agrees in number, for one routine and for one set', () => {
    const one = deletionWarning({
      routineNames: ['Haut du corps'],
      lineCount: 1,
      setCount: 0,
      sessionCount: 0,
    });

    expect(one).toBe('Une série sera retirée de la routine « Haut du corps ».');
  });

  it('claims nothing about sessions when there are none', () => {
    /**
     * The half that stays true after slice 11: an exercise never performed
     * loses no history, and saying otherwise would be the warning overstating
     * what it prevents — the failure mode specs 14.26 no 2 named on the cart.
     * A confirmation that exaggerates wears out.
     */
    const text = deletionWarning({
      routineNames: ['Haut du corps'],
      lineCount: 2,
      setCount: 0,
      sessionCount: 0,
    });

    expect(text).not.toMatch(/séance|record|graphique/i);
  });

  it('counts the recorded history, where it names the routines', () => {
    /**
     * Specs 14.20 no 3 deferred this: the warning mentioned "ni séances, ni
     * records, ni graphiques" because they needed session_set, "table de la
     * tranche 11". It exists, so the sentence says them.
     *
     * COUNTED and not named, unlike the routines, and the asymmetry is the
     * decision: a routine name lets you decide without opening anything, while
     * "séance du 14 septembre" identifies nothing — nobody recognises a workout
     * by its date. What the reader needs here is the size of what breaks.
     */
    const text = deletionWarning({
      routineNames: ['Haut du corps'],
      lineCount: 2,
      setCount: 24,
      sessionCount: 6,
    });

    expect(text).toContain('24 séries enregistrées');
    expect(text).toContain('6 séances');
    expect(text).toContain('records');
  });

  it('says the history is kept and only stops counting', () => {
    /**
     * THE ASSERTION THAT KEEPS THE SENTENCE HONEST.
     *
     * The rows are not deleted: deleteExercise() nulls session_set.exercise_id
     * and exercise_name_frozen carries what was performed (D5/R4). What breaks
     * is specs 5.3's "continuité statistique", not the record of the workout.
     *
     * So the wording must not say "perdues". Writing the reassuring direction
     * would be the usual failure; here the honest direction is the reassuring
     * one, and it is still the one that has to be checked — an editor tightening
     * this sentence would reach for "perdues" first.
     */
    const text = deletionWarning({
      routineNames: [],
      lineCount: 0,
      setCount: 3,
      sessionCount: 1,
    });

    expect(text).toContain('garderont le nom');
    expect(text).not.toMatch(/perdue/i);
    // One session, singular, and no routine sentence in front of it.
    expect(text).toContain('1 séance ');
    expect(text).not.toContain('routine');
  });
});

describe('what a form problem says', () => {
  it('names the field and what to do, never a code', () => {
    expect(problemText({ kind: 'name_missing' })).toContain('nom');
    expect(problemText({ kind: 'increment_missing' })).toContain('incrément');
    expect(problemText({ kind: 'increment_not_positive' })).toContain('supérieur à zéro');
  });

  it('names the muscle that is already primary', () => {
    expect(problemText({ kind: 'secondary_repeats_primary', muscle: 'chest' })).toContain(
      'Pectoraux',
    );
  });
});

describe('why the list is empty', () => {
  it('tells three different nothings apart', () => {
    /**
     * An empty LIBRARY needs a button, an empty SEARCH needs a different word,
     * and an empty FILTER needs a chip cleared. One generic "aucun résultat"
     * would leave the reader to work out which of the three they are in.
     */
    expect(emptyListMessage({ held: 0, term: '', filtering: false })).toContain('+');
    expect(emptyListMessage({ held: 4, term: 'squat', filtering: false })).toContain('« squat »');
    expect(emptyListMessage({ held: 4, term: '', filtering: true })).toContain('filtres');
  });

  it('names both causes when both apply', () => {
    const text = emptyListMessage({ held: 4, term: 'squat', filtering: true });

    expect(text).toContain('« squat »');
    expect(text).toContain('filtres');
  });

  it('offers the button only when the library is genuinely empty', () => {
    // Otherwise "touchez +" appears over a library full of exercises that the
    // filter happens to be hiding, which reads as though they were lost.
    expect(emptyListMessage({ held: 4, term: 'squat', filtering: false })).not.toContain('+');
  });
});
