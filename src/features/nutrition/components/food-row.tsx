import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
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
  quantity,
  onQuickAdd,
}: {
  food: FoodListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
  /**
   * The last quantity logged for this food, already worded (specs 8.4a).
   *
   * A string rather than a QuantityChoice: the row shows it and does not
   * reason about it, and the wording is the same one the basket uses — see
   * formatChoiceQuantity. No calculation in a component (D9).
   *
   * Supplied only in Recents. Favourites and search results have no "last
   * time" to speak of, and a food never logged has nothing to repeat.
   */
  quantity?: string;
  /** Adds `quantity` straight to the basket, skipping the quantity screen. */
  onQuickAdd?: () => void;
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
        {/*
          Name and quantity on one line, the way a basket line is laid out —
          the same fact in the same shape, so the two lists read alike.
        */}
        <View style={styles.heading}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {food.name}
          </Text>
          {/*
            WHERE THIS DIVERGES FROM THE BASKET, deliberately. A basket row
            drops the quantity rather than let the name be truncated, because
            half a name identifies nothing. Here the quantity survives and the
            name gives way, because the quantity is ACTIONABLE: it says what
            the + button is about to add, and hiding it would leave a button
            that adds an unstated amount. The food is identified twice over
            anyway — by its brand underneath, and by the fact that the user is
            looking at a list of what they themselves ate.
          */}
          {quantity === undefined ? null : (
            <Text style={[styles.quantity, { color: theme.colors.textMuted }]}>
              {quantity}
            </Text>
          )}
        </View>

        {/*
          Its own line, under the name it qualifies rather than trailing after
          it. Two foods of the same name are told apart by their brand, and a
          brand chasing a long name is the half that gets cut.
        */}
        {food.brand === null || food.brand === '' ? null : (
          <Text style={[styles.brand, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {food.brand}
          </Text>
        )}

        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {formatKcal(food.reference.kcal)} kcal / 100 {food.baseUnit}
        </Text>
      </View>

      {onQuickAdd === undefined ? null : (
        /*
          ONE TAP INSTEAD OF THREE, which is the only kind of optimisation D16
          says works: "the target is not met by optimising code, it is met by
          removing gestures."
          
          The pre-filled quantity screen already made a habitual food two taps.
          This makes it one, for the case where the answer to "how much" is
          the same as last time — which for a recent food is most of the time.
          The row itself still opens the quantity screen, so changing the
          amount costs exactly what it did before.
          
          It is safe to be this fast BECAUSE OF THE BASKET: nothing is written
          until "Confirmer", a line added by accident is removed by a swipe,
          and the count in the header button changes on the spot to say the tap
          landed. A one-tap write straight to the journal would need a
          confirmation; a one-tap basket line needs none.
          
          Glass, like the star: a list row is content, and content gets no
          material from the system for free.
        */
        <GlassButton
          symbol="plus"
          onPress={onQuickAdd}
          tintColor={theme.colors.accent}
          accessibilityLabel={
            quantity === undefined
              ? `Ajouter ${food.name}`
              : `Ajouter ${quantity} de ${food.name}`
          }
        />
      )}

      {onToggleFavorite === undefined ? null : (
        /*
          Glass, the same material UIKit gives the native header's buttons on
          this very screen — which is the look being matched.

          The state lives in the symbol, filled or outlined, rather than in the
          material: the glass says "press me", and it has to say that whether
          or not the food is a favourite.
        */
        <GlassButton
          symbol={food.isFavorite ? 'star.fill' : 'star'}
          onPress={onToggleFavorite}
          selected={food.isFavorite}
          tintColor={food.isFavorite ? theme.colors.accent : theme.colors.textMuted}
          accessibilityLabel={
            food.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
          }
        />
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
  identity: { flex: 1, gap: 1 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // flexShrink on the name and not on the quantity: when space runs out it is
  // the name that gives way. See the note above the quantity.
  name: { fontSize: 16, flexShrink: 1 },
  quantity: { fontSize: 13, flexShrink: 0 },
  // Between the name and the figures in weight as well as in place: it says
  // which food this is, not what it is worth.
  brand: { fontSize: 13 },
  detail: { fontSize: 12 },
});
