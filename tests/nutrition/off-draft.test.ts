import { describe, expect, it } from 'vitest';
import { isValidFoodDraft, validateFoodDraft } from '../../src/features/nutrition/domain/food-draft';
import { hasKcalWarning } from '../../src/features/nutrition/domain/macros';
import { draftFromProduct } from '../../src/features/nutrition/off/off-draft';
import {
  IMPOSSIBLE_KCAL_PER_100,
  isImpossibleEnergy,
} from '../../src/features/nutrition/off/off-product';
import type { OffProduct } from '../../src/features/nutrition/off/off-product';

/**
 * The detour of specs 8.5: a product missing one of the four macros leaves the
 * fast path for a pre-filled form.
 *
 * What is worth testing is not that fields get filled — that is visible the
 * first time anyone uses it. It is the two things that are invisible: that the
 * BARCODE survives the detour, without which the food created here would be
 * shown a second time by every later search, for ever; and that the form is
 * genuinely completable, since a pre-filled draft that cannot pass validation
 * is a dead end reached by scanning a real product in a real shop.
 */

const INCOMPLETE: OffProduct = {
  barcode: '5000169045886',
  name: 'French Crème fraîche',
  brand: 'Waitrose',
  protein100: 2,
  carbs100: 2.3,
  fat100: 41,
  // Observed on this very product: the search hit carried only kilojoules.
  kcal100: null,
};

describe('pre-filling from a product', () => {
  it('carries everything Open Food Facts supplied', () => {
    const draft = draftFromProduct(INCOMPLETE);

    expect(draft.name).toBe('French Crème fraîche');
    expect(draft.brand).toBe('Waitrose');
    expect(draft.macros.protein).toBe(2);
    expect(draft.macros.carbs).toBe(2.3);
    expect(draft.macros.fat).toBe(41);
  });

  it('CARRIES THE BARCODE, which is what stops the product being offered twice', () => {
    // Without it, the food created here would have no barcode, the
    // deduplication would never match it, and every later search for the same
    // thing would show the personal food AND the Open Food Facts one.
    expect(draftFromProduct(INCOMPLETE).barcode).toBe('5000169045886');
  });

  it('keeps the origin, because origin is provenance and not authorship', () => {
    // Specs 8.5 keeps "barcode and origin" on a copy. A food completed by hand
    // came from Open Food Facts all the same.
    expect(draftFromProduct(INCOMPLETE).source).toBe('off');
  });

  it('is in grams, with no heuristic about liquids', () => {
    // Open Food Facts publishes _100g for everything it holds. Reading that as
    // millilitres would apply a density of 1, which specs 5.1 forbids.
    expect(draftFromProduct({ ...INCOMPLETE, name: 'Lait' }).baseUnit).toBe('g');
    expect(draftFromProduct(INCOMPLETE).refQty).toBe(100);
  });

  it('offers no portions rather than guessing at one', () => {
    // Serving sizes on Open Food Facts are free text — "1 pot (125g)" — and
    // the eight names of specs 6.1 are a closed list. Mapping between them
    // would be guessing.
    expect(draftFromProduct(INCOMPLETE).portions).toEqual([]);
  });

  it('shows a missing macro as zero, which is safe HERE and nowhere else', () => {
    // A form field cannot hold "absent", and the user is about to type over
    // it. It is safe precisely because everything upstream kept it null: the
    // decision to divert was taken on the truth.
    expect(draftFromProduct(INCOMPLETE).macros.kcal).toBe(0);
  });
});

describe('the form the detour lands on is completable', () => {
  it('is valid as soon as the missing figure is typed', () => {
    // A pre-filled draft that could not pass validation would be a dead end
    // reached by scanning a real product in a real shop.
    const draft = draftFromProduct(INCOMPLETE);
    const completed = { ...draft, macros: { ...draft.macros, kcal: 386.2 } };

    expect(validateFoodDraft(completed)).toEqual([]);
    expect(isValidFoodDraft(completed)).toBe(true);
  });

  it('is ALREADY valid with the zero left in, because nothing blocks a save', () => {
    // Specs 8.5 requires these values to be marked and editable, never
    // refused. A zero is an odd figure, not an invalid one — the same refusal
    // that kept a CHECK off the macro columns in slice 3.
    expect(isValidFoodDraft(draftFromProduct(INCOMPLETE))).toBe(true);
  });

  it('is valid even for a product with no name at all, once one is typed', () => {
    const nameless = draftFromProduct({ ...INCOMPLETE, name: null });
    expect(nameless.name).toBe('');
    // Empty is the one thing validation does refuse, and rightly: food.name is
    // NOT NULL, so there is nothing to write.
    expect(isValidFoodDraft(nameless)).toBe(false);
    expect(isValidFoodDraft({ ...nameless, name: 'Crème fraîche' })).toBe(true);
  });
});

describe('the 900 kcal threshold, back in scope because it belongs to this journey', () => {
  it('marks beyond 900 and leaves 900 alone', () => {
    // Pure fat is 900 exactly: a warning that fires on olive oil is one nobody
    // reads twice.
    expect(isImpossibleEnergy(IMPOSSIBLE_KCAL_PER_100 + 0.1)).toBe(true);
    expect(isImpossibleEnergy(IMPOSSIBLE_KCAL_PER_100)).toBe(false);
  });

  it('never blocks a save, exactly like the 10% discrepancy', () => {
    // Both are warnings by specification. A non-blocking warning that blocks
    // is not a warning, and specs 8.5 requires the automatic copy to be
    // unblockable by an odd value.
    const absurd = {
      ...draftFromProduct(INCOMPLETE),
      macros: { protein: 0, carbs: 0, fat: 0, kcal: 99999 },
    };

    expect(isImpossibleEnergy(absurd.macros.kcal)).toBe(true);
    expect(hasKcalWarning(absurd.macros)).toBe(true);
    // And still saveable.
    expect(isValidFoodDraft(absurd)).toBe(true);
  });

  it('answers the two questions separately', () => {
    // They are not the same check. The 10% one says the four figures disagree
    // with each other; this one says the energy is not achievable by any food.
    const consistentAndImpossible = {
      protein: 0,
      carbs: 0,
      // 100 g of pure fat plus a little: theoretically 4 * 0 + 4 * 0 + 9 * 101.
      fat: 101,
      kcal: 909,
    };

    expect(hasKcalWarning(consistentAndImpossible)).toBe(false);
    expect(isImpossibleEnergy(consistentAndImpossible.kcal)).toBe(true);
  });
});
