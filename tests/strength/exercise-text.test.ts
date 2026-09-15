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
    });

    expect(text).toContain('Full body');
    expect(text).toContain('Haut du corps');
    expect(text).toContain('5 séries');
  });

  it('says so plainly when nothing uses the exercise', () => {
    expect(deletionWarning({ routineNames: [], lineCount: 0 })).toBe(
      'Cet exercice n’est utilisé par aucune routine.',
    );
  });

  it('agrees in number, for one routine and for one set', () => {
    const one = deletionWarning({ routineNames: ['Haut du corps'], lineCount: 1 });

    expect(one).toBe('Une série sera retirée de la routine « Haut du corps ».');
  });

  it('claims nothing about sessions, which do not exist yet', () => {
    /**
     * Specs 5.3 also names the charts, the records and the history. They need
     * session_set, which is slice 11's table. Announcing them now would warn
     * about data that does not exist — worse than silence, because the reader
     * has no way to check.
     */
    const text = deletionWarning({ routineNames: ['Haut du corps'], lineCount: 2 });

    expect(text).not.toMatch(/séance|record|graphique|historique/i);
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
