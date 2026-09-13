import type { SFSymbol } from 'expo-symbols';
import type { ColorTokens } from '@/core/theme';
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
 *
 * ## THE COLOUR TRAVELS WITH THE GLYPH
 *
 * One module, one pair per meal. Split apart, the sun could end up blue on the
 * day somebody added a fifth kind or reordered a palette — and the whole point
 * of the colour is that it agrees with what is drawn. Which colour is a theme
 * token, because it has to differ between light and dark; which token is this
 * file's business, because it depends on what the glyph depicts.
 */
const SYMBOLS: Record<MealKind, SFSymbol> = {
  'Petit-déjeuner': 'sunrise.fill',
  Déjeuner: 'sun.max.fill',
  Dîner: 'moon.stars.fill',
  Collation: 'carrot.fill',
};

const FALLBACK: SFSymbol = 'fork.knife';

/** Which token each meal wears. The values themselves live in the theme. */
const COLORS: Record<MealKind, keyof ColorTokens> = {
  'Petit-déjeuner': 'mealBreakfast',
  Déjeuner: 'mealLunch',
  Dîner: 'mealDinner',
  Collation: 'mealSnack',
};

/**
 * Narrowed by walking the list rather than by indexing.
 *
 * A plain lookup would need the key asserted to a MealKind, and conventions
 * section 4 rules assertions out — the name arrives from a database column
 * that may hold anything written before the vocabulary was closed.
 */
function kindOf(name: string): MealKind | undefined {
  return MEAL_KINDS.find((candidate) => candidate === name);
}

export function mealSymbol(name: string): SFSymbol {
  const kind = kindOf(name);
  return kind === undefined ? FALLBACK : SYMBOLS[kind];
}

/**
 * The colour that agrees with the glyph, read off the theme.
 *
 * An unknown name gets the muted text colour: a meal from before the rule is
 * still a meal, and painting it one of the four would claim it is one of them.
 */
export function mealColor(name: string, colors: ColorTokens): string {
  const kind = kindOf(name);
  return kind === undefined ? colors.textMuted : colors[COLORS[kind]];
}
