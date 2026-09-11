import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { addDays, currentLocalDate, type LocalDate } from '@/core/date';
import { formatDayTitle } from '@/core/format';
import { useTheme } from '@/core/theme';
import {
  useAddMeal,
  useDay,
  useDayTotals,
  useDeleteEntry,
  useDeleteMeal,
  useMealTotals,
  useRenameMeal,
} from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import { MealSection } from '../components/meal-section';
import { MonthCalendar } from '../components/month-calendar';
import { RemainingBanner } from '../components/remaining-banner';
import { dayTargets, type DayMealView } from '../domain/day-plan';
import { ZERO_MACROS } from '../domain/macros';

/**
 * The Journal (specs 8.3).
 *
 * Holds no calculation of its own (D9): totals, targets and remainders all
 * arrive derived. What it does own is the date being looked at, and the rule
 * that looking is free — every read below answers a virtual day for a date
 * that has no row, and writes are the only thing that materialises one.
 *
 * The date starts on the current day and is not remembered: specs 7 asks for
 * the Journal to open on today, never on the last date consulted.
 */
export function JournalScreen() {
  const theme = useTheme();
  const router = useRouter();

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

  const day = useDay(date);
  const totals = useDayTotals(date);
  const mealTotals = useMealTotals(date);

  const addMeal = useAddMeal();
  const renameMeal = useRenameMeal();
  const deleteMeal = useDeleteMeal();
  const deleteEntry = useDeleteEntry();

  const meals = day.data?.meals ?? [];

  // Horizontal swipe between days (specs 8.3). It only claims the touch once
  // the movement is clearly horizontal, and a swipe that starts on an entry is
  // handled by that row instead: the innermost gesture wins.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-30, 30])
    .onEnd((event) => {
      if (event.translationX < -60) setDate((current) => addDays(current, 1));
      else if (event.translationX > 60) setDate((current) => addDays(current, -1));
    });

  function openAdd(meal: DayMealView): void {
    router.push({
      pathname: '/(modals)/free-entry',
      params: { date, mealPosition: String(meal.position) },
    });
  }

  function openEdit(entry: JournalEntryView): void {
    router.push({
      pathname: '/(modals)/free-entry',
      params: { date, entryId: entry.id },
    });
  }

  function confirmDeleteEntry(entry: JournalEntryView): void {
    // No deletion is ever blocked (specs 5.3), and past entries stay intact.
    // The confirmation is here because a swipe is easy to make by accident,
    // not because the application has an opinion about deleting.
    Alert.alert(`Supprimer « ${entry.name} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => deleteEntry.mutate(entry.id),
      },
    ]);
  }

  function promptAddMeal(): void {
    Alert.prompt('Nouveau repas', 'Son nom', (name) => {
      const trimmed = name.trim();
      if (trimmed !== '') addMeal.mutate({ date, name: trimmed });
    });
  }

  function promptMealActions(meal: DayMealView): void {
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
                renameMeal.mutate({ date, mealPosition: meal.position, name: trimmed });
              }
            },
            'plain-text',
            meal.name,
          ),
      },
      {
        text: 'Supprimer le repas',
        style: 'destructive',
        onPress: () => deleteMeal.mutate({ date, mealPosition: meal.position }),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: formatDayTitle(date, today),
          headerLeft: () => (
            <HeaderChevron
              symbol="chevron.left"
              label="Jour précédent"
              onPress={() => setDate((current) => addDays(current, -1))}
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
                onPress={() => setDate((current) => addDays(current, 1))}
              />
            </View>
          ),
        }}
      />

      <GestureDetector gesture={swipe}>
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <RemainingBanner
            consumed={totals.data ?? ZERO_MACROS}
            target={dayTargets(meals)}
          />

          {meals.map((meal) => (
            <MealSection
              key={meal.id ?? `virtual-${meal.position}`}
              meal={meal}
              total={meal.id === null ? undefined : mealTotals.data?.get(meal.id)}
              onAdd={() => openAdd(meal)}
              onEditEntry={openEdit}
              onDeleteEntry={confirmDeleteEntry}
              onLongPress={() => promptMealActions(meal)}
            />
          ))}

          <Pressable
            onPress={promptAddMeal}
            accessibilityRole="button"
            style={[styles.addMeal, { borderColor: theme.colors.border }]}
          >
            <Text style={[styles.addMealLabel, { color: theme.colors.accent }]}>
              Ajouter un repas
            </Text>
          </Pressable>

          <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
            Balayez horizontalement pour changer de jour. Appui long sur un repas pour le
            renommer ou le supprimer.
          </Text>
        </ScrollView>
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
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  sheet: { flex: 1, padding: 16, gap: 8 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  sheetAction: { fontSize: 17 },
  addMeal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    borderStyle: 'dashed',
    paddingVertical: 14,
    alignItems: 'center',
  },
  addMealLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
});
