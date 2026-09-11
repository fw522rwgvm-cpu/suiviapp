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
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => setOpen((current) => !current)}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.headerPress}
        >
          <SymbolView
            name={open ? 'chevron.down' : 'chevron.right'}
            size={13}
            tintColor={theme.colors.textFaint}
          />
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {meal.name}
          </Text>
          <Text style={[styles.total, { color: theme.colors.textMuted }]}>
            {targetKcal === null
              ? `${formatKcal(consumedKcal)} kcal`
              : `${formatKcal(consumedKcal)} / ${formatKcal(targetKcal)} kcal`}
          </Text>
        </Pressable>

        {/* Reachable whether the meal is open or not (specs 8.3). */}
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter à ${meal.name}`}
          hitSlop={10}
          style={styles.add}
        >
          <SymbolView name="plus.circle.fill" size={24} tintColor={theme.colors.accent} />
        </Pressable>
      </View>

      {open ? (
        <View style={[styles.entries, { borderTopColor: theme.colors.border }]}>
          {entries.data === undefined || entries.data.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
              Rien pour l’instant.
            </Text>
          ) : (
            entries.data.map((entry) => (
              <SwipeToDeleteRow key={entry.id} onDelete={() => onDeleteEntry(entry)}>
                <EntryRow entry={entry} onPress={() => onEditEntry(entry)} />
              </SwipeToDeleteRow>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingLeft: 14,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  total: { fontSize: 14, fontVariant: ['tabular-nums'] },
  add: { paddingHorizontal: 14, paddingVertical: 14 },
  entries: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
});
