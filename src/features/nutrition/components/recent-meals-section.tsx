import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { formatDayShort, formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { useRecentMeals } from '../data/day-queries';
import type { RecentMeal } from '../data/day-reads';

/**
 * Recent meals, on the quick-access screen (specs 8.4a).
 *
 * > Meals: recent ones. Selecting a recent meal adds all of its entries at
 * > once to the target meal.
 *
 * ## IT FILLS THE BASKET NOW, LIKE EVERYTHING ELSE ON THIS SCREEN
 *
 * It used to write and close, and that was a considered exception: specs 8.4a
 * says selecting a recent meal "adds all of its entries AT ONCE", and the
 * basket rule of 8.4 v2.3 names only the two things it governs — choosing a
 * food and typing a free entry. Staging it looked like turning one tap into
 * one tap plus a confirmation.
 *
 * REVERSED ON REQUEST, and the argument against it was weaker than it looked:
 * the cost is one tap on a "Confirmer" that is already there for the rest of
 * the meal, and what it buys is that a recent meal can be combined with a
 * food, corrected before it lands, and removed without having been written.
 * Three things the exception made impossible. "AT ONCE" is satisfied by the
 * one gesture that fills the basket; nothing in 8.4a says the gesture has to
 * reach the database.
 *
 * The panel no longer closes either — the basket is the destination, and it is
 * confirmed with whatever else is in it.
 */
export function RecentMealsSection({
  mealPosition,
  onPick,
}: {
  /** Null while no meal is targeted; the section then renders nothing. */
  mealPosition: number | null;
  /** Stages the meal. Nothing is written until "Confirmer" (specs 8.4 v2.3). */
  onPick: (meal: RecentMeal) => void;
}) {
  const theme = useTheme();
  // Read once and frozen for the life of the panel, as the Journal does: one
  // function decides what today is (D3), and a label must not change under a
  // list because midnight went past while it was open.
  const [today] = useState<LocalDate>(() => currentLocalDate());
  const recents = useRecentMeals();

  const meals = recents.data ?? [];

  if (mealPosition === null) return null;

  if (meals.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
        Aucun repas récent. Ils apparaissent ici dès qu’un repas a été enregistré.
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
              onPress={() => onPick(meal)}
              accessibilityRole="button"
              // VoiceOver gets the COUNT as well as the names: it reads the
              // whole label whatever the width, so nothing is cut here and
              // "huit lignes" is the summary the sighted reader gets from the
              // ellipsis.
              accessibilityLabel={
                `${meal.name} du ${formatDayShort(meal.date, today)}, ` +
                `${meal.entryCount} ${meal.entryCount === 1 ? 'ligne' : 'lignes'} : ` +
                `${describeMealContents(meal)}, ${formatKcal(meal.kcal)} kcal`
              }
              style={styles.row}
            >
              <View style={styles.text}>
                <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                  {meal.name}
                </Text>
                {/*
                  WHAT IS IN IT, not how much of it there is.
                  
                  "8 lignes" says how big the meal was and never what it was:
                  two meals of eight lines are told apart by nothing at all,
                  which is the one thing this list has to do. The names are
                  what was chosen — a grouped recipe contributes its own name
                  rather than its ingredients.

                  ONE LINE, cut by the platform. Nothing measures it: a list
                  that fits is rare and a list that is cut still names the
                  first two or three things, which is what identifies the meal.
                */}
                <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {`${formatDayShort(meal.date, today)} · ${describeMealContents(meal)}`}
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

/**
 * The things a meal was made of, as one line.
 *
 * Joined with a comma because they are a list of peers, where the "·" of the
 * rows elsewhere separates facts of different kinds — here the date is the
 * other kind and keeps the dot.
 *
 * Falls back to the count when there is nothing to name, which cannot happen
 * for a meal the query returned (it joins on at least one entry) but would
 * otherwise render a dangling separator.
 */
function describeMealContents(meal: { entryNames: readonly string[]; entryCount: number }): string {
  if (meal.entryNames.length === 0) {
    return meal.entryCount === 1 ? '1 ligne' : `${meal.entryCount} lignes`;
  }
  return meal.entryNames.join(', ');
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
