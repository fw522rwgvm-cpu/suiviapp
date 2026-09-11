import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodListItem } from '../data/food-reads';

/**
 * One food in a list — the library, the search, quick access.
 *
 * No calculation of its own (D9): the macros arrive for 100 base units,
 * already read, and are shown as such. This row deliberately never scales them
 * by display_ref_qty: a list where each line is stated against a different
 * quantity cannot be compared at a glance, which is the one thing a list is
 * for.
 *
 * The star is a tap target of its own, so marking a favourite from the library
 * costs one tap and does not open the editor (specs 8.5).
 */
export function FoodRow({
  food,
  onPress,
  onToggleFavorite,
}: {
  food: FoodListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
}) {
  const theme = useTheme();

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
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {food.name}
          {food.brand === null ? '' : ` · ${food.brand}`}
        </Text>
        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {formatKcal(food.reference.kcal)} kcal / 100 {food.baseUnit}
        </Text>
      </View>

      {onToggleFavorite === undefined ? null : (
        /*
          A bordered icon button rather than a bare glyph. A star drawn on its
          own reads as a badge — something the row is telling you — where this
          reads as something you can press. It is also a 34pt target inside a
          row whose whole surface is already a different button, so the two
          must not be ambiguous.
        */
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: food.isFavorite }}
          accessibilityLabel={food.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          style={({ pressed }) => [
            styles.favorite,
            {
              backgroundColor: pressed ? theme.colors.border : theme.colors.background,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <SymbolView
            name={food.isFavorite ? 'star.fill' : 'star'}
            size={17}
            tintColor={food.isFavorite ? theme.colors.accent : theme.colors.textFaint}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 16 },
  detail: { fontSize: 13 },
  favorite: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
