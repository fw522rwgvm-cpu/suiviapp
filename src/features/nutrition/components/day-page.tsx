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
  const pending = day.isPending || totals.isPending;

  return (
    /**
     * ONE SCROLLVIEW, ALWAYS — pending or not, and that is a bug fix rather
     * than a tidy-up.
     *
     * Returning a plain View while pending and a ScrollView once loaded makes
     * React swap one element type for another, which unmounts the first and
     * mounts the second. A brand-new scroll view then has its content inset
     * computed from scratch by UIKit — and with a transparent header that
     * inset is not zero, so the content visibly snapped into place. That is
     * the "page moving very fast" on a day that had not loaded yet: not the
     * carousel at all, but a scroll view being born under the header.
     *
     * Keeping one element across both states means nothing is created, nothing
     * is measured again, and the dots are simply what the page contains for a
     * frame or two.
     */
    <ScrollView
      style={[{ width }, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, pending ? styles.pendingContent : null]}
      contentInsetAdjustmentBehavior="automatic"
      scrollEnabled={!pending}
    >
      {pending ? (
        <LoadingDots label="Chargement de la journée" />
      ) : (
        <>
          <RemainingBanner
            consumed={totals.data ?? ZERO_MACROS}
            target={dayTargets(meals)}
          />

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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Cards float on the background rather than butting against each other, so
  // the gap is what separates them and the shadow is what raises them.
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  /**
   * flexGrow, not flex — and on the CONTENT container, which is a column, so
   * there is no confusion with the carousel's row. It lets the short content
   * fill the page so the dots land in the middle rather than at the top.
   */
  pendingContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
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
