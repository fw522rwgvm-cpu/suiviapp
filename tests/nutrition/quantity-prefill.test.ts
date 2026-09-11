import { describe, expect, it } from 'vitest';
import { prefillQuantity } from '../../src/features/nutrition/domain/quantity-prefill';

/**
 * The lever on the 15-second target (specs 8.4, D16), tested as a pure
 * function.
 *
 * "Opens on the wrong number" is the plausible failure rather than the visible
 * one, which is D15's whole criterion: this screen is designed to be validated
 * without being read, so a believable wrong quantity goes straight into the
 * journal.
 */

const SLICE = { name: 'tranche', quantity: 25 };
const BOWL = { name: 'bol', quantity: 250 };
const CONTEXT = { portions: [SLICE, BOWL], displayRefQty: 30 };

describe('with a previous entry', () => {
  it('reopens on the portion that was used, counted from the frozen size', () => {
    const choice = prefillQuantity(
      { quantity: 50, portionName: 'tranche', portionQuantity: 25 },
      CONTEXT,
    );

    expect(choice.baseQuantity).toBe(50);
    expect(choice.portion).toEqual({ name: 'tranche', quantity: 25, count: 2 });
  });

  it('reopens in base units when base units were used', () => {
    expect(
      prefillQuantity({ quantity: 60, portionName: null, portionQuantity: null }, CONTEXT),
    ).toEqual({ baseQuantity: 60, portion: null });
  });

  it('falls back to base units when the portion has been redefined', () => {
    // THE CASE THIS FUNCTION IS SHAPED AROUND.
    //
    // The slice was 25 g when "2 slices" was logged and is 30 g now. Offering
    // "2 slices" would log 60 g for a habit that has always been 50 g — on the
    // screen whose whole job is to be validated without being read. 50 g is
    // what was actually eaten, so 50 g is the honest answer.
    const choice = prefillQuantity(
      { quantity: 50, portionName: 'tranche', portionQuantity: 25 },
      { portions: [{ name: 'tranche', quantity: 30 }], displayRefQty: 30 },
    );

    expect(choice).toEqual({ baseQuantity: 50, portion: null });
  });

  it('falls back to base units when the portion has been deleted', () => {
    expect(
      prefillQuantity(
        { quantity: 50, portionName: 'tranche', portionQuantity: 25 },
        { portions: [BOWL], displayRefQty: 30 },
      ),
    ).toEqual({ baseQuantity: 50, portion: null });
  });

  it('falls back rather than dividing by a portion size of zero', () => {
    // A hand-repaired archive can carry one. Infinity would pass every later
    // multiplication and land in the database looking like a number.
    expect(
      prefillQuantity(
        { quantity: 50, portionName: 'tranche', portionQuantity: 0 },
        CONTEXT,
      ),
    ).toEqual({ baseQuantity: 50, portion: null });
  });

  it('keeps a fractional count rather than rounding it', () => {
    const choice = prefillQuantity(
      { quantity: 60, portionName: 'tranche', portionQuantity: 25 },
      CONTEXT,
    );

    expect(choice.portion?.count).toBe(2.4);
    expect(choice.baseQuantity).toBe(60);
  });
});

describe('with no previous entry', () => {
  it('offers the quantity the macros were typed against', () => {
    // For a food whose label reads "per 30 g", 30 g is very often the helping
    // as well — and it is the only thing the food itself has to say.
    expect(prefillQuantity(null, CONTEXT)).toEqual({ baseQuantity: 30, portion: null });
  });

  it('falls back to 100 when even that is unusable', () => {
    expect(prefillQuantity(null, { portions: [], displayRefQty: 0 })).toEqual({
      baseQuantity: 100,
      portion: null,
    });
  });
});
