import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_MEAL_NAME,
  draftOfTemplate,
  draftTargetsTotal,
  emptyTemplateDraft,
  emptyTemplateMealDraft,
  isValidTemplateDraft,
  readDraftTargets,
  templateInputOf,
  validateTemplateDraft,
  type TemplateDraft,
} from '../../src/features/nutrition/domain/template-draft';

/**
 * The template being edited, as a pure value.
 *
 * The draft holds TEXT, not numbers, for the reason macro-fields.ts gives: a
 * number round-tripped through a field eats the comma the moment it is typed.
 * So the assertions here are about strings going in and numbers coming out,
 * once, at the boundary.
 */

function meal(name: string, values: Partial<Record<string, string>> = {}) {
  return { ...emptyTemplateMealDraft(name), ...values };
}

function draft(...meals: ReturnType<typeof meal>[]): TemplateDraft {
  return { name: 'Jour d’entraînement', meals };
}

describe('readDraftTargets', () => {
  it('reads four filled fields as a target', () => {
    expect(
      readDraftTargets(
        meal('Déjeuner', { protein: '50', carbs: '80', fat: '20', kcal: '700' }),
      ),
    ).toEqual({ protein: 50, carbs: 80, fat: 20, kcal: 700 });
  });

  it('accepts the comma, which is what a French keyboard produces', () => {
    expect(
      readDraftTargets(
        meal('Déjeuner', { protein: '50,5', carbs: '80', fat: '20', kcal: '700' }),
      ),
    ).toEqual({ protein: 50.5, carbs: 80, fat: 20, kcal: 700 });
  });

  it('reads four empty fields as no target, which is legitimate', () => {
    // Specs 8.1 gives targets to meals; it does not require them. A snack with
    // no goal is a meal, not an incomplete one.
    expect(readDraftTargets(meal('Collation'))).toBeNull();
  });

  it('reads a partially filled meal as neither, so the caller can say so', () => {
    // undefined rather than null: "three figures out of four" is a problem to
    // report, not a target to store three quarters of.
    expect(readDraftTargets(meal('Déjeuner', { protein: '50' }))).toBeUndefined();
  });

  it('refuses a negative figure', () => {
    expect(
      readDraftTargets(
        meal('Déjeuner', { protein: '-1', carbs: '80', fat: '20', kcal: '700' }),
      ),
    ).toBeUndefined();
  });
});

describe('validateTemplateDraft', () => {
  it('accepts a template whose meals mix targets and none', () => {
    const value = draft(
      meal('Petit-déjeuner', { protein: '40', carbs: '60', fat: '15', kcal: '535' }),
      meal('Collation'),
    );
    expect(validateTemplateDraft(value)).toEqual([]);
    expect(isValidTemplateDraft(value)).toBe(true);
  });

  it('refuses a nameless template', () => {
    expect(validateTemplateDraft({ ...draft(meal('Déjeuner')), name: '   ' })).toContainEqual({
      code: 'name_empty',
    });
  });

  it('refuses a nameless meal, naming which one', () => {
    expect(validateTemplateDraft(draft(meal('Déjeuner'), meal('')))).toContainEqual({
      code: 'meal_name_empty',
      index: 1,
    });
  });

  it('refuses three figures out of four, naming which meal', () => {
    expect(
      validateTemplateDraft(draft(meal('Déjeuner', { protein: '50', carbs: '80', fat: '20' }))),
    ).toContainEqual({ code: 'target_partial', index: 0 });
  });

  it('refuses a figure that is not one', () => {
    expect(
      validateTemplateDraft(
        draft(meal('Déjeuner', { protein: 'beaucoup', carbs: '80', fat: '20', kcal: '700' })),
      ),
    ).toContainEqual({ code: 'target_invalid', index: 0, target: 'protein' });
  });

  it('accepts a template with no meal at all', () => {
    // It produces a day with no meal, which specs 8.3 already allows a
    // materialised day to be reduced to.
    expect(isValidTemplateDraft({ name: 'Vide', meals: [] })).toBe(true);
  });
});

describe('draftTargetsTotal', () => {
  it('sums only the meals that carry a target (specs 8.1)', () => {
    expect(
      draftTargetsTotal(
        draft(
          meal('Petit-déjeuner', { protein: '40', carbs: '60', fat: '15', kcal: '535' }),
          meal('Déjeuner', { protein: '50', carbs: '80', fat: '20', kcal: '700' }),
          meal('Collation'),
        ),
      ),
    ).toEqual({ protein: 90, carbs: 140, fat: 35, kcal: 1235 });
  });

  it('is zero for a template nobody has given a figure to', () => {
    expect(draftTargetsTotal(draft(meal('Déjeuner')))).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
      kcal: 0,
    });
  });

  it('ignores a half-filled meal rather than counting part of it', () => {
    expect(
      draftTargetsTotal(
        draft(
          meal('Petit-déjeuner', { protein: '40', carbs: '60', fat: '15', kcal: '535' }),
          meal('Déjeuner', { protein: '50' }),
        ),
      ).protein,
    ).toBe(40);
  });
});

describe('the round trip through the write layer', () => {
  it('trims names and converts figures once, on the way out', () => {
    const input = templateInputOf({
      name: '  Jour d’entraînement  ',
      meals: [meal('  Déjeuner  ', { protein: '50,5', carbs: '80', fat: '20', kcal: '700' })],
    });

    expect(input.name).toBe('Jour d’entraînement');
    expect(input.meals[0]?.name).toBe('Déjeuner');
    expect(input.meals[0]?.targets).toEqual({ protein: 50.5, carbs: 80, fat: 20, kcal: 700 });
  });

  it('comes back out of a stored template as the same fields', () => {
    const stored = {
      name: 'Jour de repos',
      meals: [
        { position: 0, name: 'Déjeuner', targets: { protein: 30, carbs: 40, fat: 12, kcal: 388 } },
        { position: 1, name: 'Collation', targets: null },
      ],
    };

    const value = draftOfTemplate(stored);
    expect(value.meals[0]?.protein).toBe('30');
    // A meal with no goal comes back as four empty fields, not as four zeros:
    // zero is a target, and absence is not.
    expect(value.meals[1]).toEqual(emptyTemplateMealDraft('Collation'));
    expect(templateInputOf(value).meals).toEqual([
      { name: 'Déjeuner', targets: { protein: 30, carbs: 40, fat: 12, kcal: 388 } },
      { name: 'Collation', targets: null },
    ]);
  });

  it('seeds a new template with the fallback meal names', () => {
    const value = emptyTemplateDraft(['Petit-déjeuner', 'Déjeuner']);
    expect(value.name).toBe('');
    expect(value.meals.map((entry) => entry.name)).toEqual(['Petit-déjeuner', 'Déjeuner']);
    expect(value.meals.every((entry) => entry.kcal === '')).toBe(true);
  });
});

describe('the closed list reaches the templates', () => {
  it('refuses a meal name outside the four', () => {
    // A day's meals are copied from its template at materialisation, so a
    // template free to name a meal anything would put anything on a day.
    expect(validateTemplateDraft(draft(meal('Pre-entrainement')))).toContainEqual({
      code: 'meal_name_unknown',
      index: 0,
      name: 'Pre-entrainement',
    });
  });

  it('refuses a second breakfast, lunch or dinner in the same template', () => {
    expect(validateTemplateDraft(draft(meal('Déjeuner'), meal('Déjeuner')))).toContainEqual({
      code: 'meal_name_duplicated',
      index: 1,
      name: 'Déjeuner',
    });
  });

  it('accepts as many snacks as asked for', () => {
    expect(
      isValidTemplateDraft(draft(meal('Collation'), meal('Collation'), meal('Collation'))),
    ).toBe(true);
  });

  it('seeds a new row with the one kind a template can always take again', () => {
    expect(DEFAULT_NEW_MEAL_NAME).toBe('Collation');
  });
});
