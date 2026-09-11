import { describe, expect, it } from 'vitest';
import { PORTION_NAMES } from '../../src/core/db/schema';
import {
  availableNames,
  baseQuantity,
  choiceOf,
  countOf,
  isPortionName,
  portionQuantity,
} from '../../src/features/nutrition/domain/portions';

/**
 * Portions, and the invariant that a stored quantity is always in base units.
 *
 * The failure this file guards against is the plausible one, which is D15's
 * whole criterion: a quantity of "2" meaning two slices rather than two grams
 * would make every total wrong for that row, by a factor nobody would notice
 * until they looked at a day and found it light.
 */

const SLICE = { name: 'tranche', quantity: 25 };

describe('a quantity is always in base units', () => {
  it('resolves a portion count to base units, and keeps how it was expressed', () => {
    const choice = portionQuantity(SLICE, 2);

    // What every aggregation multiplies.
    expect(choice.baseQuantity).toBe(50);
    // What the screen needs to show "2 tranches" again.
    expect(choice.portion).toEqual({ name: 'tranche', quantity: 25, count: 2 });
  });

  it('records nothing about portions when base units were typed', () => {
    expect(baseQuantity(60)).toEqual({ baseQuantity: 60, portion: null });
  });

  it('counts fractional portions without rounding', () => {
    // 60 g of a 25 g slice is 2.4 slices. Rounding here would feed a rounded
    // value back into the conversion that rebuilds the base quantity, and the
    // entry would drift by a few grams each time it was opened.
    expect(countOf(SLICE, 60)).toBe(2.4);
    expect(portionQuantity(SLICE, countOf(SLICE, 60)).baseQuantity).toBe(60);
  });
});

describe('reopening an entry', () => {
  it('rebuilds the count from the size that was frozen, not the current one', () => {
    // THE ASSERTION THAT PROTECTS HISTORY (specs 5.2).
    //
    // An entry froze "tranche" at 25 g and 50 g eaten. If the food's slice has
    // since been redefined as 30 g, recomputing would show 1.67 slices — or,
    // worse, showing "2 slices" and re-saving would write 60 g for a meal that
    // was 50 g. The frozen size wins, always.
    const choice = choiceOf(50, { name: 'tranche', quantity: 25 });

    expect(choice.baseQuantity).toBe(50);
    expect(choice.portion?.count).toBe(2);
    expect(choice.portion?.quantity).toBe(25);
  });

  it('falls back to base units when no portion was frozen', () => {
    expect(choiceOf(60, null)).toEqual({ baseQuantity: 60, portion: null });
  });

  it('falls back to base units rather than dividing by zero', () => {
    // A hand-repaired archive could carry a portion_quantity of 0. Infinity
    // would sail through every later multiplication and land in the database.
    expect(choiceOf(60, { name: 'bol', quantity: 0 })).toEqual({
      baseQuantity: 60,
      portion: null,
    });
  });
});

describe('the closed list of names', () => {
  it('offers only names the food has not already used', () => {
    // Unique per food (specs 6.1 v2.2). Offering a taken name would make the
    // unique index the thing that does the talking, at the end of a save.
    expect(availableNames(['tranche', 'bol'])).not.toContain('tranche');
    expect(availableNames(['tranche', 'bol'])).toContain('portion');
    expect(availableNames([])).toEqual([...PORTION_NAMES]);
    expect(availableNames([...PORTION_NAMES])).toEqual([]);
  });

  it('keeps the order specs 6.1 lists them in', () => {
    expect(availableNames([])[0]).toBe('tranche');
  });

  it('recognises the eight, and nothing else', () => {
    for (const name of PORTION_NAMES) {
      expect(isPortionName(name), name).toBe(true);
    }
    expect(isPortionName('sachet')).toBe(false);
    expect(isPortionName('Tranche')).toBe(false);
    expect(isPortionName('')).toBe(false);
  });
});
