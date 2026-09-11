import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useMinimumVisible } from '@/core/ui/use-minimum-visible';
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
   * COMPLETELY loaded, not merely started.
   *
   * The meal sub-totals are in here deliberately. Without them the page
   * appeared with its meals already drawn and their figures a frame behind, so
   * every card changed size as the numbers arrived — which is the settling
   * that was being seen. A day is ready when all three of its queries are.
   */
  const pending = day.isPending || totals.isPending || mealTotals.isPending;

  /**
   * Held for half a second once it has appeared at all.
   *
   * Local SQLite answers in tens of milliseconds, so the indicator was
   * spending itself as a flash — which reads as a glitch rather than as work
   * being done. The hook imposes the minimum only once waiting has actually
   * begun, so a day that was already cached still appears on the first frame.
   */
  const showDots = useMinimumVisible(pending, 500);

  return (
    /**
     * ONE SCROLLVIEW, ALWAYS, AND THE DOTS ON TOP OF IT.
     *
     * Two separate things were making a not-yet-loaded day lurch, and this
     * shape answers both at once.
     *
     * Swapping a plain View for a ScrollView when the data arrived made React
     * unmount one element type and mount another — and a brand-new scroll view
     * has its content inset computed from scratch by UIKit, which under a
     * transparent header is not zero. So the page snapped into place.
     *
     * And even with one element kept, the content goes from nothing to a full
     * day in a single commit: the scroll view resizes, and whatever UIKit does
     * about that happens in view.
     *
     * So the indicator is an OVERLAY rather than a replacement. The scroll view
     * is mounted from the first frame and fills in underneath, while an opaque
     * layer covers it until everything has arrived. Whatever settling there is
     * happens where it cannot be seen — which is the honest fix here, because
     * the exact native cause cannot be observed from a development machine.
     */
    <View style={[{ width }, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!showDots}
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

      {showDots ? (
        <View
          style={[styles.overlay, { backgroundColor: theme.colors.background }]}
          pointerEvents="auto"
        >
          <LoadingDots label="Chargement de la journée" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Cards float on the background rather than butting against each other, so
  // the gap is what separates them and the shadow is what raises them.
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  /**
   * The scroll view fills its page wrapper. NO `flex` on the wrapper itself:
   * the carousel is a row, so flex there would act on the HORIZONTAL axis and
   * fight the fixed width — Yoga would redistribute free space and the pages
   * would stop being exactly one screen wide, which the strip's whole-screen
   * translation cannot survive.
   */
  fill: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
