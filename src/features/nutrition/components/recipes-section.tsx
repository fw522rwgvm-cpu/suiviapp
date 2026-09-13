import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import type { RecipeId } from '@/core/db/schema';
import { useQuickAccessRecipes } from '../data/recipe-queries';
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
 * The section disappears when the library has no recipes rather than showing
 * an empty heading — there is nothing to explain here, the library being where
 * a recipe is made.
 */
export function RecipesSection({ onPick }: { onPick: (recipeId: RecipeId) => void }) {
  const theme = useTheme();
  const recipes = useQuickAccessRecipes();

  const favorites = recipes.data?.favorites ?? [];
  const recents = recipes.data?.recents ?? [];

  if (favorites.length === 0 && recents.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Recettes</Text>

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
        {[...favorites, ...recents].map((item, index) => (
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
});
