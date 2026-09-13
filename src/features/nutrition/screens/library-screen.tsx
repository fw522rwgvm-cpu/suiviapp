import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useFoods, useSetFoodFavorite } from '../data/food-queries';
import { useRecipeTags, useRecipes, useSetRecipeFavorite } from '../data/recipe-queries';
import { searchFoods } from '../domain/food-search';
import { FoodRow } from '../components/food-row';
import { RecipeRow } from '../components/recipe-row';
import { SearchField } from '../components/search-field';
import { TagFilter } from '../components/tag-filter';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * The library of foods and recipes (specs 7, 8.5, 8.6).
 *
 * > Bibliothèque d'aliments et de recettes : accessible par une icône dédiée
 * > en en-tête de l'écran Journal.
 *
 * Reached by an icon in the Journal header, and pushed inside the Journal's
 * own native stack rather than presented from the root: the tab bar stays, the
 * back gesture is the system's, and the rule across the whole slice stays
 * legible — BROWSING IS A PUSH, ADDING IS A WINDOW.
 *
 * ## TWO SECTIONS, ONE SEARCH FIELD
 *
 * Specs 7 names both in one breath and slice 3 left a note here saying recipes
 * would land in slice 6. They share the field because the user's question is
 * "where is my thing called X", not "is my thing called X a food or a recipe" —
 * and because both searches are pure functions over lists that are already
 * cached, so running two costs one pass each (D16, specs 8.4b).
 *
 * Foods first, which is the order specs 8.4b fixes for the add screen and
 * there is no reason to invert here: the library holds far more foods than
 * recipes, and a recipe is something you go looking for by name.
 *
 * The tag filter narrows the recipe section only, and only when the library
 * has tags — see TagFilter for why it is a second filter rather than part of
 * the search.
 *
 * Holds no calculation (D9) and no query of its own beyond the hooks.
 */
export function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const foods = useFoods();
  const recipes = useRecipes();
  const tags = useRecipeTags();
  const setFoodFavorite = useSetFoodFavorite();
  const setRecipeFavorite = useSetRecipeFavorite();

  // Filtered in memory, on every keystroke, with no query behind either (D16).
  const shownFoods = useMemo(() => searchFoods(foods.data ?? [], term), [foods.data, term]);

  const shownRecipes = useMemo(() => {
    // The tag narrows FIRST, then the term ranks what is left. The other order
    // would rank the whole library and then throw most of it away, which costs
    // the same and reads worse.
    const narrowed =
      tag === null
        ? (recipes.data ?? [])
        : (recipes.data ?? []).filter((recipe) => recipe.tags.includes(tag));
    return searchFoods(narrowed, term);
  }, [recipes.data, term, tag]);

  const loaded = foods.data !== undefined && recipes.data !== undefined;
  const empty = loaded && (foods.data?.length ?? 0) === 0 && (recipes.data?.length ?? 0) === 0;
  const nothingMatches = loaded && !empty && shownFoods.length === 0 && shownRecipes.length === 0;

  /**
   * The header's + now has two answers, so it asks.
   *
   * The one place this screen grew a decision. An action sheet rather than two
   * buttons in the bar: two + icons would each need a label to be told apart,
   * and a header is the one place with no room for labels.
   */
  function add(): void {
    Alert.alert('Nouveau', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Aliment',
        onPress: () => router.push('/(tabs)/(journal)/library/food/new'),
      },
      {
        text: 'Recette',
        onPress: () => router.push('/(tabs)/(journal)/library/recipe/new'),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Bibliothèque',
          headerRight: () => (
            <Pressable
              onPress={add}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Nouvel aliment ou nouvelle recette"
            >
              <SymbolView name="plus" size={19} tintColor={theme.colors.accent} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <SearchField value={term} onChange={setTerm} />

        <TagFilter tags={tags.data ?? []} selected={tag} onSelect={setTag} />

        {empty ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Rien pour l’instant. Touchez + pour créer un aliment — nom, macros
            pour 100 g, et des portions si vous en utilisez — ou une recette, qui
            calcule les siennes depuis ses ingrédients.
          </Text>
        ) : null}

        {nothingMatches ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Aucun résultat pour « {term.trim()} »
            {tag === null ? '' : ` parmi les recettes « ${tag} »`}.
          </Text>
        ) : null}

        {shownRecipes.length === 0 ? null : (
          <Section title="Recettes">
            {shownRecipes.map((recipe, index) => (
              <View key={recipe.id}>
                {index === 0 ? null : <ListSeparator />}
                <RecipeRow
                  recipe={recipe}
                  onPress={() => router.push(`/(tabs)/(journal)/library/recipe/${recipe.id}`)}
                  onToggleFavorite={() =>
                    setRecipeFavorite.mutate({
                      recipeId: recipe.id,
                      isFavorite: !recipe.isFavorite,
                    })
                  }
                />
              </View>
            ))}
          </Section>
        )}

        {shownFoods.length === 0 ? null : (
          <Section title="Aliments">
            {shownFoods.map((food, index) => (
              <View key={food.id}>
                {index === 0 ? null : <ListSeparator />}
                <FoodRow
                  food={food}
                  /*
                    The per-100 figure, beside the star. It is the only calorie
                    number this screen gives a food, and it is stated against
                    the same quantity on every row — which is what lets two
                    foods be compared at a glance, and why it is never scaled
                    by display_ref_qty (D9).

                    A recipe's own figure is stated per yield unit instead, and
                    says so on its second line: two entities, two denominators,
                    each written where it is read.
                  */
                  kcal={`${formatKcal(food.reference.kcal)} kcal`}
                  onPress={() => router.push(`/(tabs)/(journal)/library/food/${food.id}`)}
                  onToggleFavorite={() =>
                    setFoodFavorite.mutate({ foodId: food.id, isFavorite: !food.isFavorite })
                  }
                />
              </View>
            ))}
          </Section>
        )}
      </ScrollView>
    </>
  );
}

/**
 * A titled card of rows.
 *
 * The heading exists only now that there are two of them: stacked cards read
 * as one list until something names them, which is the lesson slice 5 wrote
 * into the Journal when it added "Résumé" and "Alimentation". With a single
 * list there was nothing to tell apart and a title would have been noise.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
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
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  empty: { fontSize: 15, lineHeight: 21 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
