import { describe, expect, it } from 'vitest';
import type { FoodId } from '../../src/core/db/schema';
import {
  describePendingEntryMacros,
  describePendingEntryQuantity,
  pendingEntryKcal,
  pendingEntryMacros,
  type PendingEntry,
} from '../../src/features/nutrition/domain/pending-entry';
import { baseQuantity, portionQuantity } from '../../src/features/nutrition/domain/portions';

/**
 * What a basket line says about itself before it is written (specs 8.4).
 *
 * Worth testing because the figures shown here are a DECISION AID: they are
 * what the meal will contribute if confirmed. Showing the food's macros for
 * 100 instead would be plausible, wrong, and invisible — the shape of mistake
 * D15 singles out.
 */

/** Non-breaking, as formatQuantity joins with — spelled out so no editor can
 *  turn it into an ordinary space and leave the failure unreadable. */
const NB = '\u00A0';

const BREAD: Extract<PendingEntry, { kind: 'food' }> = {
  kind: 'food',
  foodId: 'f1' as FoodId,
  name: 'Pain de mie',
  brand: 'Sans marque',
  baseUnit: 'g',
  reference: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
  quantity: baseQuantity(50),
};

describe('what a line contributes', () => {
  it('scales the food by its quantity, never showing the per-100 figures', () => {
    expect(pendingEntryMacros(BREAD)).toEqual({
      protein: 4,
      carbs: 23.5,
      fat: 1.5,
      kcal: 132.5,
    });
    expect(pendingEntryKcal(BREAD)).toBeCloseTo(132.5, 10);
  });

  it('takes a free entry at face value', () => {
    // Stored as 100 units of a virtual food (D5/R2), so its contribution is
    // exactly what was typed — through the same expression, with no special
    // case in the arithmetic.
    const free: PendingEntry = {
      kind: 'free',
      name: 'Café',
      macros: { protein: 0.5, carbs: 1, fat: 0, kcal: 8 },
    };
    expect(pendingEntryMacros(free)).toEqual(free.macros);
  });
});

describe('the quantity, shown beside the name', () => {
  it('is the amount in base units when that is how it was typed', () => {
    expect(describePendingEntryQuantity(BREAD)).toBe(`50${NB}g`);
  });

  it('names the portion first when one was used', () => {
    expect(
      describePendingEntryQuantity({
        ...BREAD,
        quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2),
      }),
    ).toBe(`2${NB}tranches · 50${NB}g`);
  });

  it('is absent for a free entry', () => {
    // It has none anyone typed: "100 g" would be the storage form, which is the
    // one concession free entry costs (slice 1 found the same). Null rather
    // than an empty string, so the row leaves the slot out instead of
    // rendering a gap.
    expect(
      describePendingEntryQuantity({
        kind: 'free',
        name: 'Café',
        macros: { protein: 0.5, carbs: 1, fat: 0, kcal: 8 },
      }),
    ).toBeNull();
  });
});

describe('the macros, shown under the name', () => {
  it('states what the line contributes, not what the food is worth', () => {
    expect(describePendingEntryMacros(BREAD)).toBe('P 4,0 · G 23,5 · L 1,5');
  });

  it('takes a free entry at face value', () => {
    expect(
      describePendingEntryMacros({
        kind: 'free',
        name: 'Café',
        macros: { protein: 0.5, carbs: 1, fat: 0, kcal: 8 },
      }),
    ).toBe('P 0,5 · G 1,0 · L 0,0');
  });

  it('rounds to one decimal, as specs 5.1 asks', () => {
    expect(
      describePendingEntryMacros({
        ...BREAD,
        reference: { protein: 8.26, carbs: 47, fat: 3, kcal: 265 },
        quantity: baseQuantity(33),
      }),
    ).toContain('P 2,7');
  });
});
