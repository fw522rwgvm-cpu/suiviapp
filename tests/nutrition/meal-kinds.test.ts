import { describe, expect, it } from 'vitest';
import {
  availableKinds,
  canUseKind,
  isMealKind,
  isSingularKind,
  mealLabelAt,
  mealLabels,
  MEAL_KINDS,
  SNACK_KIND,
} from '../../src/features/nutrition/domain/meal-kinds';
import { DEFAULT_MEAL_NAMES } from '../../src/features/nutrition/domain/day-plan';

/**
 * The closed list of meal names, and the numbering of snacks.
 *
 * The decision this file has to keep falsifiable is that THE NUMBER IS NEVER
 * STORED. D9 forbids storing anything derivable, and this is the case that
 * shows why it matters rather than merely being tidy: a stored "Collation 2"
 * outlives the deletion of "Collation 1" and sits there naming a position that
 * no longer exists.
 */

describe('the vocabulary', () => {
  it('holds exactly the four', () => {
    expect([...MEAL_KINDS]).toEqual(['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation']);
  });

  it('is the one list the fallback day is built from', () => {
    // Two lists would be two lists free to drift, and the one that would drift
    // is the one deciding what an untouched day looks like.
    expect([...DEFAULT_MEAL_NAMES]).toEqual([...MEAL_KINDS]);
  });

  it('recognises its own members and nothing else', () => {
    expect(isMealKind('Déjeuner')).toBe(true);
    expect(isMealKind('Collation du soir')).toBe(false);
    expect(isMealKind('déjeuner')).toBe(false);
    expect(isMealKind('')).toBe(false);
  });

  it('makes the snack the only repeatable one', () => {
    expect(isSingularKind('Petit-déjeuner')).toBe(true);
    expect(isSingularKind('Déjeuner')).toBe(true);
    expect(isSingularKind('Dîner')).toBe(true);
    expect(isSingularKind(SNACK_KIND)).toBe(false);
  });
});

describe('availableKinds', () => {
  it('offers everything to an empty day', () => {
    expect(availableKinds([])).toEqual([...MEAL_KINDS]);
  });

  it('drops a singular kind the day already holds', () => {
    expect(availableKinds(['Déjeuner'])).toEqual(['Petit-déjeuner', 'Dîner', 'Collation']);
  });

  it('always keeps the snack, however many there already are', () => {
    expect(availableKinds(['Collation', 'Collation', 'Collation'])).toContain(SNACK_KIND);
  });

  it('offers only the snack to a full day', () => {
    expect(availableKinds([...DEFAULT_MEAL_NAMES])).toEqual([SNACK_KIND]);
  });

  it('is not blocked by a name written before the list was closed', () => {
    // A legacy row is not one of the four, so it cannot be the singular
    // occurrence of one.
    expect(availableKinds(['Pré-entraînement'])).toEqual([...MEAL_KINDS]);
  });
});

describe('canUseKind', () => {
  it('lets a meal keep the kind it already has', () => {
    // Index-aware, so renaming a meal to itself is not a conflict with itself.
    expect(canUseKind(['Petit-déjeuner', 'Déjeuner'], 1, 'Déjeuner')).toBe(true);
  });

  it('refuses a kind another meal of the day holds', () => {
    expect(canUseKind(['Petit-déjeuner', 'Déjeuner'], 1, 'Petit-déjeuner')).toBe(false);
  });

  it('allows a snack whatever is around it', () => {
    expect(canUseKind(['Collation', 'Collation'], 2, SNACK_KIND)).toBe(true);
  });

  it('answers for a meal that does not exist yet, at index length', () => {
    expect(canUseKind(['Petit-déjeuner'], 1, 'Déjeuner')).toBe(true);
    expect(canUseKind(['Petit-déjeuner'], 1, 'Petit-déjeuner')).toBe(false);
  });
});

describe('mealLabels', () => {
  it('leaves a lone snack unnumbered', () => {
    // The number exists to tell several apart. A lone "Collation 1" answers a
    // question nobody asked.
    expect(mealLabels(['Petit-déjeuner', 'Collation'])).toEqual([
      'Petit-déjeuner',
      'Collation',
    ]);
  });

  it('numbers them from one once there are several', () => {
    expect(mealLabels(['Collation', 'Déjeuner', 'Collation'])).toEqual([
      'Collation 1',
      'Déjeuner',
      'Collation 2',
    ]);
  });

  it('renumbers on its own when one is removed — the whole point of deriving it', () => {
    // Stored, the survivor would still be called "Collation 2". Derived, it
    // goes back to being the only one and loses its number.
    const three = ['Collation', 'Collation', 'Collation'];
    expect(mealLabels(three)).toEqual(['Collation 1', 'Collation 2', 'Collation 3']);
    expect(mealLabels(three.slice(1))).toEqual(['Collation 1', 'Collation 2']);
    expect(mealLabels(three.slice(2))).toEqual(['Collation']);
  });

  it('never touches the three singular kinds', () => {
    expect(mealLabels([...DEFAULT_MEAL_NAMES])).toEqual([...DEFAULT_MEAL_NAMES]);
  });

  it('passes a name from before the rule straight through', () => {
    // Renumbering somebody's old day would be rewriting history to satisfy a
    // rule that did not exist when it was made (specs 5.2).
    expect(mealLabels(['Pré-entraînement', 'Collation', 'Collation'])).toEqual([
      'Pré-entraînement',
      'Collation 1',
      'Collation 2',
    ]);
  });

  it('answers for one position without the caller slicing', () => {
    expect(mealLabelAt(['Collation', 'Collation'], 1)).toBe('Collation 2');
    expect(mealLabelAt(['Collation'], 0)).toBe('Collation');
    expect(mealLabelAt([], 0)).toBe('');
  });
});
