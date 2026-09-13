import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import type { RecipeId } from '@/core/db/schema';
import { useQuickAccessRecipes, useRecipes } from '../data/recipe-queries';
import { searchFoods } from '../domain/food-search';
import { RecipeRow } from './recipe-row';

/**
 * Recipes in the add window: favourites first, then recents (specs 8.4a).
 *
 * > Recettes : favorites d'abord, puis récentes
 *
 * ## IT FOLLOWS THE FOODS RULE, NOT THE MEALS RULE
 *
 * 8.4a words this line exactly as it words the foods line, and differently
 * from the meals line ("Repas : récents"). So choosing a recipe FILLS THE
 * BASKET like choosing a food, rather than writing and closing like a recent
 * meal — the exception slice 5 made for a meal was justified by a meal being
 * "un repas entier en un geste", which a recipe is not.
 *
 * ## AND IT HAS NO "+" BUTTON, WHICH IS THE ASYMMETRY WORTH NAMING
 *
 * Every food row here carries one, because specs 8.4a v2.4 promises the shown
 * quantity IS what the button adds, and a food has the four-step pre-fill
 * chain behind it. A recipe has no equivalent: specs 8.6 makes the consumed
 * quantity its FIRST question, and there is no "last time" to fall back on.
 *
 * So touching the row opens the two steps of specs 8.6. Adding a "+" would
 * mean either inventing a quantity or opening a screen anyway, and both undo
 * the promise the rows above it just made.
 *
 * ## A TERM SWITCHES THE LIST IT IS SHOWING
 *
 * The same arrangement the foods already have on this screen, and it is worth
 * stating because it is not obvious from either half: with no term, quick
 * access — favourites then recents. With one, THE WHOLE LIBRARY, ranked.
 *
 * Searching inside quick access would be the plausible alternative and it is
 * wrong: a recipe you have never logged and never starred is exactly the one
 * you would type the name of, and it is precisely the one quick access does
 * not hold.
 */
export function RecipesSection({
  onPick,
  term = '',
}: {
  onPick: (recipeId: RecipeId) => void;
  /** Empty means quick access; anything else searches the whole library. */
  term?: string;
}) {
  const theme = useTheme();
  const quick = useQuickAccessRecipes();
  const all = useRecipes();

  const searching = term.trim() !== '';

  const shown = useMemo(() => {
    if (searching) return searchFoods(all.data ?? [], term);
    const favorites = quick.data?.favorites ?? [];
    const recents = quick.data?.recents ?? [];
    return [...favorites, ...recents];
  }, [searching, term, all.data, quick.data]);

  const library = all.data ?? [];

  if (shown.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
        {library.length === 0
          ? 'Aucune recette. Créez-en une depuis l’icône de bibliothèque du Journal : elle calcule ses macros depuis ses ingrédients.'
          : searching
            ? `Aucune recette pour « ${term.trim()} ».`
            : 'Aucune recette favorite ni récente. Cherchez par son nom, ou marquez-en une d’une étoile.'}
      </Text>
    );
  }

  return (
    // NO HEADING OF ITS OWN: the filter above already says "Recettes", and a
    // card headed by the name of the tab that selected it is the same word
    // twice in the space of an inch. The foods keep theirs because they are
    // two groups — favourites and recents — under one tab.
    <View style={styles.section}>
      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
          theme.shadow,
        ]}
      >
        {/*
          One list, favourites at the top, with no second heading between them.
          8.4a describes an ORDER within one group, not two groups — and the
          star on each row already says which half a row is in, so a divider
          would be saying it twice.
        */}
        {shown.map((item, index) => (
          <View key={item.id}>
            {index === 0 ? null : <ListSeparator />}
            <RecipeRow recipe={item} onPress={() => onPick(item.id)} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { fontSize: 15, lineHeight: 21 },
});
