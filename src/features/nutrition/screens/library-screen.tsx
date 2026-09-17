import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { Segmented } from '@/core/ui/segmented';
import { useFoods, useSetFoodFavorite } from '../data/food-queries';
import { useRecipeTags, useRecipes, useSetRecipeFavorite } from '../data/recipe-queries';
import { searchFoods } from '../domain/food-search';
import { FoodRow } from '../components/food-row';
import { RecipeRow } from '../components/recipe-row';
import { SearchField } from '../components/search-field';
import { TagFilter } from '../components/tag-filter';
import { libraryEmptyMessage, type LibraryKind } from '../components/library-text';

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
 * ## ONE KIND AT A TIME, WITH ONE SEARCH FIELD
 *
 * Specs 7 names both in one breath, and they were stacked at first: recipes,
 * then foods, both filtered by the same term. A segmented filter under the
 * field now selects which — always exactly one, never none, foods by default,
 * the same control and the same rule as the add window.
 *
 * Why a filter rather than two stacked sections: a library holds far more
 * foods than recipes, so the recipes were either above the foods and in the
 * way, or below them and past a scroll. Neither is a place to put the smaller
 * of two lists.
 *
 * The search stays one field because the user's question is "where is my thing
 * called X", not "is my thing called X a food or a recipe" — and both searches
 * are pure functions over lists that are already cached, so running one costs
 * a pass (D16, specs 8.4b).
 *
 * The tag row belongs to the recipes and appears only with them: under the
 * foods it would be a control that narrows nothing.
 *
 * Holds no calculation (D9) and no query of its own beyond the hooks.
 */
const KINDS: readonly { value: LibraryKind; label: string }[] = [
  { value: 'foods', label: 'Aliments' },
  { value: 'recipes', label: 'Recettes' },
];

export function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [kind, setKind] = useState<LibraryKind>('foods');

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

  const showingFoods = kind === 'foods';
  const held = showingFoods ? (foods.data?.length ?? 0) : (recipes.data?.length ?? 0);
  const shown = showingFoods ? shownFoods : shownRecipes;

  /**
   * The header's + creates whatever kind is selected.
   *
   * It used to ask, in an action sheet with two answers. The filter has just
   * made the answer visible on screen, so asking it again would be asking a
   * question the user has already answered — two taps for something that is
   * now one, every single time. Creating the other kind costs one tap on the
   * filter, and is then predictable rather than remembered.
   */
  function add(): void {
    router.push(
      showingFoods
        ? '/library/food/new'
        : '/library/recipe/new',
    );
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
              accessibilityLabel={showingFoods ? 'Nouvel aliment' : 'Nouvelle recette'}
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

        {/*
          Directly under the field it narrows, as in the add window: read top
          down it says "look for this — among these".
        */}
        <Segmented options={KINDS} value={kind} onChange={setKind} grow />

        {/* Recipes only: under the foods it would narrow nothing. */}
        {showingFoods ? null : (
          <TagFilter tags={tags.data ?? []} selected={tag} onSelect={setTag} />
        )}

        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            {libraryEmptyMessage({
              kind,
              held,
              term: term.trim(),
              tag: showingFoods ? null : tag,
            })}
          </Text>
        ) : (
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
            {showingFoods
              ? shownFoods.map((food, index) => (
                  <View key={food.id}>
                    {index === 0 ? null : <ListSeparator />}
                    <FoodRow
                      food={food}
                      /*
                        The per-100 figure, beside the star. It is the only
                        calorie number this screen gives a food, and it is
                        stated against the same quantity on every row — which
                        is what lets two foods be compared at a glance, and why
                        it is never scaled by display_ref_qty (D9).

                        A recipe's own figure is stated per yield unit instead,
                        and says so on its second line: two entities, two
                        denominators, each written where it is read.
                      */
                      kcal={`${formatKcal(food.reference.kcal)} kcal`}
                      onPress={() => router.push(`/library/food/${food.id}`)}
                      onToggleFavorite={() =>
                        setFoodFavorite.mutate({ foodId: food.id, isFavorite: !food.isFavorite })
                      }
                    />
                  </View>
                ))
              : shownRecipes.map((recipe, index) => (
                  <View key={recipe.id}>
                    {index === 0 ? null : <ListSeparator />}
                    <RecipeRow
                      recipe={recipe}
                      onPress={() => router.push(`/library/recipe/${recipe.id}`)}
                      onToggleFavorite={() =>
                        setRecipeFavorite.mutate({
                          recipeId: recipe.id,
                          isFavorite: !recipe.isFavorite,
                        })
                      }
                    />
                  </View>
                ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  empty: { fontSize: 15, lineHeight: 21 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
