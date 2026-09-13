import { describe, expect, it } from 'vitest';
import {
  amountOf,
  FRACTIONS,
  nearestFraction,
  settleWheel,
  type WheelChoice,
  type WheelUnit,
} from '../../src/features/nutrition/domain/wheel-choice';

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
