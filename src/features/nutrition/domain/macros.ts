/**
 * Nutrition arithmetic (D9).
 *
 * Pure functions, knowing neither the database nor React. Everything here is
 * derived and therefore never stored: totals, remainders, the theoretical kcal
 * and its discrepancy (D9).
 *
 * Full precision throughout. Rounding happens at the very edge, in
 * core/format, and never on a value that feeds another calculation (specs 5.1).
 */

/** The closed set of tracked macros. No micronutrients, ever (specs 5.1). */
import { formatMacro } from '@/core/format';

export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
  kcal: number;
}

export const ZERO_MACROS: Macros = { protein: 0, carbs: 0, fat: 0, kcal: 0 };

/**
 * A stored reference: macros for 100 base units, the canonical form (D4).
 *
 * Named apart from Macros so that a reference and a total do not read alike at
 * a call site. Passing one for the other is the kind of mistake that produces
 * a plausible number.
 */
export type ReferenceMacros = Macros;

/**
 * What a quantity of a reference actually contributes.
 *
 * One multiplication, which is the entire point of storing macros canonically:
 * Open Food Facts data lands without conversion, and two records compare
 * directly.
 */
export function totalOf(reference: ReferenceMacros, quantity: number): Macros {
  const factor = quantity / 100;
  return {
    protein: reference.protein * factor,
    carbs: reference.carbs * factor,
    fat: reference.fat * factor,
    kcal: reference.kcal * factor,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    kcal: a.kcal + b.kcal,
  };
}

export function sumMacros(values: readonly Macros[]): Macros {
  return values.reduce(addMacros, ZERO_MACROS);
}

/**
 * What is left of a target. Negative once the target is passed, deliberately:
 * the screen has to be able to say by how much (specs 8.3).
 */
export function remainingMacros(target: Macros, consumed: Macros): Macros {
  return {
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
    kcal: target.kcal - consumed.kcal,
  };
}

export const KCAL_PER_GRAM_PROTEIN = 4;
export const KCAL_PER_GRAM_CARBS = 4;
export const KCAL_PER_GRAM_FAT = 9;

/** 4 x P + 4 x C + 9 x F. Computed in parallel, never stored (specs 5.1). */
export function theoreticalKcal(macros: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return (
    macros.protein * KCAL_PER_GRAM_PROTEIN +
    macros.carbs * KCAL_PER_GRAM_CARBS +
    macros.fat * KCAL_PER_GRAM_FAT
  );
}

export const KCAL_DISCREPANCY_THRESHOLD = 0.1;

/**
 * Relative gap between the source's calories and what its macros imply.
 *
 * The source value is kept as given and never recomputed (specs 5.1); this
 * only decides whether to show a non-blocking warning.
 *
 * ASSUMPTION, flagged: specs 5.1 says "a gap above 10%" without naming the
 * denominator. The theoretical value is used, as the expected one against
 * which the source is being judged. When the macros are all zero there is no
 * expectation to compare against, so the source's own value stands in; when
 * both are zero there is nothing to warn about.
 *
 * Known false positive, with no fix available inside the specs: alcohol is
 * 7 kcal per gram and is not a tracked macro, so a glass of wine is 0/0/0 for
 * 120 kcal and will always warn. The warning is non-blocking by specification.
 */
export function kcalDiscrepancy(macros: Macros): number {
  const theoretical = theoreticalKcal(macros);
  const reference = theoretical > 0 ? theoretical : macros.kcal;
  if (reference === 0) return 0;
  return Math.abs(macros.kcal - theoretical) / reference;
}

export function hasKcalWarning(macros: Macros): boolean {
  return kcalDiscrepancy(macros) > KCAL_DISCREPANCY_THRESHOLD;
}

/**
 * The three macros, as a line to read under a name.
 *
 * ONE FORM, EVERYWHERE, because the same three figures appear on a line about
 * to be added and on the same line once it is in the journal, and two
 * spellings of one thing would be read as two different things.
 *
 * Protein, carbs, fat -- kcal is deliberately absent. It has its own place,
 * on the right of every row where these appear, and repeating it here would
 * spend the width that makes the rest readable.
 */
export function describeMacros(macros: Macros): string {
  return `P ${formatMacro(macros.protein)} · G ${formatMacro(macros.carbs)} · L ${formatMacro(macros.fat)}`;
}

/**
 * How far along a target a consumed value is, clamped to [0, 1].
 *
 * FOR DRAWING ONLY. The clamp is what keeps a ring inside its own circle and a
 * bar inside its rounded corners; the figures beside it stay exact, because
 * the drawing is the glance and the numbers are the answer. A target of zero
 * or none has no proportion to show and reads as empty rather than as full.
 */
export function progressRatio(consumed: number, target: number | null): number {
  if (target === null || !Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(consumed) || consumed <= 0) return 0;
  return Math.min(1, consumed / target);
}

/**
 * How far past a calorie target a day or a meal has gone (specs 8.3).
 *
 * ITS OWN THRESHOLD, deliberately NOT KCAL_DISCREPANCY_THRESHOLD. That one is
 * the §5.1 check of a source's stated calories against 4P + 4C + 9F — a
 * statement about one food's own coherence. This one is about eating more than
 * you meant to. Two unrelated questions that happen to share the number 10, and
 * folding them into one constant would tie a display rule to a nutrition rule
 * for ever.
 */
export const KCAL_OVERSHOOT_THRESHOLD = 0.1;

/** Null when there is no target: nothing to stand against (specs 8.1). */
export type TargetStanding = 'under' | 'over' | 'far_over';

export function targetStanding(consumed: number, target: number | null): TargetStanding | null {
  if (target === null || !Number.isFinite(target) || target <= 0) return null;
  if (consumed <= target) return 'under';
  return consumed > target * (1 + KCAL_OVERSHOOT_THRESHOLD) ? 'far_over' : 'over';
}
