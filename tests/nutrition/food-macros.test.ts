import { describe, expect, it } from 'vitest';
import {
  fromCanonical,
  isUsableRefQty,
  toCanonical,
} from '../../src/features/nutrition/domain/food-macros';
import {
  hasKcalWarning,
  kcalDiscrepancy,
  totalOf,
  type Macros,
} from '../../src/features/nutrition/domain/macros';

/**
 * The conversion around display_ref_qty, and the 10% kcal check that slice 3
 * puts in front of a user for the first time.
 */

const PER_30: Macros = { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 };

describe('canonical form', () => {
  it('restates macros typed for 30 g as macros for 100', () => {
    const canonical = toCanonical(PER_30, 30);

    expect(canonical.protein).toBeCloseTo(8, 10);
    expect(canonical.carbs).toBeCloseTo(47, 10);
    expect(canonical.fat).toBeCloseTo(3, 10);
    expect(canonical.kcal).toBeCloseTo(265, 10);
  });

  it('is the identity at 100, which is why 100 is the default', () => {
    expect(toCanonical(PER_30, 100)).toEqual(PER_30);
    expect(fromCanonical(PER_30, 100)).toEqual(PER_30);
  });

  it('comes back to what was typed, so the editor shows no drift', () => {
    // The editor converts on the way in and back on the way out. A round trip
    // that lost a hundredth would make a food's numbers wander every time it
    // was opened and saved.
    for (const refQty of [1, 7, 30, 33.3, 100, 250]) {
      const back = fromCanonical(toCanonical(PER_30, refQty), refQty);
      expect(back.protein, `${refQty}`).toBeCloseTo(PER_30.protein, 10);
      expect(back.kcal, `${refQty}`).toBeCloseTo(PER_30.kcal, 10);
    }
  });

  it('refuses a reference quantity that cannot be divided by', () => {
    // Zero would produce an Infinity that passes every later multiplication
    // and lands in the database looking like a number.
    expect(isUsableRefQty(100)).toBe(true);
    expect(isUsableRefQty(0.5)).toBe(true);
    expect(isUsableRefQty(0)).toBe(false);
    expect(isUsableRefQty(-30)).toBe(false);
    expect(isUsableRefQty(Number.NaN)).toBe(false);
    expect(isUsableRefQty(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('display_ref_qty never leaves the presentation boundary (D9)', () => {
  it('is not an argument any total will accept', () => {
    // Not a compile-time claim dressed as a test: totalOf takes a reference and
    // a quantity, and its answer depends on nothing else. Two foods with the
    // same canonical macros and different reference quantities contribute
    // exactly the same amount.
    const canonical = toCanonical(PER_30, 30);
    const sameFoodTypedPer100 = toCanonical(fromCanonical(canonical, 100), 100);

    expect(totalOf(canonical, 60)).toEqual(totalOf(sameFoodTypedPer100, 60));
  });
});

describe('the 10% kcal warning, on a reference quantity other than 100', () => {
  it('does not depend on the scale the macros were typed at', () => {
    // NEW IN SLICE 3, and free: the editor lets macros be typed for 30 g, so
    // the check must give the same verdict on the typed values and on the
    // canonical ones. The ratio is scale-invariant, and this is what says so —
    // if anyone ever normalises in the wrong place, it fails here.
    const suspect: Macros = { protein: 0, carbs: 0, fat: 0, kcal: 120 };

    for (const refQty of [1, 30, 100, 250]) {
      expect(kcalDiscrepancy(toCanonical(suspect, refQty)), `${refQty}`).toBeCloseTo(
        kcalDiscrepancy(suspect),
        10,
      );
      expect(hasKcalWarning(toCanonical(suspect, refQty)), `${refQty}`).toBe(
        hasKcalWarning(suspect),
      );
    }
  });

  it('stays quiet on a food whose calories match its macros', () => {
    // 4 x 8 + 4 x 47 + 9 x 3 = 247 against a stated 265: 7%, under the bar.
    expect(hasKcalWarning({ protein: 8, carbs: 47, fat: 3, kcal: 265 })).toBe(false);
  });

  it('still fires on a glass of wine, which is the known false positive', () => {
    // Alcohol is 7 kcal/g and is not a tracked macro, so this can never be
    // fixed from inside the specs. Non-blocking by specification — pinned here
    // so the day someone "fixes" it, they have to decide to.
    expect(hasKcalWarning({ protein: 0.1, carbs: 2.6, fat: 0, kcal: 83 })).toBe(true);
  });
});
