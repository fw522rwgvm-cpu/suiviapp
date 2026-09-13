import type { SFSymbol } from 'expo-symbols';
import { MEAL_KINDS, type MealKind } from '../domain/meal-kinds';

/**
 * The glyph that stands for each meal.
 *
 * Presentation, so it lives here and not in the domain: the four names are a
 * stored vocabulary, the symbols are a drawing of them, and nothing outside a
 * screen has any business knowing which.
 *
 * The three fixed meals are told apart by the TIME OF DAY rather than by the
 * food — sunrise, midday, night — because that is what actually distinguishes
 * them, and because a fork would say "meal" on all four. The snack gets the
 * only food glyph, which is what makes it read as the odd one out that it is.
 *
 * A name outside the list — a row written before the vocabulary was closed —
 * falls back to the generic one rather than to nothing: an empty circle beside
 * a named meal reads as a loading state.
 */
const SYMBOLS: Record<MealKind, SFSymbol> = {
  'Petit-déjeuner': 'sunrise.fill',
  Déjeuner: 'sun.max.fill',
  Dîner: 'moon.stars.fill',
  Collation: 'carrot.fill',
};

const FALLBACK: SFSymbol = 'fork.knife';

export function mealSymbol(name: string): SFSymbol {
  // Walked rather than indexed: the key has to be narrowed to a MealKind, and
  // narrowing it by asserting would be the one thing conventions section 4
  // rules out.
  const kind = MEAL_KINDS.find((candidate) => candidate === name);
  return kind === undefined ? FALLBACK : SYMBOLS[kind];
}
