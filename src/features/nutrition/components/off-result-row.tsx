import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { isCompleteProduct, type OffProduct } from '../off/off-product';

/**
 * One Open Food Facts result.
 *
 * Deliberately shaped like FoodRow without being it: specs 8.4b wants personal
 * results first and "visually distinguished", so the two rows must read as
 * belonging to different places. The difference here is what is UNDER the
 * name — a personal row always states its calories, this one often cannot.
 *
 * ## WHY THE CALORIES ARE SOMETIMES MISSING, AND WHY THAT IS NOT A DEFECT
 *
 * Observed on 13/09/2026: the search endpoint returns products carrying only
 * kilojoules where the product endpoint supplies kcal — Open Food Facts
 * computes the conversion server-side, but only on a lookup. So a result row
 * genuinely may not know. Tapping it looks the product up by barcode, and THAT
 * is what supplies the macros a food is built from.
 *
 * Showing an em dash rather than a zero is the whole of the rule this project
 * keeps repeating: absent is not zero, at any layer, including this one.
 */
export function OffResultRow({
  product,
  onPress,
}: {
  product: OffProduct;
  onPress: () => void;
}) {
  const theme = useTheme();
  const complete = isCompleteProduct(product);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={product.name ?? 'Produit sans nom'}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.background : theme.colors.surface },
      ]}
    >
      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {/*
            A product with no name at all is rare and real. It is shown rather
            than hidden, because it can still be chosen: the detour of specs
            8.5 opens a pre-filled form, and a name is one of the fields left
            to complete.
          */}
          {product.name ?? 'Sans nom'}
        </Text>

        {product.brand === null ? null : (
          <Text style={[styles.brand, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {product.brand}
          </Text>
        )}

        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {product.kcal100 === null
            ? '— kcal / 100 g'
            : `${formatKcal(product.kcal100)} kcal / 100 g`}
        </Text>
      </View>

      {/*
        Marked before validation, as specs 8.5 requires — and marked on the
        LIST rather than only after tapping, so the detour is not a surprise.
        It says what will happen, not what is wrong: a product whose macros are
        incomplete is not a bad product, it is one that needs a form.
      */}
      {complete ? null : (
        <Text style={[styles.incomplete, { color: theme.colors.textFaint }]}>
          à compléter
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 17 },
  brand: { fontSize: 13 },
  detail: { fontSize: 13 },
  incomplete: { fontSize: 12, fontStyle: 'italic' },
});
