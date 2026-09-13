import { describe, expect, it } from 'vitest';
import { PORTION_NAMES } from '../../src/core/db/schema';
import {
  formatChoiceWithBase,
  formatEntryQuantity,
  formatPortionCount,
} from '../../src/features/nutrition/components/portion-text';
import {
  baseQuantity,
  portionQuantity,
} from '../../src/features/nutrition/domain/portions';

/**
 * French wording for portions (D10: no internationalisation library).
 *
 * Worth a file for one reason: the naive plural rule gets one of the eight
 * names of specs 6.1 wrong. "2 morceaus" is the kind of thing that reads as a
 * bug in a screen whose whole job is to be trusted at a glance.
 */

/**
 * The figure and its unit are joined by a NON-BREAKING space, so "2 tranches"
 * never wraps between the number and the word. Spelled out here rather than
 * typed as an ordinary space, which is what the first version of this file did
 * — and the failure was seven assertions reading "expected '1 tranche' to be
 * '1 tranche'", which is the most confusing possible way to be told.
 */
const NB = ' ';

describe('the plural', () => {
  it('agrees from two, and not before', () => {
    expect(formatPortionCount(1, 'tranche')).toBe(`1${NB}tranche`);
    expect(formatPortionCount(1.5, 'tranche')).toBe(`1,5${NB}tranche`);
    expect(formatPortionCount(2, 'tranche')).toBe(`2${NB}tranches`);
  });

  it('takes an x on morceau, not an s', () => {
    // The one irregular name in the closed list.
    expect(formatPortionCount(2, 'morceau')).toBe(`2${NB}morceaux`);
    expect(formatPortionCount(1, 'morceau')).toBe(`1${NB}morceau`);
  });

  it('agrees only the head word of a compound name', () => {
    expect(formatPortionCount(2, 'cuillère à soupe')).toBe(`2${NB}cuillères à soupe`);
    expect(formatPortionCount(3, 'cuillère à café')).toBe(`3${NB}cuillères à café`);
  });

  it('produces something sane for all eight names', () => {
    for (const name of PORTION_NAMES) {
      const plural = formatPortionCount(2, name);
      expect(plural.startsWith('2'), name).toBe(true);
      // Never the naive "morceaus" shape.
      expect(plural, name).not.toContain('eaus');
    }
  });

  it('drops a trailing zero decimal, as a typed quantity would', () => {
    expect(formatPortionCount(2, 'bol')).toBe(`2${NB}bols`);
    expect(formatPortionCount(2.4, 'tranche')).toBe(`2,4${NB}tranches`);
  });
});

describe('what a journal row says', () => {
  it('names the portion and the amount it came to', () => {
    // Showing only the grams would be showing the storage form — the same
    // mistake as showing a free entry as "100 g".
    expect(formatEntryQuantity(50, 'g', 'tranche', 25)).toBe(
      `2${NB}tranches · 50${NB}g`,
    );
  });

  it('says only the amount when no portion was used', () => {
    expect(formatEntryQuantity(60, 'g', null, null)).toBe(`60${NB}g`);
  });

  it('falls back rather than dividing by a portion size of zero', () => {
    expect(formatEntryQuantity(60, 'g', 'tranche', 0)).toBe(`60${NB}g`);
  });
});

describe('a quantity offered for repeat', () => {
  /**
   * The wording a list row uses when it offers to add itself again.
   *
   * It is the THIRD of three, and the differences are deliberate rather than
   * accidental: the journal row joins with a middle dot because an entry is
   * read against a total, the basket shows the portion alone because the line
   * has room for one thing, and this one parenthesises because the row also
   * carries "kcal / 100 g" underneath — a portion with no grams beside it
   * cannot be compared with it.
   */
  it('parenthesises what a portion comes to', () => {
    expect(formatChoiceWithBase(portionQuantity({ name: 'tranche', quantity: 25 }, 2), 'g')).toBe(
      `2${NB}tranches (50${NB}g)`,
    );
  });

  it('says base units once when there is no portion', () => {
    // "50 g (50 g)" would be a parenthesis repeating its own sentence.
    expect(formatChoiceWithBase(baseQuantity(50), 'g')).toBe(`50${NB}g`);
    expect(formatChoiceWithBase(baseQuantity(200), 'ml')).toBe(`200${NB}ml`);
  });

  it('keeps the singular and the fraction the portion wording already handles', () => {
    expect(formatChoiceWithBase(portionQuantity({ name: 'bol', quantity: 250 }, 1), 'g')).toBe(
      `1${NB}bol (250${NB}g)`,
    );
    // -eau takes an x, which is the trap the naive plural rule falls into.
    expect(
      formatChoiceWithBase(portionQuantity({ name: 'morceau', quantity: 20 }, 3), 'g'),
    ).toBe(`3${NB}morceaux (60${NB}g)`);
  });
});
