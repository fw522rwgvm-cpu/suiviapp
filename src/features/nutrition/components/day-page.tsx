import { useHeaderHeight } from 'expo-router/build/react-navigation/elements';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useMinimumVisible } from '@/core/ui/use-minimum-visible';
import { useDay, useDayTotals, useMealTotals } from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import { dayTargets, type DayMealView } from '../domain/day-plan';
import { ZERO_MACROS } from '../domain/macros';
import { DayPlanRow } from './day-plan-row';
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
  active,
  onAdd,
  onEditEntry,
  onDeleteEntry,
  onMealActions,
  onAddMeal,
}: {
  date: LocalDate;
  width: number;
  /** True for the page in the middle of the strip — the one being looked at. */
  active: boolean;
  onAdd: (date: LocalDate, meal: DayMealView) => void;
  onEditEntry: (date: LocalDate, entry: JournalEntryView) => void;
  onDeleteEntry: (entry: JournalEntryView) => void;
  onMealActions: (date: LocalDate, meal: DayMealView) => void;
  onAddMeal: (date: LocalDate) => void;
}) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  /**
   * THE INSETS ARE DECLARED, NOT INHERITED — so that zero means the top.
   *
   * With contentInsetAdjustmentBehavior="automatic" the system pushes the
   * content below the transparent header by setting adjustedContentInset, and
   * the resting position becomes MINUS that inset rather than zero. The value
   * cannot be read back: the scroll event carries contentInset, which automatic
   * adjustment leaves at zero (RCTScrollView sends scrollView.contentInset, not
   * adjustedContentInset).
   *
   * Aiming at -useHeaderHeight() was close, and close is the problem. It needs
   * scrollToOverflowEnabled to get past RCTScrollView's clamp, and that same
   * prop lets an aim that is a few points too generous OVERSHOOT — the content
   * then rests lower than its top, leaving a band of nothing under the bar,
   * with nothing to pull it back.
   *
   * Declaring the padding removes the guess entirely: the top is zero, the
   * clamp protects it, and no overshoot is reachable. The cost is owning the
   * bottom as well, since "never" drops that inset too — content passing under
   * the tab bar is the iOS 26 intent anyway, so what is needed there is only
   * enough room to read the last row clear of it.
   */
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
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
   * Held for a full second once it has appeared at all.
   *
   * Local SQLite answers in tens of milliseconds, so the indicator was
   * spending itself as a flash — which reads as a glitch rather than as work
   * being done. The hook imposes the minimum only once waiting has actually
   * begun, so a day that was already cached still appears on the first frame,
   * and only a genuinely cold day is ever held.
   */
  const showDots = useMinimumVisible(pending, 1000);

  /**
   * A day is put back to the top WHEN IT IS LEFT, not when it is returned to.
   *
   * The three pages are reconciled by date, so the one you swipe away from
   * stays mounted with its scroll where you left it — and coming back showed it
   * half way down. Slice 1 kept that deliberately, to preserve unfolded meals
   * and position; keeping the meals is still right, keeping the scroll is not.
   *
   * Doing it on arrival worked and could be SEEN doing it: the page was already
   * on screen, so it appeared at its old offset and then jumped. On departure
   * it has just moved a full screen sideways and is out of view.
   */
  useEffect(() => {
    if (active) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [active]);

  /**
   * And again the moment the day's content arrives.
   *
   * A page that mounts empty has nothing to scroll, so the reset above lands on
   * a view with no content and achieves nothing; the rows then appear at
   * whatever offset the scroll view settles on. This second pass runs while the
   * indicator is still covering the page — it is held a full second — so the
   * correction happens out of sight, exactly like the one on departure.
   */
  useEffect(() => {
    if (pending) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [pending]);

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
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 96 },
        ]}
        contentInsetAdjustmentBehavior="never"
        scrollEnabled={!showDots}
      >
        {/*
          Two headings where there were none, and they do the work a card
          cannot do on its own: say what it is. The banner and the meals are
          two different questions — what the day comes to, and what was eaten —
          and stacked cards read as one list until something names them.

          Left-aligned and bold, the way a section title is everywhere else in
          the application: they belong to the page, not to the card under them.
        */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Résumé</Text>

        <RemainingBanner consumed={totals.data ?? ZERO_MACROS} target={dayTargets(meals)} />

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Alimentation</Text>

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

        {/*
          Where these meals came from, at the foot of the list they describe.
          Only the active page renders it: the neighbours are drawn for the
          swipe, and an action on a page nobody is looking at is a tap waiting
          to be made by accident.
        */}
        {active ? (
          <DayPlanRow
            date={date}
            materialized={day.data?.materialized ?? false}
            templateName={day.data?.templateName ?? null}
          />
        ) : null}

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
  content: { paddingHorizontal: 16, gap: 14 },
  /**
   * Pulled down onto the card below it and away from the one above: a heading
   * belongs to what follows it, and an even gap on both sides would make it
   * float between two things instead of introducing one.
   */
  sectionTitle: { fontSize: 22, fontWeight: '700', marginTop: 10, marginBottom: -6 },
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
});
