import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { PendingEntry } from '../domain/pending-entry';
import { describePendingEntry, pendingEntryKcal } from '../domain/pending-entry';

/**
 * One line of the basket — something chosen but not yet written (specs 8.4).
 *
 * The cross is the only thing here that acts, and it is drawn in the
 * destructive colour because it destroys nothing: a line removed from a basket
 * was never in the journal. Saying so with a red circle is a small dishonesty
 * that iOS speaks fluently — it means "this takes something away", and that is
 * exactly what it does.
 */
export function PendingEntryRow({
  entry,
  onRemove,
}: {
  entry: PendingEntry;
  onRemove: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {describePendingEntry(entry)}
        </Text>
      </View>

      <Text style={[styles.kcal, { color: theme.colors.text }]}>
        {formatKcal(pendingEntryKcal(entry))} kcal
      </Text>

      <Pressable
        onPress={onRemove}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Retirer ${entry.name}`}
        style={styles.remove}
      >
        <SymbolView name="xmark.circle.fill" size={24} tintColor={theme.colors.danger} />
      </Pressable>
    </View>
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
  kcal: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  remove: { paddingLeft: 2 },
});
