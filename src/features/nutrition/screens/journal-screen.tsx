import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
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
import { formatDayTitle } from '@/core/format';
import { useTheme } from '@/core/theme';
import {
  useAddMeal,
  useDeleteEntry,
  useDeleteMeal,
  useRenameMeal,
} from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import { DayPage } from '../components/day-page';
import { MonthCalendar } from '../components/month-calendar';
import type { DayMealView } from '../domain/day-plan';

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

  // A plain React Native modal rather than a route: the date is screen state,
  // and routing it out and back would mean plumbing a return value through the
  // router for a sheet that closes on selection.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<LocalDate>(today);

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

  /**
   * Slides a whole screen and then commits. Shared by the gesture and by the
   * header chevrons, so a tap and a swipe land the same way.
   */
  function slideTo(delta: -1 | 1): void {
    drag.value = withTiming(delta === 1 ? -width : width, SLIDE, (finished) => {
      // finished is false when a new gesture interrupted this animation, in
      // which case the day must not change under the finger.
      if (finished === true) runOnJS(step)(delta);
    });
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

  function openAdd(pageDate: LocalDate, meal: DayMealView): void {
    router.push({
      pathname: '/(modals)/free-entry',
      params: { date: pageDate, mealPosition: String(meal.position) },
    });
  }

  function openEdit(pageDate: LocalDate, entry: JournalEntryView): void {
    router.push({
      pathname: '/(modals)/free-entry',
      params: { date: pageDate, entryId: entry.id },
    });
  }

  function confirmDeleteEntry(entry: JournalEntryView): void {
    // No deletion is ever blocked (specs 5.3), and past entries stay intact.
    // The confirmation is here because a swipe is easy to make by accident,
    // not because the application has an opinion about deleting.
    Alert.alert(`Supprimer « ${entry.name} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteEntry.mutate(entry.id) },
    ]);
  }

  function promptAddMeal(pageDate: LocalDate): void {
    Alert.prompt('Nouveau repas', 'Son nom', (name) => {
      const trimmed = name.trim();
      if (trimmed !== '') addMeal.mutate({ date: pageDate, name: trimmed });
    });
  }

  function promptMealActions(pageDate: LocalDate, meal: DayMealView): void {
    Alert.alert(meal.name, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Renommer',
        onPress: () =>
          Alert.prompt(
            'Renommer le repas',
            undefined,
            (name) => {
              const trimmed = name.trim();
              if (trimmed !== '') {
                renameMeal.mutate({ date: pageDate, mealPosition: meal.position, name: trimmed });
              }
            },
            'plain-text',
            meal.name,
          ),
      },
      {
        text: 'Supprimer le repas',
        style: 'destructive',
        onPress: () => deleteMeal.mutate({ date: pageDate, mealPosition: meal.position }),
      },
    ]);
  }

  const pageProps = {
    width,
    onAdd: openAdd,
    onEditEntry: openEdit,
    onDeleteEntry: confirmDeleteEntry,
    onMealActions: promptMealActions,
    onAddMeal: promptAddMeal,
  };

  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <>
      <Stack.Screen
        options={{
          title: formatDayTitle(date, today),
          headerLeft: () => (
            <HeaderChevron
              symbol="chevron.left"
              label="Jour précédent"
              onPress={() => slideTo(-1)}
            />
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              {/* Direct access to a date (specs 8.3). */}
              <Pressable
                onPress={() => {
                  setPickerMonth(date);
                  setPickerOpen(true);
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Choisir une date"
              >
                <SymbolView name="calendar" size={19} tintColor={theme.colors.accent} />
              </Pressable>
              <HeaderChevron
                symbol="chevron.right"
                label="Jour suivant"
                onPress={() => slideTo(1)}
              />
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
          <DayPage key={previous} date={previous} {...pageProps} />
          <DayPage key={date} date={date} {...pageProps} />
          <DayPage key={next} date={next} {...pageProps} />
        </Animated.View>
      </GestureDetector>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={() => setPickerOpen(false)} accessibilityRole="button">
              <Text style={[styles.sheetAction, { color: theme.colors.accent }]}>Fermer</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setDate(today);
                setPickerOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetAction, { color: theme.colors.accent }]}>
                Aujourd’hui
              </Text>
            </Pressable>
          </View>

          <MonthCalendar
            month={pickerMonth}
            selected={date}
            today={today}
            onMonthChange={setPickerMonth}
            onSelect={(chosen) => {
              // A jump of more than one day has no page to slide to, so it
              // swaps outright. The strip is already at rest.
              setDate(chosen);
              setPickerOpen(false);
            }}
          />
        </View>
      </Modal>
    </>
  );
}

function HeaderChevron({
  symbol,
  label,
  onPress,
}: {
  symbol: 'chevron.left' | 'chevron.right';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name={symbol} size={17} tintColor={theme.colors.accent} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { flex: 1, flexDirection: 'row' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  sheet: { flex: 1, padding: 16, gap: 8 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  sheetAction: { fontSize: 17 },
});
