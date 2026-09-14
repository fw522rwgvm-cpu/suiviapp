import { describe, expect, it } from 'vitest';
import {
  amountOf,
  FRACTIONS,
  nearestFraction,
  LAST_WHOLE,
  settleWheel,
  wheelFor,
  wheelWithAmount,
  type WheelChoice,
  type WheelUnit,
} from '../../src/features/nutrition/domain/wheel-choice';
import {
  baseQuantity,
  portionQuantity,
} from '../../src/features/nutrition/domain/portions';

/**
 * The two rules that keep the quantity wheels showing something meaningful
 * (specs 8.4).
 *
 * Worth a file of their own because neither is about how a picker looks: one
 * decides what is about to be eaten, the other stops the screen offering an
 * answer it cannot accept. A later adjustment to the control must not be able
 * to undo either without a test going red.
 */

/** A food in grams, with a slice worth 25 of them and a bowl worth 200. */
const UNITS: readonly WheelUnit[] = [
  { label: 'g', size: null },
  { label: 'tranche', size: 25 },
  { label: 'bol', size: 200 },
];

const AT = (whole: number, fraction: number, unit: number): WheelChoice => ({
  whole,
  fraction,
  unit,
});

describe('turning the unit wheel', () => {
  it('starts a portion at one, whatever the number was', () => {
    // 100 slices is not a mistake anyone makes, but it is a number everyone
    // would then have to undo.
    expect(settleWheel(AT(100, 0, 0), AT(100, 0, 1), UNITS)).toEqual(AT(1, 0, 1));
  });

  it('starts at one when moving between two portions as well', () => {
    expect(settleWheel(AT(3, 0, 1), AT(3, 0, 2), UNITS)).toEqual(AT(1, 0, 2));
  });

  it('KEEPS THE AMOUNT when leaving a portion for base units', () => {
    // The other direction is the opposite rule, and deliberately: saying the
    // same thing differently must not change what is about to be eaten. One
    // slice is 25 g, never 1 g.
    expect(settleWheel(AT(1, 0, 1), AT(1, 0, 0), UNITS)).toEqual(AT(25, 0, 0));
    expect(settleWheel(AT(2, 0, 2), AT(2, 0, 0), UNITS)).toEqual(AT(400, 0, 0));
  });

  it('carries a fraction of a portion across into base units', () => {
    // Half a bowl is 100 g, and the wheels say so in whole grams.
    const half = FRACTIONS.findIndex((fraction) => fraction.label === '1/2');
    expect(settleWheel(AT(0, half, 2), AT(0, half, 0), UNITS)).toEqual(AT(100, 0, 0));
  });
});

describe('nothing is not a quantity', () => {
  it('pushes the dash to an eighth when the number is turned to nought', () => {
    // The wheel that did NOT move is the one that gives way.
    expect(settleWheel(AT(1, 0, 0), AT(0, 0, 0), UNITS)).toEqual(AT(0, 1, 0));
  });

  it('pushes the number to one when the fraction is turned to the dash', () => {
    const half = FRACTIONS.findIndex((fraction) => fraction.label === '1/2');
    expect(settleWheel(AT(0, half, 0), AT(0, 0, 0), UNITS)).toEqual(AT(1, 0, 0));
  });

  it('leaves anything that already says something alone', () => {
    expect(settleWheel(AT(0, 3, 0), AT(50, 3, 0), UNITS)).toEqual(AT(50, 3, 0));
    expect(settleWheel(AT(2, 0, 0), AT(0, 4, 0), UNITS)).toEqual(AT(0, 4, 0));
  });

  it('never settles on an amount of zero', () => {
    // The property behind the two cases above, stated once: whatever pair of
    // turns is asked for, what comes back is something the button can accept.
    for (const whole of [0, 1, 7]) {
      for (const fraction of FRACTIONS.keys()) {
        const settled = settleWheel(AT(whole, fraction, 0), AT(0, 0, 0), UNITS);
        expect(amountOf(settled)).toBeGreaterThan(0);
      }
    }
  });
});

describe('reading a stored quantity back onto the wheels', () => {
  it('finds the nearest face, since the wheel has only seven', () => {
    // 0,37 of a slice is not one of them; a third is the closest thing to it.
    expect(FRACTIONS[nearestFraction(0.37)]?.label).toBe('1/3');
    expect(FRACTIONS[nearestFraction(0)]?.label).toBe('—');
    expect(FRACTIONS[nearestFraction(0.51)]?.label).toBe('1/2');
  });
});

describe('where the wheels stand when the screen opens', () => {
  /**
   * Extracted from a useEffect, which is the whole point of it being a
   * function.
   *
   * The wheels used to mount on a default of 100 and be moved to the real
   * quantity once the query answered — one render later, after the frame had
   * been painted. On the device that is a visible spin, every time the screen
   * opens. No arrangement of effects fixes it: an effect runs after its render,
   * so the value has to exist before the wheels do.
   */
  it('puts a base quantity on the whole wheel and no fraction', () => {
    expect(wheelFor(baseQuantity(60), [])).toEqual({ whole: 60, fraction: 0, unit: 0 });
  });

  it('selects the portion the quantity was expressed in', () => {
    const portions = [{ name: 'tranche' }, { name: 'bol' }];
    // Unit 0 is the base unit, so a portion is its index plus one.
    expect(wheelFor(portionQuantity({ name: 'bol', quantity: 250 }, 2), portions)).toEqual({
      whole: 2,
      fraction: 0,
      unit: 2,
    });
  });

  it('falls back to base units for a portion the food no longer offers', () => {
    // Renamed or dropped since. The same answer the pre-fill chain gives, and
    // for the same reason: what was eaten is not re-interpreted.
    expect(
      wheelFor(portionQuantity({ name: 'tranche', quantity: 25 }, 2), [{ name: 'bol' }]),
    ).toEqual({ whole: 2, fraction: 0, unit: 0 });
  });

  it('cannot tell a dropped portion from a list that has not arrived', () => {
    // THE TRAP THE CALLER HAS TO AVOID, pinned here because it caused a real
    // defect and the screen that caused it cannot be tested from Node.
    //
    // An empty list is a real answer — a food with no named portions, an Open
    // Food Facts product, a food deleted since — and this function is right to
    // fall back to base units for it. It has no way to know the list is merely
    // LATE, and for a journal entry it always was: the food is found THROUGH
    // the entry, so its query cannot even start until the entry has answered.
    // An entry logged as "2 tranches" therefore mounted its wheels against an
    // empty list and opened on grams, every time.
    //
    // So the rule lives with the caller: `null` means "not yet" and holds the
    // wheels back; `[]` means "none" and is passed only when there is nothing
    // to wait for.
    const chosen = portionQuantity({ name: 'tranche', quantity: 25 }, 2);

    expect(wheelFor(chosen, []).unit).toBe(0);
    expect(wheelFor(chosen, [{ name: 'tranche' }]).unit).toBe(1);
  });

  it('lands a fractional count on the nearest face the wheel has', () => {
    // 2,4 slices is not a face. Of the eight the wheel carries, 1/3 (0,333)
    // is nearer to 0,4 than 1/2 is — which is the point of asking for the
    // nearest rather than rounding up.
    const wheel = wheelFor(portionQuantity({ name: 'tranche', quantity: 25 }, 2.4), [
      { name: 'tranche' },
    ]);
    expect(wheel.whole).toBe(2);
    expect(wheel.unit).toBe(1);
    expect(FRACTIONS[wheel.fraction]?.value).toBeCloseTo(1 / 3, 5);
  });
});

describe('a quantity typed by hand', () => {
  /**
   * The keyboard slice 3 deliberately took off this screen, brought back as an
   * exception rather than as the ordinary way to answer.
   *
   * Its reservation was written down at the time — "typing 137 g means turning
   * a wheel" — and this is it being spent. What is tested is not that a number
   * arrives, but the two places it can quietly go wrong: the unit it applies
   * to, and what happens to a value the wheels cannot hold.
   */
  const grams: WheelChoice = { whole: 50, fraction: 0, unit: 0 };
  const slices: WheelChoice = { whole: 2, fraction: 0, unit: 1 };

  it('replaces the number and LEAVES THE UNIT ALONE', () => {
    // The field opens on a row reading "2 tranches (50 g)", so what is being
    // retyped is the 2. A keyboard that switched the unit back to grams would
    // answer a question nobody asked.
    expect(wheelWithAmount(slices, 3)).toEqual({ whole: 3, fraction: 0, unit: 1 });
    expect(wheelWithAmount(grams, 137)).toEqual({ whole: 137, fraction: 0, unit: 0 });
  });

  it('lands a decimal on the nearest face the wheels have', () => {
    // Eight fractions, so 137,5 is exact and 137,3 is not. The wheels visibly
    // move to what was understood rather than silently keeping a value they
    // cannot show.
    expect(wheelWithAmount(grams, 137.5).whole).toBe(137);
    expect(FRACTIONS[wheelWithAmount(grams, 137.5).fraction]?.value).toBeCloseTo(0.5, 5);
    expect(FRACTIONS[wheelWithAmount(grams, 137.3).fraction]?.value).toBeCloseTo(1 / 3, 5);
  });

  it('CLAMPS rather than refuses a number past the last wheel face', () => {
    // A hand on a number pad produces 1370 for 137 often enough. Refusing it
    // would leave the wheels on a value nobody chose, with nothing said.
    expect(wheelWithAmount(grams, 5000).whole).toBe(LAST_WHOLE);
    expect(wheelWithAmount(grams, LAST_WHOLE).whole).toBe(LAST_WHOLE);
  });

  it('never goes negative', () => {
    expect(wheelWithAmount(grams, -5).whole).toBe(0);
  });

  it('round-trips a quantity the wheels can hold', () => {
    // The property that keeps typing and turning the same answer: what the row
    // shows, retyped, must land back where it was.
    for (const amount of [1, 50, 137, 2.5, 0.25, 999]) {
      expect(amountOf(wheelWithAmount(grams, amount))).toBeCloseTo(amount, 5);
    }
  });
});
