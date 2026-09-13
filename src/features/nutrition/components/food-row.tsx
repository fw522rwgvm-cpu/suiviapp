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
  kcal,
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
  /**
   * What `quantity` comes to in calories, already worded.
   *
   * Shown beside the + button rather than under the name, because it belongs
   * to the action: it is the price of pressing it. The "265 kcal / 100 g" on
   * the line below stays, and the two do not compete — one says what this
   * food IS, the other what this tap COSTS.
   */
  kcal?: string;
  /** Adds `quantity` straight to the basket, skipping the quantity screen. */
  onQuickAdd?: () => void;
}) {
  const theme = useTheme();

  /**
   * "Sans marque, 2 tranches (50 g)" — or either half on its own.
   *
   * Joined with a comma because they are two facts about the same thing, not a
   * heading and a value. A row with no brand and no quantity has no second
   * line at all rather than an empty one.
   */
  const brand = food.brand === null || food.brand === '' ? null : food.brand;
  const subtitle =
    brand === null
      ? (quantity ?? null)
      : quantity === undefined
        ? brand
        : `${brand}, ${quantity}`;

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
        </Text>

        {/*
          Its own line, under the name it qualifies rather than trailing after
          it. Two foods of the same name are told apart by their brand, and a
          brand chasing a long name is the half that gets cut.

          THE QUANTITY JOINS IT HERE rather than sitting beside the name, and
          that settles an arbitration rather than dodging it: on the name's
          line the two competed for width, and one of them had to give. On this
          line they do not — a brand and a quantity are both short, and a row
          with neither simply has one line fewer.
        */}
        {subtitle === null ? null : (
          <Text style={[styles.brand, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}

        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {formatKcal(food.reference.kcal)} kcal / 100 {food.baseUnit}
        </Text>
      </View>

      {kcal === undefined ? null : (
        <Text style={[styles.kcal, { color: theme.colors.text }]}>{kcal}</Text>
      )}

      {onQuickAdd === undefined ? null : (
        /*
          ONE TAP INSTEAD OF THREE, which is the only kind of optimisation D16
          says works: "the target is not met by optimising code, it is met by
          removing gestures."

          The pre-filled quantity screen already made a habitual food two taps.
          This makes it one, whenever the answer to "how much" is the same as
          last time — which, across favourites, recents and a search for
          something already in the library, is most of the time. The row itself
          still opens the quantity screen, so changing the amount costs exactly
          what it did before.

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
  name: { fontSize: 16 },
  // Not shrinkable: a calorie figure cut in half is worse than a name cut in
  // half, and it is the one number the + button is answerable for.
  kcal: { fontSize: 15, fontWeight: '500', flexShrink: 0 },
  // Between the name and the figures in weight as well as in place: it says
  // which food this is, not what it is worth.
  brand: { fontSize: 13 },
  detail: { fontSize: 12 },
});
