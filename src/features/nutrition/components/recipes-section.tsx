import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import type { RecipeId } from '@/core/db/schema';
import type { RecipeListItem } from '../data/recipe-reads';
import { useQuickAccessRecipes, useRecipes } from '../data/recipe-queries';
import { searchFoods } from '../domain/food-search';
import { RecipeRow } from './recipe-row';

/**
 * Recipes in the add window: favourites first, then recents (specs 8.4a).
 *
 * > Recettes : favorites d'abord, puis récentes
 *
 * ## TWO SECTIONS, EXACTLY AS THE FOODS HAVE
 *
 * 8.4a words this line identically for both, so they are shown identically:
 * "Favoris" and "Récents" as two headed groups, not one merged list. Merging
 * them was tried first, on the argument that the star already says which half
 * a row is in — and that is true of a row read on its own, and false of a list
 * read as a shape. What the heading buys is knowing where the favourites STOP,
 * which no per-row mark can say.
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
 * The same arrangement the foods already have on this screen: with no term,
 * quick access in two groups. With one, a single "Mes recettes" over THE WHOLE
 * LIBRARY — because at that point the split has nothing to say, the ranking is
 * the order and a favourite is wherever the match puts it.
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
  const results = useMemo(
    () => (searching ? searchFoods(all.data ?? [], term) : []),
    [searching, term, all.data],
  );

  const favorites = quick.data?.favorites ?? [];
  const recents = quick.data?.recents ?? [];
  const library = all.data ?? [];

  if (searching) {
    return (
      <Group
        title="Mes recettes"
        recipes={results}
        onPick={onPick}
        emptyText={`Aucune recette pour « ${term.trim()} ».`}
      />
    );
  }

  if (library.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
        Aucune recette. Créez-en une depuis l’icône de bibliothèque du Journal :
        elle calcule ses macros depuis ses ingrédients.
      </Text>
    );
  }

  if (favorites.length === 0 && recents.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
        Aucune recette favorite ni récente. Cherchez-la par son nom, ou
        marquez-en une d’une étoile.
      </Text>
    );
  }

  return (
    <>
      <Group title="Favoris" recipes={favorites} onPick={onPick} />
      <Group title="Récents" recipes={recents} onPick={onPick} />
    </>
  );
}

/**
 * One headed card of recipes.
 *
 * Renders NOTHING when empty and given no message — the shape the foods'
 * Section already has on this screen, so a user with favourites and no recents
 * sees one card rather than one card and an explanation of the other.
 */
function Group({
  title,
  recipes,
  onPick,
  emptyText,
}: {
  title: string;
  recipes: readonly RecipeListItem[];
  onPick: (recipeId: RecipeId) => void;
  emptyText?: string;
}) {
  const theme = useTheme();

  if (recipes.length === 0) {
    if (emptyText === undefined) return null;
    return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>{title}</Text>

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
        {recipes.map((item, index) => (
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
  section: { gap: 9 },
  /**
   * The foods' own heading metrics, copied exactly so the groups of the two
   * filters read as one grammar rather than two.
   */
  title: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { fontSize: 15, lineHeight: 21 },
});
