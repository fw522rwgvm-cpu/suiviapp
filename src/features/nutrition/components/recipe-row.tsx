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
 * ## IT SAYS TWO DIFFERENT THINGS ON THE TWO SCREENS, AND THAT IS THE RULE
 *
 * One calorie figure per row, always on the right, and what it means belongs
 * to the screen — the ruling slice 4 made for foods, applied here:
 *
 *  - THE LIBRARY states what the recipe IS: the calories of one yield unit,
 *    with the yield beside it. That is what lets two recipes be compared,
 *    which is the one thing a library is for.
 *  - THE ADD WINDOW states the PRICE OF THE TAP: the calories of the quantity
 *    the "+" would stage, with that quantity beside it.
 *
 * The caller passes `quantity` and `kcal` already worded to get the second.
 * Without them the row falls back to the first, so the library needs to say
 * nothing at all.
 *
 * Consequence, accepted and the same one slice 4 accepted: the rows of the add
 * window stop being comparable with each other, each being stated against its
 * own amount. That is correct for a screen where one LOGS rather than
 * compares, and it is why the library keeps the per-unit figure.
 */
export function RecipeRow({
  recipe,
  onPress,
  onToggleFavorite,
  quantity,
  kcal,
  onQuickAdd,
}: {
  recipe: RecipeListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
  /**
   * The amount a one-tap add would stage, already worded (specs 8.4a v2.4).
   *
   * A string rather than a number: the row shows it and does not reason about
   * it, and the wording is the one describeYield gives everywhere else. No
   * calculation in a component (D9).
   */
  quantity?: string;
  /** What `quantity` comes to in calories, already worded. */
  kcal?: string;
  /** Stages `quantity` straight into the basket, opening nothing. */
  onQuickAdd?: () => void;
}) {
  const theme = useTheme();

  /**
   * Per yield unit, for the library. Computed only when the caller has given
   * no figure of its own — the division lives in the domain's only one.
   */
  const fallbackKcal =
    kcal ?? `${formatKcal(macrosPerYieldUnit(recipe.total, recipe.yield).kcal)} kcal`;

  /**
   * "2 portions" in the add window; "4 portions · par portion" in the library.
   *
   * The tags are deliberately absent from both. They are a filter, shown as
   * chips above the list, and repeating them on every row would spend the
   * width that makes the name readable for information the user just used to
   * narrow the list.
   */
  const subtitle =
    quantity ?? `${describeYield(recipe.yield)} · ${describeYieldUnit(recipe.yield)}`;

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

      <Text style={[styles.kcal, { color: theme.colors.textMuted }]}>{fallbackKcal}</Text>

      {onQuickAdd === undefined ? null : (
        /*
          ONE TAP INSTEAD OF THREE, and it only became honest once the row had
          a quantity to show.

          Specs 8.4a v2.4 promises that the quantity a row shows IS what its
          button adds. A recipe had none to show until the last logged amount
          arrived, which is why this button was refused in slice 6 and is here
          now: the promise is keepable, through one value read once — the row,
          the button and the occurrence screen all open on the same figure.

          It is safe to be this fast BECAUSE OF THE BASKET: nothing is written
          until "Confirmer", a line added by accident is removed by a swipe,
          and the count in the header changes on the spot to say the tap
          landed.
        */
        <GlassButton
          symbol="plus"
          onPress={onQuickAdd}
          tintColor={theme.colors.accent}
          accessibilityLabel={
            quantity === undefined
              ? `Ajouter ${recipe.name}`
              : `Ajouter ${quantity} de ${recipe.name}`
          }
        />
      )}

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
