import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useMealEntries } from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import type { DayMealView } from '../domain/day-plan';
import type { Macros } from '../domain/macros';
import { EntryRow } from './entry-row';
import { SwipeToDeleteRow } from './swipe-to-delete-row';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * One meal of the day: header, sub-total, and its entries once unfolded.
 *
 * > Meals collapsed by default, with a sub-total and a target of their own.
 *
 * Collapsed is not only a reading preference, it is a performance rule (D16):
 * nothing heavy at launch. The sub-total comes from a single grouped query
 * over the whole day, so showing it costs no entry load, and the entries of a
 * meal are fetched only when that meal is opened.
 *
 * A virtual meal has no identifier and therefore no entries to fetch — the
 * query stays disabled until the day is materialised.
 */
export function MealSection({
  meal,
  total,
  onAdd,
  onEditEntry,
  onDeleteEntry,
  onLongPress,
}: {
  meal: DayMealView;
  total: Macros | undefined;
  onAdd: () => void;
  onEditEntry: (entry: JournalEntryView) => void;
  onDeleteEntry: (entry: JournalEntryView) => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const entries = useMealEntries(open ? meal.id : null);

  const consumedKcal = total?.kcal ?? 0;
  const targetKcal = meal.targets?.kcal ?? null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
        theme.shadow,
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => setOpen((current) => !current)}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.headerPress}
        >
          {/*
            The chevron leads, because it is what the whole row does: it says
            "this opens" before you have read what opens. Trailing, it read as
            an afterthought on a row whose main target is the name.
          */}
          <SymbolView
            name={open ? 'chevron.down' : 'chevron.right'}
            size={13}
            tintColor={theme.colors.textFaint}
          />

          {/*
            Name above, figure below, rather than both on one line. It gives
            the meal name room to be a real name — slice 5 lets templates call
            a meal whatever they like — and puts the kcal where the eye already
            is after reading it.
          */}
          <View style={styles.identity}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {meal.name}
            </Text>
            <Text style={[styles.total, { color: theme.colors.textMuted }]}>
              {targetKcal === null
                ? `${formatKcal(consumedKcal)} kcal`
                : `${formatKcal(consumedKcal)} / ${formatKcal(targetKcal)} kcal`}
            </Text>
          </View>
        </Pressable>

        {/*
          Reachable whether the meal is open or not (specs 8.3), and sized to
          be the obvious thing to hit: roughly three quarters of the row's
          height. Logging a meal is the action the whole application exists
          for (specs 4), and D16 says the 15-second target is met by removing
          gestures — a target you have to aim at is a gesture in itself.
        */}
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter à ${meal.name}`}
          hitSlop={10}
          style={styles.add}
        >
          <SymbolView name="plus.circle.fill" size={54} tintColor={theme.colors.accent} />
        </Pressable>
      </View>

      {open ? (
        <View style={[styles.entries, { borderTopColor: theme.colors.border }]}>
          {entries.data === undefined || entries.data.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
              Rien pour l’instant.
            </Text>
          ) : (
            entries.data.map((entry, index) => (
              <View key={entry.id}>
                {/*
                  Between the rows and never around them: a line above the
                  first or below the last would box the list in, when the card
                  already does that. Inset to where the text starts, as a
                  system list is, so the rows read as one list rather than as
                  separate things stacked.

                  Outside the swipeable row, not inside it, so it stays put
                  while a row travels under the finger.
                */}
                {index === 0 ? null : (
                  <ListSeparator />
                )}
                <SwipeToDeleteRow onDelete={() => onDeleteEntry(entry)}>
                  <EntryRow entry={entry} onPress={() => onEditEntry(entry)} />
                </SwipeToDeleteRow>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden so the swipe-to-delete row cannot paint outside the
  // rounded corners while it is being dragged.
  container: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingLeft: 18,
  },
  identity: { flex: 1, gap: 3 },
  name: { fontSize: 17, fontWeight: '600' },
  total: { fontSize: 14, fontVariant: ['tabular-nums'] },
  // Tighter than the row's own padding: the glyph is large enough to carry the
  // target on its own, so padding here would only push it off the edge.
  add: { paddingHorizontal: 14, paddingVertical: 10 },
  entries: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { fontSize: 14, paddingHorizontal: 18, paddingVertical: 16 },
});
