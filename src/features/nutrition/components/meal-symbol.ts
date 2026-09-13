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
 * FOUR FOODS, chosen over four times of day. A sunrise, a sun and a moon told
 * the three fixed meals apart neatly, but left the snack as the one glyph that
 * was not a time — an intruder among its own siblings. Named things instead:
 * coffee, cutlery, wine, a carrot. Each is recognised without being worked out,
 * and no one of them is the exception.
 *
 * The cutlery carries a known cost: a fork and knife say "a meal" in general
 * rather than "lunch" in particular. It is accepted because the alternative was
 * a second drink glyph beside the coffee, and two cups would be worse than one
 * generic plate.
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
  'Petit-déjeuner': 'cup.and.saucer.fill',
  Déjeuner: 'fork.knife',
  Dîner: 'wineglass.fill',
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
