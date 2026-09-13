import { describe, expect, it } from 'vitest';
import {
  describeConsumed,
  describeYield,
  describeYieldUnit,
} from '../../src/features/nutrition/components/recipe-text';
import { searchFoods } from '../../src/features/nutrition/domain/food-search';

/**
 * How a recipe is worded, and the one change slice 6 made to the search.
 *
 * The wording has rules in it — pluralisation, which denominator a figure is
 * stated against — so it is a pure function with a test, not strings inlined
 * in a component (D10: no internationalisation library either).
 */

describe('what a recipe makes', () => {
  it('counts portions through the ONE pluralisation rule', () => {
    // formatPortionCount, the same one the journal row and the basket use.
    // The first draft of describeYield had a rule of its own — "more than 1" —
    // beside portion-text's "2 or more", and the two disagree on exactly the
    // values a half-portion produces. This asserts the survivor.
    expect(describeYield({ type: 'portions', value: 4 })).toBe('4\u00A0portions');
    expect(describeYield({ type: 'portions', value: 1 })).toBe('1\u00A0portion');
    // French pluralises from 2, so 1,5 stays singular.
    expect(describeYield({ type: 'portions', value: 1.5 })).toBe('1,5\u00A0portion');
    expect(describeYield({ type: 'portions', value: 0.5 })).toBe('0,5\u00A0portion');
    expect(describeYield({ type: 'portions', value: 2.5 })).toBe('2,5\u00A0portions');
  });

  it('states a weight yield in grams, with no unit to choose', () => {
    // Always grams — a recipe mixes both base units by nature, so there is no
    // unit its yield could be derived in, and a finished dish is weighed.
    //
    // The space is NON-BREAKING, which formatQuantity puts there and which
    // every other quantity in the application already carries: a figure and
    // its unit must not be split across a line end.
    expect(describeYield({ type: 'weight', value: 850 })).toBe('850\u00A0g');
    expect(describeYield({ type: 'weight', value: 850.5 })).toBe('850,5\u00A0g');
  });

  it('never writes millilitres, whatever the ingredients were measured in', () => {
    expect(describeYield({ type: 'weight', value: 500 })).not.toContain('ml');
  });
});

describe('what the figures beside a recipe mean', () => {
  it('names the denominator, as the food library does with "/ 100 g"', () => {
    // A calorie figure with no denominator cannot be compared with the row
    // above, which is the one thing a list is for.
    expect(describeYieldUnit({ type: 'portions', value: 4 })).toBe('par portion');
    expect(describeYieldUnit({ type: 'weight', value: 850 })).toBe('pour 100 g');
  });
});

describe('how much of a recipe is being eaten', () => {
  it('is worded exactly like the yield it is read against', () => {
    // "2 portions" under a recipe that makes "4 portions" is a fraction anyone
    // can see. Two wordings of one unit would have to be decoded instead.
    expect(describeConsumed({ type: 'portions', value: 4 }, 2)).toBe('2\u00A0portions');
    expect(describeConsumed({ type: 'weight', value: 850 }, 250)).toBe('250\u00A0g');
  });
});

describe('the search now ranks things without a brand', () => {
  it('finds a recipe by name', () => {
    // SearchableFood.brand became optional in slice 6: a recipe has a name and
    // NO brand — not a null one — and adding the column to RecipeListItem to
    // satisfy a signature would have been the view bending to the search.
    const recipes = [{ name: 'Curry de pois chiches' }, { name: 'Sauce tomate' }];

    expect(searchFoods(recipes, 'curry')).toEqual([{ name: 'Curry de pois chiches' }]);
  });

  it('does not throw on an entity with no brand column at all', () => {
    // The fold would have been called on undefined. A nullish check rather
    // than a null one is the whole fix, and this is what would have caught it.
    expect(() => searchFoods([{ name: 'Sauce tomate' }], 'zzz')).not.toThrow();
    expect(searchFoods([{ name: 'Sauce tomate' }], 'zzz')).toEqual([]);
  });

  it('still ranks a brand below a name, for the foods that have one', () => {
    const items = [
      { name: 'Yaourt nature', brand: 'Autre' },
      { name: 'Skyr', brand: 'Danone' },
    ];

    // A term matching a name beats one matching a brand, unchanged.
    expect(searchFoods(items, 'danone')).toEqual([{ name: 'Skyr', brand: 'Danone' }]);
  });

  it('ignores accents on a recipe exactly as it does on a food', () => {
    expect(searchFoods([{ name: 'Crème de marrons' }], 'creme')).toHaveLength(1);
  });
});
