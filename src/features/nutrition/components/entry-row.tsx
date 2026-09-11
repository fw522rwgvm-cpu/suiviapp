import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal, formatMacro } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { JournalEntryView } from '../data/day-reads';
import { hasKcalWarning } from '../domain/macros';
import { formatEntryQuantity } from './portion-text';

/**
 * One line of the journal.
 *
 * This is where the one concession to free entry lives. D5/R2 promises no
 * special case in the aggregations, and keeps that promise: a free entry is
 * 100 units of a virtual food and sums like anything else. But it has no
 * quantity the user ever typed, so showing "100 g" would be showing them an
 * implementation detail. The branch is presentational, and only here.
 *
 * No calculation of its own: the total arrives already derived from the read
 * layer (D9 — nothing in a component).
 */
export function EntryRow({
  entry,
  onPress,
}: {
  entry: JournalEntryView;
  onPress: () => void;
}) {
  const theme = useTheme();
  const total = entry.total;

  const detail =
    entry.kind === 'free' || entry.quantity === null || entry.baseUnit === null
      ? total === null
        ? null
        : `P ${formatMacro(total.protein)} · G ${formatMacro(total.carbs)} · L ${formatMacro(total.fat)}`
      : // A food logged as a portion says so: "2 tranches · 50 g". Showing only
        // the grams would be showing the storage form.
        formatEntryQuantity(
          entry.quantity,
          entry.baseUnit,
          entry.portionName,
          entry.portionQuantity,
        );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.background : theme.colors.surface },
      ]}
    >
      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {entry.name}
          {entry.brand === null ? '' : ` · ${entry.brand}`}
        </Text>
        {detail === null ? null : (
          <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>

      <View style={styles.figures}>
        <Text style={[styles.kcal, { color: theme.colors.text }]}>
          {total === null ? '—' : formatKcal(total.kcal)}
        </Text>
        {total !== null && hasKcalWarning(total) ? (
          // Non-blocking, and deliberately quiet: specs 5.1 asks for a warning
          // beyond 10% of discrepancy, not for an obstacle.
          <Text style={[styles.warning, { color: theme.colors.warning }]}>écart kcal</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 16 },
  detail: { fontSize: 13 },
  figures: { alignItems: 'flex-end' },
  kcal: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  warning: { fontSize: 11 },
});
