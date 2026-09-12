import { describe, expect, it } from 'vitest';
import type { FoodId } from '../../src/core/db/schema';
import {
  describePendingEntryMacros,
  describePendingEntryQuantity,
  pendingEntryKcal,
  pendingEntryMacros,
  wasNameTruncated,
  type PendingEntry,
} from '../../src/features/nutrition/domain/pending-entry';
import { describeMacros } from '../../src/features/nutrition/domain/macros';
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

  it('says ONLY the portion when one was used', () => {
    // "2 tranches" is what was decided; "50 g" is what it came to. Both at once
    // is the same fact said twice, in a slot with room for one — and the grams
    // stay where they earn their place, on the journal row.
    expect(
      describePendingEntryQuantity({
        ...BREAD,
        quantity: portionQuantity({ name: 'tranche', quantity: 25 }, 2),
      }),
    ).toBe(`2${NB}tranches`);
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

describe('whether the name had to be cut', () => {
  // The row drops the quantity when it was, so this decides whether a quantity
  // is shown at all. It reads a line the platform laid out, and what iOS puts
  // in that line cannot be verified from here -- hence the shape of these
  // cases: one "yes" it must recognise, and several unknowns it must not
  // mistake for one.
  const NAME = 'Yaourt nature sucre bio';

  it('says yes to the visible prefix plus the ellipsis the platform appends', () => {
    expect(wasNameTruncated('Yaourt nature su\u2026', NAME)).toBe(true);
  });

  it('says yes to a bare prefix, for a platform that appends nothing', () => {
    expect(wasNameTruncated('Yaourt nature su', NAME)).toBe(true);
  });

  it('says no when the whole name fitted', () => {
    expect(wasNameTruncated(NAME, NAME)).toBe(false);
    // Some platforms report the full string whatever numberOfLines says. That
    // is indistinguishable from fitting, so it reads as fitting: the quantity
    // stays, which is the behaviour without this rule at all.
  });

  it('ignores a line it does not recognise rather than guessing', () => {
    // Fails open. A rule that hid the quantity whenever it was unsure would
    // hide it on every row the day a platform reported something else.
    expect(wasNameTruncated('something else entirely', NAME)).toBe(false);
    expect(wasNameTruncated('', '')).toBe(false);
  });

  it('does not eat a full stop the name really ends with', () => {
    // Only the ellipsis character is stripped. Trimming trailing dots would
    // turn every name ending in one into a permanent false positive.
    expect(wasNameTruncated('Lait 1,5% M.G.', 'Lait 1,5% M.G.')).toBe(false);
  });

  it('is not fooled by the padding around a laid-out line', () => {
    expect(wasNameTruncated(` ${NAME} `, NAME)).toBe(false);
  });
});

describe('the macro line, shared with the journal row', () => {
  it('is the same three figures wherever it appears', () => {
    // Not a duplicate of the cases above: it fixes that ONE function spells
    // them, so a line waiting in the basket and the same line once logged read
    // identically. Two spellings of one thing get read as two things.
    expect(describeMacros(pendingEntryMacros(BREAD))).toBe(describePendingEntryMacros(BREAD));
  });

  it('leaves kcal out', () => {
    // It has its own place, on the right of every row these appear on, and
    // repeating it here would spend the width that makes the rest readable.
    expect(describeMacros({ protein: 8, carbs: 47, fat: 3, kcal: 265 })).toBe(
      'P 8,0 · G 47,0 · L 3,0',
    );
  });
});
