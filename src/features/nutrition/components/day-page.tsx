import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useDay, useDayTotals, useMealTotals } from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import { dayTargets, type DayMealView } from '../domain/day-plan';
import { ZERO_MACROS } from '../domain/macros';
import { MealSection } from './meal-section';
import { RemainingBanner } from './remaining-banner';

/**
 * One day of the journal, as a single page of the carousel.
 *
 * Pulled out of the screen so three of them can be mounted side by side: the
 * day being swiped away and the one arriving have to be drawn at the same
 * time, which means both must really exist.
 *
 * Each page runs its own queries. That is three times the reads, and they cost
 * nothing worth counting: the banner is one aggregated query and the meal
 * sub-totals one grouped query (D16), the entries of a meal are only fetched
 * when it is unfolded, and React Query keeps the neighbours warm, so swiping
 * back and forth hits the cache rather than SQLite.
 *
 * Above all it writes nothing. A page is mounted for a date that may have no
 * row at all, and reading it answers a virtual day — swiping through three
 * months still materialises nothing (specs 8.2).
 */
export function DayPage({
  date,
  width,
  onAdd,
  onEditEntry,
  onDeleteEntry,
  onMealActions,
  onAddMeal,
}: {
  date: LocalDate;
  width: number;
  onAdd: (date: LocalDate, meal: DayMealView) => void;
  onEditEntry: (date: LocalDate, entry: JournalEntryView) => void;
  onDeleteEntry: (entry: JournalEntryView) => void;
  onMealActions: (date: LocalDate, meal: DayMealView) => void;
  onAddMeal: (date: LocalDate) => void;
}) {
  const theme = useTheme();
  const day = useDay(date);
  const totals = useDayTotals(date);
  const mealTotals = useMealTotals(date);

  const meals = day.data?.meals ?? [];

  /**
   * Nothing to draw yet.
   *
   * Almost never true: SQLite is synchronous and local, and React Query keeps
   * the two neighbouring days warm, so a swipe normally hits the cache and the
   * page is there on the first frame. What is left is the cold case — a day
   * far from anything cached, reached from the calendar on a long history.
   * Drawing an empty day there would be a lie: it would look exactly like a
   * day with nothing logged.
   */
  if (day.isPending || totals.isPending) {
    return (
      <View
        style={[styles.pending, { width, backgroundColor: theme.colors.background }]}
      >
        <LoadingDots label="Chargement de la journée" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[{ width }, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <RemainingBanner consumed={totals.data ?? ZERO_MACROS} target={dayTargets(meals)} />

      {meals.map((meal) => (
        <MealSection
          key={meal.id ?? `virtual-${meal.position}`}
          meal={meal}
          total={meal.id === null ? undefined : mealTotals.data?.get(meal.id)}
          onAdd={() => onAdd(date, meal)}
          onEditEntry={(entry) => onEditEntry(date, entry)}
          onDeleteEntry={onDeleteEntry}
          onLongPress={() => onMealActions(date, meal)}
        />
      ))}

      <Pressable
        onPress={() => onAddMeal(date)}
        accessibilityRole="button"
        style={[styles.addMeal, { borderColor: theme.colors.border }]}
      >
        <Text style={[styles.addMealLabel, { color: theme.colors.accent }]}>
          Ajouter un repas
        </Text>
      </Pressable>

      <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
        Appui long sur un repas pour le renommer ou le supprimer.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Cards float on the background rather than butting against each other, so
  // the gap is what separates them and the shadow is what raises them.
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  /**
   * NO `flex: 1` HERE, and that is the whole of it.
   *
   * The carousel is a row, so flex acts on the HORIZONTAL axis: a page with
   * both `flex: 1` and a fixed width asks Yoga to distribute free space among
   * the three, and the widths stop being exactly one screen each. The strip is
   * translated by whole screens, so as soon as one page is a few points off,
   * every offset is wrong and the day visibly jumps.
   *
   * It only showed while a page was pending — which is the page being
   * pre-mounted off screen, one swipe ahead. The sibling ScrollViews carry no
   * flex either; they fill the height because the row stretches its children
   * on the cross axis by default, and so does this.
   */
  pending: { alignItems: 'center', justifyContent: 'center' },
  addMeal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    borderStyle: 'dashed',
    paddingVertical: 16,
    alignItems: 'center',
  },
  addMealLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
});
