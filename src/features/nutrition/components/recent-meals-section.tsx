import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { formatDayShort, formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { useDismiss } from '@/core/ui/overlay-panel';
import { useAddRecentMeal, useRecentMeals } from '../data/day-queries';
import { searchFoods } from '../domain/food-search';

/**
 * Recent meals, on the quick-access screen (specs 8.4a).
 *
 * > Meals: recent ones. Selecting a recent meal adds all of its entries at
 * > once to the target meal.
 *
 * ## IT WRITES DIRECTLY, WHERE EVERYTHING ELSE ON THIS SCREEN IS STAGED
 *
 * A tension worth naming rather than smoothing over. Specs 8.4 v2.3 says
 * nothing is written before "Confirmer"; 8.4a says selecting a recent meal
 * "adds all of its entries AT ONCE". The basket rule names the two things it
 * governs — choosing a food, and typing a free entry — and a recent meal is
 * neither: it is a whole meal in one gesture, which is its entire reason to
 * exist. Staging it would turn one tap into one tap plus a confirmation, for
 * the one action on this screen that is already complete when it is made.
 *
 * So it writes, in one transaction, and closes. It is undone the way any other
 * line is: swipe, then tap.
 */
export function RecentMealsSection({
  date,
  mealPosition,
  term = '',
}: {
  date: LocalDate;
  /** Null while no meal is targeted; the section then renders nothing. */
  mealPosition: number | null;
  /**
   * Narrows the list by name.
   *
   * A recent meal is a PAST MEAL, so there is no wider library to fall back on
   * the way the foods and the recipes have one: searching here can only filter
   * what is already there. Said plainly because the other two lists behave
   * differently under the same field, and the difference is a fact about meals
   * rather than an inconsistency.
   */
  term?: string;
}) {
  const theme = useTheme();
  // Read once and frozen for the life of the panel, as the Journal does: one
  // function decides what today is (D3), and a label must not change under a
  // list because midnight went past while it was open.
  const [today] = useState<LocalDate>(() => currentLocalDate());
  // Inside the panel, so this folds the window away rather than cutting it.
  const dismiss = useDismiss();

  const recents = useRecentMeals();
  const add = useAddRecentMeal();

  const all = recents.data ?? [];
  // Through the same pure function the foods and the recipes use, so "matches"
  // means one thing on this screen. A meal has no brand, which the searchable
  // shape has allowed since slice 6.
  const meals = term.trim() === '' ? all : searchFoods(all, term);

  if (mealPosition === null) return null;

  if (meals.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
        {all.length === 0
          ? 'Aucun repas récent. Ils apparaissent ici dès qu’un repas a été enregistré.'
          : `Aucun repas récent pour « ${term.trim()} ».`}
      </Text>
    );
  }

  return (
    // NO HEADING OF ITS OWN since slice 6: the filter above the list already
    // says "Repas", and a card headed by the name of the tab that selected it
    // is the same word twice in the space of an inch.
    <View style={styles.section}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {meals.map((meal, index) => (
          <View key={meal.mealId}>
            {index === 0 ? null : <ListSeparator />}
            <Pressable
              onPress={() =>
                add.mutate(
                  { date, mealPosition, sourceMealId: meal.mealId },
                  { onSuccess: dismiss },
                )
              }
              accessibilityRole="button"
              accessibilityLabel={
                `${meal.name} du ${formatDayShort(meal.date, today)}, ` +
                `${meal.entryCount} lignes, ${formatKcal(meal.kcal)} kcal`
              }
              style={styles.row}
            >
              <View style={styles.text}>
                <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                  {meal.name}
                </Text>
                <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {`${formatDayShort(meal.date, today)} · ` +
                    `${meal.entryCount === 1 ? '1 ligne' : `${meal.entryCount} lignes`}`}
                </Text>
              </View>

              {/* The price of the tap, in the same voice as a food row (8.4a v2.4). */}
              <Text style={[styles.kcal, { color: theme.colors.textMuted }]}>
                {`${formatKcal(meal.kcal)} kcal`}
              </Text>
              <SymbolView name="plus.circle" size={22} tintColor={theme.colors.accent} />
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={[styles.note, { color: theme.colors.textFaint }]}>
        Les quantités sont celles du repas d’origine ; les macros sont celles que vos
        aliments portent aujourd’hui.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 9 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 52,
    paddingVertical: 8,
  },
  text: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  kcal: { fontSize: 13, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 16, marginHorizontal: 4 },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
