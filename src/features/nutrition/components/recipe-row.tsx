import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import type { RecipeListItem } from '../data/recipe-reads';
import { macrosPerYieldUnit } from '../domain/recipe-macros';
import { describeYield, describeYieldUnit } from './recipe-text';

/**
 * One recipe in a list — the library, the search, quick access.
 *
 * Built to read as FoodRow's twin, because they sit in the same list and a
 * second visual grammar would make the library two screens stacked. Same
 * layout, same star, same single calorie figure on the right.
 *
 * ## NO "+" BUTTON, AND THAT IS A DELIBERATE ASYMMETRY
 *
 * Specs 8.4a v2.4 promises that the quantity a row shows IS the quantity its
 * button adds. A food can honour that: it has the four-step pre-fill chain of
 * specs 8.4 behind it. A recipe has no equivalent — specs 8.6 makes the
 * consumed quantity the FIRST thing it asks for, and there is no "last time"
 * to fall back on.
 *
 * So a "+" here would either invent a quantity or open a screen, and both
 * break the promise the food rows just made. Touching the row opens the
 * quantity step instead, which is what the recipe journey needs anyway.
 *
 * Reserve recorded: if a recipe pre-fill is ever wanted, the window function
 * behind lastEntriesByFood generalises to source_recipe_id with no schema
 * change — only an index, and indexes are the reversible part.
 *
 * ## THE CALORIE FIGURE, AND WHAT IT IS STATED AGAINST
 *
 * One number, on the right, like every other row in the application. Here it
 * is what ONE YIELD UNIT is worth — one portion, or 100 g — and the line under
 * the name says which. A recipe's whole total would be a bigger number that
 * nobody eats, and a figure with no denominator beside it cannot be compared
 * with the row above.
 *
 * The division happens in macrosPerYieldUnit, the domain's only one; the row
 * calculates nothing (D9).
 */
export function RecipeRow({
  recipe,
  onPress,
  onToggleFavorite,
}: {
  recipe: RecipeListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
}) {
  const theme = useTheme();
  const perUnit = macrosPerYieldUnit(recipe.total, recipe.yield);

  /**
   * "4 portions · par portion" — what it makes, then what the figure means.
   *
   * The tags are deliberately not here. They are a filter, shown as chips
   * above the list, and repeating them on every row would spend the width that
   * makes the name readable for information the user just used to narrow the
   * list.
   */
  const subtitle = `${describeYield(recipe.yield)} · ${describeYieldUnit(recipe.yield)}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.background : theme.colors.surface },
      ]}
    >
      <View style={styles.identity}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {recipe.name}
          </Text>

          {recipe.hasFrozenIngredient ? (
            /*
              A recipe holding at least one ingredient whose food is gone
              (specs 5.3). Quiet, and never an error: the figures are intact
              and the recipe works. What the mark says is that those lines have
              stopped following corrections — which is the one thing about this
              recipe a user could not otherwise find out without opening it.
            */
            <SymbolView
              name="link.badge.plus"
              size={13}
              tintColor={theme.colors.textFaint}
              accessibilityLabel="Contient un ingrédient dont l’aliment a été supprimé"
            />
          ) : null}
        </View>

        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Text style={[styles.kcal, { color: theme.colors.textMuted }]}>
        {formatKcal(perUnit.kcal)} kcal
      </Text>

      {onToggleFavorite === undefined ? null : (
        <GlassButton
          symbol={recipe.isFavorite ? 'star.fill' : 'star'}
          onPress={onToggleFavorite}
          selected={recipe.isFavorite}
          tintColor={recipe.isFavorite ? theme.colors.accent : theme.colors.textMuted}
          accessibilityLabel={recipe.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        />
      )}
    </Pressable>
  );
}

/** FoodRow's metrics, to the point. The two sit in one list. */
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  identity: { flex: 1, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  subtitle: { fontSize: 13 },
  kcal: { fontSize: 15, flexShrink: 0 },
});
