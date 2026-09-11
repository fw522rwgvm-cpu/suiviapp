import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { useFoods, useSetFoodFavorite } from '../data/food-queries';
import { searchFoods } from '../domain/food-search';
import { FoodRow } from '../components/food-row';
import { SearchField } from '../components/search-field';

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
                  <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                )}
                <FoodRow
                  food={food}
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
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 18 },
});
