import { SymbolView } from 'expo-symbols';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { addDays, currentLocalDate, type LocalDate } from '@/core/date';
import { formatDayShort } from '@/core/format';
import { useTheme } from '@/core/theme';
import {
  useAddMeal,
  useDeleteEntry,
  useDeleteMeal,
  useRenameMeal,
} from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import { DayPage } from '../components/day-page';
import { useRequestedDate } from '../hooks/requested-date';
import type { DayMealView } from '../domain/day-plan';
import { canUseKind, MEAL_KINDS } from '../domain/meal-kinds';

/**
 * The Journal (specs 8.3).
 *
 * Holds no calculation of its own (D9). What it owns is the date being looked
 * at, and the rule that looking is free: every read answers a virtual day for
 * a date with no row, and only writes materialise one.
 *
 * The date starts on the current day and is not remembered: specs 7 asks for
 * the Journal to open on today, never on the last date consulted.
 *
 * ## The day carousel
 *
 * Three days are mounted at once — yesterday, today, tomorrow relative to what
 * is on show — in a strip three screens wide, translated by one screen so the
 * middle one is centred. Dragging moves the strip with the finger, so the day
 * leaving and the day arriving move together, as one sheet of paper.
 *
 * The gesture runs on the UI thread, as a worklet. This is a reversal of what
 * slice 1 first shipped, where the gesture ran on the JS thread precisely to
 * avoid depending on the Reanimated worklets Babel plugin — a toolchain
 * failure being undiagnosable without a build. Two things changed: the plugin
 * is confirmed present (babel-preset-expo adds react-native-worklets/plugin
 * on its own as soon as the package resolves, and it does), and the Metro loop
 * now reports a failure in seconds rather than in a fifteen-minute cycle. A
 * finger-following animation driven from the JS thread stutters whenever React
 * is busy re-rendering, which here is exactly when the day changes.
 *
 * ## Why nothing flickers when the day commits
 *
 * Once the strip has slid a full screen, the middle slot has to become the new
 * day. Two things must then happen together: the pages shift by one slot, and
 * the strip returns to its resting offset. They cancel each other exactly — the
 * content moves one screen left, the strip moves one screen right — so as long
 * as both land in the same render, not a single pixel changes.
 *
 * That is what the layout effect below is for: React applies the new dates,
 * then the effect resets the offset in the same commit, before paint. Doing it
 * the other way round — resetting first, from the animation callback — would
 * show the old day snapping back into the middle for a frame or two.
 */

const SLIDE: WithTimingConfig = { duration: 220 };

/** A flick counts even when short: velocity in points per second. */
const FLICK_VELOCITY = 500;

export function JournalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // The cutoff hour is a setting (specs 8.8) whose screen arrives in slice 7.
  // Until then the default of midnight applies, through the one function that
  // decides what today is (D3).
  const [today] = useState<LocalDate>(() => currentLocalDate());
  const [date, setDate] = useState<LocalDate>(today);

  /**
   * A day asked for by the calendar screen, taken once and cleared.
   *
   * The carousel keeps owning the date: this only ever pushes one in from
   * outside. Deliberately not a route parameter — one would outlive the visit
   * that set it, and specs 7 wants the Journal on today at every launch.
   */
  const { requested, clear } = useRequestedDate();

  useEffect(() => {
    if (requested === null) return;
    setDate(requested);
    clear();
  }, [requested, clear]);

  const addMeal = useAddMeal();
  const renameMeal = useRenameMeal();
  const deleteMeal = useDeleteMeal();
  const deleteEntry = useDeleteEntry();

  const drag = useSharedValue(0);

  // Recentres the strip in the same commit that shifts the pages. See the note
  // above: the two movements cancel, so nothing moves on screen.
  useLayoutEffect(() => {
    drag.value = 0;
  }, [date, drag]);

  function step(delta: number): void {
    setDate((current) => addDays(current, delta));
  }

  const pan = Gesture.Pan()
    // Only claims the touch once the movement is clearly horizontal, and gives
    // up if it started as a vertical scroll. A swipe beginning on an entry is
    // handled by that row instead: the innermost gesture wins.
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      drag.value = event.translationX;
    })
    .onEnd((event) => {
      // A deliberate flick wins over distance: releasing fast is an intent,
      // and waiting for a quarter of the screen would make the gesture feel
      // heavy.
      const flicked =
        Math.abs(event.velocityX) > FLICK_VELOCITY ? Math.sign(event.velocityX) : 0;
      const dragged =
        Math.abs(event.translationX) > width / 4 ? Math.sign(event.translationX) : 0;
      const direction = flicked !== 0 ? flicked : dragged;

      if (direction === 0) {
        drag.value = withTiming(0, SLIDE);
        return;
      }

      // A finger moving right uncovers the page on the left, which is the day
      // before: the day moves against the direction of travel.
      const delta = -direction;
      drag.value = withTiming(direction * width, SLIDE, (finished) => {
        if (finished === true) runOnJS(step)(delta);
      });
    });

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + drag.value }],
  }));

  /**
   * The add screen of specs 8.4 — quick access, search, and free entry one tap
   * away. Slice 1 came straight here to free entry, which was the only path
   * that existed then.
   */
  function openAdd(pageDate: LocalDate, meal: DayMealView): void {
    router.push({
      pathname: '/(modals)/add-entry',
      params: { date: pageDate, mealPosition: String(meal.position) },
    });
  }

  /**
   * Editing goes to the screen that matches what the entry IS.
   *
   * A free entry is four numbers and has no quantity anyone typed, so it
   * reopens its own form. A food entry is a frozen capsule plus a quantity —
   * and the quantity is the only part of it that may change (D5/R1), so it
   * reopens on that alone.
   */
  function openEdit(pageDate: LocalDate, entry: JournalEntryView): void {
    if (entry.kind === 'food') {
      router.push({ pathname: '/(modals)/quantity', params: { entryId: entry.id } });
      return;
    }
    router.push({
      pathname: '/(modals)/free-entry',
      params: { date: pageDate, entryId: entry.id },
    });
  }

  function removeEntry(entry: JournalEntryView): void {
    // No deletion is ever blocked (specs 5.3), and past entries stay intact.
    //
    // NO CONFIRMATION, BECAUSE THE GESTURE IS ALREADY THE CONFIRMATION. One
    // was asked for here while a single swipe deleted -- easy to make by
    // accident, and irreversible. Removing now takes two gestures with the
    // button named and fully visible between them (specs 8.3), so an alert
    // would ask a second time about something already answered, and add a
    // dialog to the path of an action D16 wants to take seconds.
    deleteEntry.mutate(entry.id);
  }

  /**
   * A MODAL NOW, WHERE IT WAS AN Alert.prompt, and the prompt could not have
   * survived the change: a meal is no longer a name typed in but a choice
   * between four kinds, with four optional targets beside it. An alert holds
   * one text field and nothing else.
   */
  function promptAddMeal(pageDate: LocalDate): void {
    router.push({ pathname: '/(modals)/meal', params: { date: pageDate } });
  }

  function promptMealActions(
    pageDate: LocalDate,
    meal: DayMealView,
    siblings: readonly DayMealView[],
  ): void {
    /**
     * Only the kinds the day does not already hold, plus this meal's own.
     *
     * A day may hold one breakfast, one lunch and one dinner; offering a kind
     * that is taken and then refusing it at the write would be asking a
     * question whose answer is already known. Snacks are always offered.
     *
     * The siblings are handed in by the page that is showing them rather than
     * fetched again here: it already holds the day, and a second read could
     * answer differently from what is on screen.
     */
    const names = siblings.map((entry) => entry.name);
    const index = siblings.findIndex((entry) => entry.position === meal.position);
    const kinds = MEAL_KINDS.filter(
      (kind) => kind !== meal.name && canUseKind(names, index, kind),
    );

    Alert.alert(meal.label, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Modifier les objectifs',
        onPress: () =>
          router.push({
            pathname: '/(modals)/meal',
            params: { date: pageDate, mealPosition: String(meal.position) },
          }),
      },
      // Absent rather than disabled when every other kind is taken: a greyed
      // row in an alert is a row you try to press.
      ...(kinds.length === 0
        ? []
        : [
            {
              text: 'Changer de repas',
              onPress: () => promptMealKind(pageDate, meal, kinds),
            },
          ]),
      {
        text: 'Supprimer le repas',
        style: 'destructive' as const,
        onPress: () => deleteMeal.mutate({ date: pageDate, mealPosition: meal.position }),
      },
    ]);
  }

  function promptMealKind(
    pageDate: LocalDate,
    meal: DayMealView,
    kinds: readonly string[],
  ): void {
    const options = [...kinds, 'Annuler'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Changer de repas', options, cancelButtonIndex: options.length - 1 },
      (chosen) => {
        const name = kinds[chosen];
        if (name === undefined) return;
        renameMeal.mutate({ date: pageDate, mealPosition: meal.position, name });
      },
    );
  }

  const pageProps = {
    width,
    onAdd: openAdd,
    onEditEntry: openEdit,
    onDeleteEntry: removeEntry,
    onMealActions: promptMealActions,
    onAddMeal: promptAddMeal,
  };

  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <>
      {/*
        The day on the left, the two ways out on the right.

        DIVERGENCE, DELIBERATE: specs 8.3 asks for three ways to change day —
        previous/next buttons, direct access to a date, and the horizontal
        swipe. The buttons are gone; the other two remain. Requested, and
        recorded rather than quietly applied.
      */}
      <Stack.Screen
        options={{
          title: formatDayShort(date, today),
          headerTitleAlign: 'left',
          headerRight: () => (
            <View style={styles.headerGroup}>
              {/*
                Direct access to a date (specs 8.3), through the system's zoom
                transition: this button genuinely becomes the calendar screen,
                and the interactive dismissal brings it back into the button.

                Link.AppleZoom is what asks for it, and it animates a
                NAVIGATION — which is why the calendar is a route rather than a
                window drawn over this screen. Below iOS 18 the same navigation
                simply happens with the ordinary push; nothing here is
                conditional.

                The day being shown travels out as a parameter. The day chosen
                comes back through the request context, not through the URL.
              */}
              <Link
                href={{ pathname: '/(tabs)/(journal)/calendar', params: { date } }}
                asChild
              >
                <Link.AppleZoom>
                  <Pressable
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Choisir une date"
                  >
                    <SymbolView name="calendar" size={20} tintColor={theme.colors.accent} />
                  </Pressable>
                </Link.AppleZoom>
              </Link>

              {/* The library, reached from the Journal header (specs 7). */}
              <Pressable
                onPress={() => router.push('/(tabs)/(journal)/library')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Bibliothèque"
              >
                <SymbolView name="books.vertical" size={20} tintColor={theme.colors.accent} />
              </Pressable>
            </View>
          ),
        }}
      />

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.strip, { width: width * 3 }, stripStyle]}>
          {/*
            Keyed by date, so the three pages are reconciled by identity: on a
            step, the page that was arriving is reused rather than remounted,
            and keeps its unfolded meals and its scroll position.
          */}
          <DayPage key={previous} date={previous} active={false} {...pageProps} />
          <DayPage key={date} date={date} active {...pageProps} />
          <DayPage key={next} date={next} active={false} {...pageProps} />
        </Animated.View>
      </GestureDetector>

    </>
  );
}

const styles = StyleSheet.create({
  strip: { flex: 1, flexDirection: 'row' },
  // Padding rather than margin: it widens the touch target at the same time as
  // it pulls the icons off the edge, where a margin would only move them.
  headerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 8,
  },
});
