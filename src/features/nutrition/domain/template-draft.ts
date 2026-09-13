import { parseDecimal } from '@/core/format';
import type { TemplateInput, TemplateMealInput } from '../data/planning-writes';
import { addMacros, ZERO_MACROS, type Macros } from './macros';
import type { PlannedMeal } from './day-plan';

/**
 * A day template being edited (specs 8.1).
 *
 * IT HOLDS TEXT, NOT NUMBERS, for the reason macro-fields.ts already gives:
 * a number round-tripped through a field eats the comma the moment it is
 * typed — "1," parses to 1, renders back as "1", and the decimal can never be
 * reached. So the draft keeps what was typed and the conversion happens once,
 * on the way out.
 *
 * Pure: no database, no React. The screen holds one of these in state and asks
 * this module whether it may be saved.
 */

export type TargetKey = keyof Macros;

/** One meal of the template, as the form holds it. */
export interface TemplateMealDraft {
  name: string;
  /** Empty means "no target for this macro", which is not the same as zero. */
  protein: string;
  carbs: string;
  fat: string;
  kcal: string;
}

export interface TemplateDraft {
  name: string;
  meals: TemplateMealDraft[];
}

export type TemplateProblem =
  | { code: 'name_empty' }
  | { code: 'meal_name_empty'; index: number }
  | { code: 'target_invalid'; index: number; target: TargetKey }
  | { code: 'target_partial'; index: number };

const TARGET_KEYS: readonly TargetKey[] = ['protein', 'carbs', 'fat', 'kcal'];

function rawOf(meal: TemplateMealDraft, key: TargetKey): string {
  return meal[key];
}

/**
 * Reads a meal's four fields as one target, or as none.
 *
 * ALL FOUR OR NONE is the rule the whole slice obeys — day_meal, the template
 * meals and the banner all read it the same way — so a meal with three figures
 * in it is a problem to report, not a target to store three quarters of.
 *
 * Returns `undefined` for "partially filled", which the caller reports, and is
 * distinct from `null` for "deliberately empty". A meal with no goal is
 * legitimate: specs 8.1 gives targets to meals, it does not require them.
 */
export function readDraftTargets(meal: TemplateMealDraft): Macros | null | undefined {
  const filled = TARGET_KEYS.filter((key) => rawOf(meal, key).trim() !== '');
  if (filled.length === 0) return null;
  if (filled.length < TARGET_KEYS.length) return undefined;

  const values = TARGET_KEYS.map((key) => parseDecimal(rawOf(meal, key)));
  if (values.some((value) => value === null || !Number.isFinite(value) || value < 0)) {
    return undefined;
  }

  const [protein, carbs, fat, kcal] = values as number[];
  return { protein: protein!, carbs: carbs!, fat: fat!, kcal: kcal! };
}

export function validateTemplateDraft(draft: TemplateDraft): TemplateProblem[] {
  const problems: TemplateProblem[] = [];

  if (draft.name.trim() === '') {
    problems.push({ code: 'name_empty' });
  }

  draft.meals.forEach((meal, index) => {
    if (meal.name.trim() === '') {
      problems.push({ code: 'meal_name_empty', index });
    }

    const filled = TARGET_KEYS.filter((key) => rawOf(meal, key).trim() !== '');
    if (filled.length === 0) return;

    for (const key of filled) {
      const value = parseDecimal(rawOf(meal, key));
      if (value === null || !Number.isFinite(value) || value < 0) {
        problems.push({ code: 'target_invalid', index, target: key });
      }
    }

    if (filled.length < TARGET_KEYS.length) {
      problems.push({ code: 'target_partial', index });
    }
  });

  return problems;
}

export function isValidTemplateDraft(draft: TemplateDraft): boolean {
  return validateTemplateDraft(draft).length === 0;
}

/**
 * The template's own targets: the sum of its meals', READ ONLY (specs 8.1).
 *
 * > The template's targets are the sum of its meals', read only.
 *
 * Never stored and never entered — D9 lists "the day's targets" among the
 * values that are systematically recomputed. Computed here from the draft so
 * the editing screen can show the total moving as the figures are typed,
 * which is the only way the user can aim at a daily number while entering
 * per-meal ones.
 */
export function draftTargetsTotal(draft: TemplateDraft): Macros {
  return draft.meals.reduce((total, meal) => {
    const targets = readDraftTargets(meal);
    return targets === null || targets === undefined ? total : addMacros(total, targets);
  }, ZERO_MACROS);
}

/** What the write layer takes. Only call it on a draft that validates. */
export function templateInputOf(draft: TemplateDraft): TemplateInput {
  const meals: TemplateMealInput[] = draft.meals.map((meal) => {
    const targets = readDraftTargets(meal);
    return {
      name: meal.name.trim(),
      // undefined cannot reach here on a valid draft; treated as "no target"
      // rather than asserted away (conventions, section 4).
      targets: targets === undefined ? null : targets,
    };
  });

  return { name: draft.name.trim(), meals };
}

function fieldOf(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** Turns a stored meal back into fields. Empty strings for a meal with no goal. */
export function draftMealOf(meal: PlannedMeal): TemplateMealDraft {
  return {
    name: meal.name,
    protein: fieldOf(meal.targets?.protein),
    carbs: fieldOf(meal.targets?.carbs),
    fat: fieldOf(meal.targets?.fat),
    kcal: fieldOf(meal.targets?.kcal),
  };
}

export function draftOfTemplate(template: {
  name: string;
  meals: readonly PlannedMeal[];
}): TemplateDraft {
  return { name: template.name, meals: template.meals.map(draftMealOf) };
}

export function emptyTemplateMealDraft(name = ''): TemplateMealDraft {
  return { name, protein: '', carbs: '', fat: '', kcal: '' };
}

/**
 * A new template, pre-filled with the fallback meal names.
 *
 * Not an arbitrary convenience: those four names are what every day of this
 * application has been built from since slice 1, so a first template that
 * matches them makes the change visible as targets appearing rather than as
 * the day's shape being replaced. They are editable like anything else.
 */
export function emptyTemplateDraft(mealNames: readonly string[]): TemplateDraft {
  return { name: '', meals: mealNames.map((name) => emptyTemplateMealDraft(name)) };
}
