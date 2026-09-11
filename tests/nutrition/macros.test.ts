import { describe, expect, it } from 'vitest';
import {
  addMacros,
  hasKcalWarning,
  kcalDiscrepancy,
  remainingMacros,
  sumMacros,
  theoreticalKcal,
  totalOf,
  ZERO_MACROS,
  type Macros,
} from '../../src/features/nutrition/domain/macros';

/**
 * Pure calculation functions (D15, fourth by value).
 *
 * "Quick to write, and their output cannot be checked by eye." A total that is
 * off by a factor of a hundred looks like a number; so does a remainder with
 * the wrong sign.
 */

const beef: Macros = { protein: 26, carbs: 0, fat: 15, kcal: 250 };

describe('totalOf', () => {
  it('scales a reference of 100 units by the quantity eaten', () => {
    expect(totalOf(beef, 200)).toEqual({ protein: 52, carbs: 0, fat: 30, kcal: 500 });
    expect(totalOf(beef, 50)).toEqual({ protein: 13, carbs: 0, fat: 7.5, kcal: 125 });
  });

  it('returns the reference untouched for exactly 100 units', () => {
    // This is the case a free entry relies on: it is stored as 100 units of a
    // virtual food whose macros for 100 are the values typed in (D5/R2), so
    // it needs no special case anywhere.
    expect(totalOf(beef, 100)).toEqual(beef);
  });

  it('gives nothing for a quantity of zero', () => {
    expect(totalOf(beef, 0)).toEqual(ZERO_MACROS);
  });
});

describe('sums', () => {
  it('adds two sets of macros', () => {
    expect(addMacros(beef, { protein: 4, carbs: 10, fat: 1, kcal: 60 })).toEqual({
      protein: 30,
      carbs: 10,
      fat: 16,
      kcal: 310,
    });
  });

  it('sums an empty list to zero rather than to nothing', () => {
    expect(sumMacros([])).toEqual(ZERO_MACROS);
  });

  it('does not mutate its inputs', () => {
    const before = { ...beef };
    sumMacros([beef, beef]);
    expect(beef).toEqual(before);
  });
});

describe('remainingMacros', () => {
  it('goes negative once the target is passed', () => {
    // The screen has to be able to say by how much, so this must not clamp.
    const target: Macros = { protein: 150, carbs: 200, fat: 60, kcal: 2000 };
    const consumed: Macros = { protein: 170, carbs: 190, fat: 60, kcal: 2100 };
    expect(remainingMacros(target, consumed)).toEqual({
      protein: -20,
      carbs: 10,
      fat: 0,
      kcal: -100,
    });
  });
});

describe('theoretical kcal and its discrepancy', () => {
  it('applies 4 / 4 / 9', () => {
    expect(theoreticalKcal({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
  });

  it('stays quiet when the source agrees with its macros', () => {
    // 26 x 4 + 0 + 15 x 9 = 239 against a stated 250: under 10%.
    expect(hasKcalWarning(beef)).toBe(false);
  });

  it('warns when the source is more than a tenth away', () => {
    expect(hasKcalWarning({ protein: 26, carbs: 0, fat: 15, kcal: 400 })).toBe(true);
  });

  it('says nothing at all about an entry that is empty', () => {
    expect(kcalDiscrepancy(ZERO_MACROS)).toBe(0);
    expect(hasKcalWarning(ZERO_MACROS)).toBe(false);
  });

  it('warns on calories claimed without any macro to justify them', () => {
    // A glass of wine: alcohol is 7 kcal per gram and is not tracked, so this
    // warning is a known false positive with no fix inside specs 5.1. It is
    // non-blocking by specification.
    expect(hasKcalWarning({ protein: 0, carbs: 0, fat: 0, kcal: 120 })).toBe(true);
  });
});
