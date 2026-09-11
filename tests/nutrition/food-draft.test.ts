import { describe, expect, it } from 'vitest';
import {
  canonicalMacrosOf,
  emptyFoodDraft,
  isValidFoodDraft,
  validateFoodDraft,
  type FoodDraft,
} from '../../src/features/nutrition/domain/food-draft';

/**
 * What makes a food valid, decided outside any component (D9).
 *
 * The form's rules are here rather than in the screen so they can be exercised
 * without rendering anything, and so a second entry point — the pre-filled
 * creation of slice 4, when Open Food Facts hands over an incomplete product —
 * meets exactly the same rules rather than its own approximation of them.
 */

function draft(overrides: Partial<FoodDraft> = {}): FoodDraft {
  return {
    ...emptyFoodDraft(),
    name: 'Pain de mie',
    macros: { protein: 8, carbs: 47, fat: 3, kcal: 265 },
    ...overrides,
  };
}

describe('a valid food', () => {
  it('needs a name and nothing else beyond sane numbers', () => {
    expect(validateFoodDraft(draft())).toEqual([]);
    expect(isValidFoodDraft(draft())).toBe(true);
  });

  it('may have all-zero macros', () => {
    // Water, or a food whose label someone has not filled in yet. Refusing it
    // would be the application having an opinion the specs do not.
    expect(validateFoodDraft(draft({ macros: { protein: 0, carbs: 0, fat: 0, kcal: 0 } }))).toEqual(
      [],
    );
  });

  it('refuses a name that is only whitespace', () => {
    expect(validateFoodDraft(draft({ name: '   ' }))).toContainEqual({ code: 'name_empty' });
  });

  it('refuses a reference quantity of zero', () => {
    expect(validateFoodDraft(draft({ refQty: 0 }))).toContainEqual({
      code: 'ref_qty_invalid',
      found: 0,
    });
  });

  it('refuses a negative macro, naming which one', () => {
    const problems = validateFoodDraft(
      draft({ macros: { protein: -1, carbs: 47, fat: 3, kcal: 265 } }),
    );
    expect(problems).toContainEqual({ code: 'macro_negative', macro: 'protein' });
    expect(problems).toHaveLength(1);
  });

  it('never refuses a food for the 10% kcal discrepancy', () => {
    // Non-blocking by specification (specs 5.1). A warning that can stop a
    // save is not a warning, and the glass of wine would become unsaveable.
    expect(
      validateFoodDraft(draft({ macros: { protein: 0, carbs: 0, fat: 0, kcal: 120 } })),
    ).toEqual([]);
  });
});

describe('portions on a draft', () => {
  it('accepts the names of the closed list', () => {
    expect(
      validateFoodDraft(
        draft({
          portions: [
            { id: null, name: 'tranche', quantity: 25 },
            { id: null, name: 'bol', quantity: 250 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('refuses a name outside it, naming the row', () => {
    // Caught here rather than by a CHECK constraint: food_portion.name carries
    // none, on purpose, because widening the vocabulary breaks no invariant.
    expect(
      validateFoodDraft(draft({ portions: [{ id: null, name: 'sachet', quantity: 12 }] })),
    ).toContainEqual({ code: 'portion_name_unknown', index: 0, name: 'sachet' });
  });

  it('refuses the same name twice on one food', () => {
    // The unique index would refuse it too, at the end of a save, citing an
    // index. Here the message can sit next to the row that is wrong.
    expect(
      validateFoodDraft(
        draft({
          portions: [
            { id: null, name: 'tranche', quantity: 25 },
            { id: null, name: 'tranche', quantity: 30 },
          ],
        }),
      ),
    ).toContainEqual({ code: 'portion_name_duplicated', index: 1, name: 'tranche' });
  });

  it('refuses a quantity of zero, which is not calculable either', () => {
    expect(
      validateFoodDraft(draft({ portions: [{ id: null, name: 'bol', quantity: 0 }] })),
    ).toContainEqual({ code: 'portion_quantity_invalid', index: 0, found: 0 });
  });

  it('collects every problem instead of stopping at the first', () => {
    // Fixing a form one error per attempt is a path you walk once, badly —
    // the same reason the import validator collects.
    const problems = validateFoodDraft(
      draft({
        name: '',
        refQty: 0,
        macros: { protein: -1, carbs: 47, fat: 3, kcal: -2 },
        portions: [{ id: null, name: 'sachet', quantity: -5 }],
      }),
    );

    expect(problems.map((problem) => problem.code).sort()).toEqual([
      'macro_negative',
      'macro_negative',
      'name_empty',
      'portion_name_unknown',
      'portion_quantity_invalid',
      'ref_qty_invalid',
    ]);
  });
});

describe('what reaches the database', () => {
  it('is the canonical form, converted exactly once', () => {
    const canonical = canonicalMacrosOf(
      draft({ refQty: 30, macros: { protein: 2.4, carbs: 14.1, fat: 0.9, kcal: 79.5 } }),
    );

    expect(canonical.protein).toBeCloseTo(8, 10);
    expect(canonical.kcal).toBeCloseTo(265, 10);
  });

  it('is untouched when the reference quantity is 100', () => {
    const macros = { protein: 8, carbs: 47, fat: 3, kcal: 265 };
    expect(canonicalMacrosOf(draft({ refQty: 100, macros }))).toEqual(macros);
  });
});

describe('the empty draft', () => {
  it('starts in grams, personal, at 100 — and invalid, for want of a name', () => {
    const empty = emptyFoodDraft();
    expect(empty.baseUnit).toBe('g');
    expect(empty.source).toBe('perso');
    expect(empty.refQty).toBe(100);
    expect(empty.isFavorite).toBe(false);
    expect(isValidFoodDraft(empty)).toBe(false);
  });
});
