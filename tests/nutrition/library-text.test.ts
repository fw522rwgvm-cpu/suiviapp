import { describe, expect, it } from 'vitest';
import { libraryEmptyMessage } from '../../src/features/nutrition/components/library-text';

/**
 * Why an empty list says what it says.
 *
 * Three different silences, and the whole value of the function is telling
 * them apart: an empty library, an unmatched search, and a tag nothing carries
 * want three different answers. One message for all three would answer none.
 */

describe('an empty library', () => {
  it('tells you how to fill it, in the terms of the half you are looking at', () => {
    expect(libraryEmptyMessage({ kind: 'foods', held: 0, term: '', tag: null })).toContain(
      'macros pour 100 g',
    );
    expect(libraryEmptyMessage({ kind: 'recipes', held: 0, term: '', tag: null })).toContain(
      'depuis ses ingrédients',
    );
  });

  it('says nothing about a search term it never got to use', () => {
    // The library is empty, so the term matched nothing because there was
    // nothing — quoting it back would blame the word.
    const text = libraryEmptyMessage({ kind: 'foods', held: 0, term: 'poulet', tag: null });

    expect(text).not.toContain('poulet');
  });
});

describe('a search with no hit', () => {
  it('shows the term back, so the typo is visible', () => {
    expect(libraryEmptyMessage({ kind: 'foods', held: 12, term: 'poullet', tag: null })).toBe(
      'Aucun résultat pour « poullet ».',
    );
  });

  it('names the tag too when one is narrowing as well', () => {
    // Both filters are active, so either could be the reason. Naming only one
    // would send the user to change the wrong control.
    const text = libraryEmptyMessage({
      kind: 'recipes',
      held: 12,
      term: 'curry',
      tag: 'végétarien',
    });

    expect(text).toContain('curry');
    expect(text).toContain('végétarien');
  });
});

describe('a tag nothing carries', () => {
  it('names the tag rather than the absent term', () => {
    expect(
      libraryEmptyMessage({ kind: 'recipes', held: 12, term: '', tag: 'batch cooking' }),
    ).toBe('Aucune recette « batch cooking ».');
  });

  it('still says something true when there is no reason left to name', () => {
    // Unreachable from the screen — a non-empty library with no term and no
    // tag always has rows — and it must not render an empty string if it ever
    // becomes reachable.
    expect(libraryEmptyMessage({ kind: 'foods', held: 12, term: '', tag: null })).not.toBe('');
  });
});
