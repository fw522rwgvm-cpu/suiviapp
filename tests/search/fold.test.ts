import { describe, expect, it } from 'vitest';
import {
  describeFoldSupport,
  FOLD_TABLE,
  foldForSearch,
  probeNormalize,
} from '../../src/core/search/fold';

/**
 * Accent folding, shared by every list this application searches.
 *
 * What is worth testing here is not that searching finds things — that is
 * visible on screen the first time anyone types. It is the folding, which is
 * invisible when it fails: a search that quietly misses accented names looks
 * exactly like a database that does not contain them.
 *
 * These cases came from tests/nutrition/food-search.test.ts when slice 10 moved
 * the fold to core, and they moved WHOLE. A shared module whose tests stayed
 * behind in the first caller's folder is a module the second caller can break
 * without anything failing that names it.
 */

describe('accent folding', () => {
  it('keeps the two halves of the fallback table in step', () => {
    // The one mistake two aligned strings invite. Without this, a missing
    // letter shifts every later mapping by one and folds e into i.
    expect(FOLD_TABLE.accented.length).toBe(FOLD_TABLE.plain.length);
  });

  it('matches in both directions, which is the whole point', () => {
    // Asymmetry would be worse than no folding: it would work often enough to
    // be trusted, then miss.
    expect(foldForSearch('Crème')).toBe(foldForSearch('creme'));
    expect(foldForSearch('CRÈME')).toBe('creme');
    expect(foldForSearch('creme')).toBe('creme');
  });

  it('folds every accent French actually uses', () => {
    expect(foldForSearch('àâäéèêëîïôöùûüÿç')).toBe('aaaeeeeiioouuuyc');
    // NFD does not decompose a ligature, so the table has to catch these
    // whether the engine can normalise or not.
    expect(foldForSearch('Œuf')).toBe('oeuf');
    expect(foldForSearch('nævus')).toBe('naevus');
  });

  it('folds the same way with normalize as without it', () => {
    // THE ASSERTION THAT COVERS THE BRANCH THE PHONE MAY ACTUALLY TAKE.
    //
    // Node has String.prototype.normalize, so every other test here exercises
    // the first branch only. Hermes may not, and the table is what answers if
    // it does not — an untested line on the critical path of the one screen
    // this slice exists for.
    for (const word of [
      'Crème fraîche',
      'Bœuf',
      'Pâtes à l’ancienne',
      'Yaourt 0%',
      'ÉCLAIR',
      'naïve',
      'piqûre',
      'Noël',
    ]) {
      expect(foldForSearch(word, false), word).toBe(foldForSearch(word, true));
    }
  });

  it('folds every letter of the table, one by one', () => {
    // Walks the table itself rather than a sample, so a mapping that drifted
    // by one position is caught at the letter where it drifted.
    for (const [index, character] of [...FOLD_TABLE.accented].entries()) {
      expect(foldForSearch(character, false), character).toBe(FOLD_TABLE.plain[index]);
      expect(foldForSearch(character, true), character).toBe(FOLD_TABLE.plain[index]);
    }
  });

  it('collapses whitespace and trims', () => {
    expect(foldForSearch('  Pain   de   mie  ')).toBe('pain de mie');
  });

  it('leaves digits and punctuation alone', () => {
    // A food called "Yaourt 0%" must stay findable by "0%".
    expect(foldForSearch('Yaourt 0%')).toBe('yaourt 0%');
  });
});

describe('normalize probe', () => {
  function withNormalize<T>(replacement: unknown, run: () => T): T {
    const original = Object.getOwnPropertyDescriptor(String.prototype, 'normalize');
    try {
      if (replacement === undefined) {
        // Reflect rather than `delete (x as Record<...>)`: conventions
        // section 4 rules out type assertions, and Reflect is typed for
        // exactly this.
        Reflect.deleteProperty(String.prototype, 'normalize');
      } else {
        Object.defineProperty(String.prototype, 'normalize', {
          value: replacement,
          configurable: true,
          writable: true,
        });
      }
      return run();
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(String.prototype, 'normalize');
      } else {
        Object.defineProperty(String.prototype, 'normalize', original);
      }
    }
  }

  it('reports a working engine on Node', () => {
    expect(probeNormalize()).toEqual({ present: true, decomposes: true, failure: null });
  });

  it('reports an engine that does not have it at all', () => {
    expect(withNormalize(undefined, probeNormalize)).toEqual({
      present: false,
      decomposes: false,
      failure: null,
    });
  });

  it('reports an engine whose normalize is INERT', () => {
    // The failure a typeof check cannot see: present, callable, and it hands
    // back exactly what it was given. An engine stubbed like this would let
    // the fold believe it had decomposed and silently stop folding.
    const inert = function (this: string): string {
      return String(this);
    };

    expect(withNormalize(inert, probeNormalize)).toEqual({
      present: true,
      decomposes: false,
      failure: null,
    });
  });

  it('reports an engine whose normalize THROWS, without throwing itself', () => {
    // THE DANGEROUS ONE. A typeof check would leave the fold on this branch
    // and every keystroke of the search would raise.
    const throwing = function (): string {
      throw new Error('no ICU data');
    };

    const support = withNormalize(throwing, probeNormalize);
    expect(support.present).toBe(true);
    expect(support.decomposes).toBe(false);
    expect(support.failure).toBe('no ICU data');
  });
});

/**
 * The two witnesses of the development diagnostic, which exist to SEPARATE the
 * branches rather than to confirm both at once.
 *
 * A behavioural check on the device -- "does creme find Creme" -- passes
 * whichever branch ran, because the table covers the whole of French on its
 * own. Only a character the table does not know can tell them apart.
 */

describe('fold diagnostic', () => {
  it('folds the French witness on BOTH paths', () => {
    // Which is exactly why it cannot be the one that identifies the branch.
    expect(foldForSearch('Cr\u00e8me fra\u00eeche', true)).toBe('creme fraiche');
    expect(foldForSearch('Cr\u00e8me fra\u00eeche', false)).toBe('creme fraiche');
  });

  it('folds the beyond-French witness ONLY when the engine decomposes', () => {
    // Vietnamese pho: its o carries a horn and a hook above, neither of which
    // the table knows. This is the line that says which branch ran.
    expect(foldForSearch('Ph\u1edf', true)).toBe('pho');
    expect(foldForSearch('Ph\u1edf', false)).toBe('ph\u1edf');
  });

  it('reports both witnesses together with the probe', () => {
    expect(describeFoldSupport()).toEqual({
      present: true,
      decomposes: true,
      failure: null,
      french: 'creme fraiche',
      beyondFrench: 'pho',
    });
  });
});
