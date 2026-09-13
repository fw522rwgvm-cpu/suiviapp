import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useFoods, useSetFoodFavorite } from '../data/food-queries';
import { searchFoods } from '../domain/food-search';
import { FoodRow } from '../components/food-row';
import { SearchField } from '../components/search-field';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * The food library (specs 7, 8.5).
 *
 * > Creation, modification, deletion of foods. Management of named portions
 * > with their quantity in base units. Marking favourites.
 *
 * Reached by an icon in the Journal header (specs 7), and pushed inside the
 * Journal's own native stack rather than presented from the root: the tab bar
 * stays, the back gesture is the system's, and the rule across the whole slice
 * stays legible — BROWSING IS A PUSH, ADDING IS A MODAL.
 *
 * Recipes get their own section here in slice 6; the screen is a single list
 * today because there is exactly one thing to list.
 *
 * Holds no calculation (D9) and no query of its own beyond the hooks: the
 * search is a pure function over the one cached list (domain/food-search.ts).
 */
export function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [term, setTerm] = useState('');

  const foods = useFoods();
  const setFavorite = useSetFoodFavorite();

  // Filtered in memory, on every keystroke, with no query behind it (D16).
  const shown = useMemo(() => searchFoods(foods.data ?? [], term), [foods.data, term]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Bibliothèque',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(tabs)/(journal)/library/food/new')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Nouvel aliment"
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

        {foods.data !== undefined && foods.data.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Aucun aliment pour l’instant. Touchez + pour en créer un : nom,
            macros pour 100 g, et des portions si vous en utilisez.
          </Text>
        ) : null}

        {foods.data !== undefined && foods.data.length > 0 && shown.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Aucun résultat pour « {term.trim()} ».
          </Text>
        ) : null}

        {shown.length === 0 ? null : (
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
            {shown.map((food, index) => (
              <View key={food.id}>
                {index === 0 ? null : (
                  <ListSeparator />
                )}
                <FoodRow
                  food={food}
                  /*
                    The per-100 figure, now beside the star instead of on a
                    line of its own. It is the only calorie number this screen
                    has, and it is stated against the same quantity on every
                    row — which is what lets two foods be compared at a glance,
                    and why it is never scaled by display_ref_qty (D9).
                  */
                  kcal={`${formatKcal(food.reference.kcal)} kcal`}
                  onPress={() =>
                    router.push(`/(tabs)/(journal)/library/food/${food.id}`)
                  }
                  onToggleFavorite={() =>
                    setFavorite.mutate({ foodId: food.id, isFavorite: !food.isFavorite })
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
