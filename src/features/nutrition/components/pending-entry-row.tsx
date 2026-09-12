import { useState } from 'react';
import { StyleSheet, Text, View, type TextLayoutEventData } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { PendingEntry } from '../domain/pending-entry';
import {
  describePendingEntryMacros,
  describePendingEntryQuantity,
  pendingEntryKcal,
  wasNameTruncated,
} from '../domain/pending-entry';

/**
 * One line of the basket — something chosen but not yet written (specs 8.4).
 *
 * The quantity sits beside the name rather than under it, because the two
 * together are what identifies the line: "Pain de mie" is a food, "Pain de mie
 * 2 tranches" is a decision. The macros go underneath, where they inform
 * without competing.
 *
 * NOTHING HERE ACTS. Removing a line is a swipe, handled by the row that wraps
 * this one — the same gesture, and the same component, as deleting an entry in
 * the Journal. A cross on every line would be a permanent target for an action
 * taken rarely, on a list read far more often than it is edited.
 *
 * ## The quantity yields rather than either of them being cut
 *
 * A long name next to a quantity leaves two bad outcomes: an ellipsis through
 * the name, or one through the quantity. Both lose more than they save — half
 * a food name identifies nothing, and "2 tra…" is worse than silence.
 *
 * So when the name cannot fit beside it, the quantity goes and the name gets
 * the room. Whether it fitted is read from the line the text actually laid out
 * -- see wasNameTruncated, which says what is assumed there and what is not.
 *
 * THE DECISION ONLY EVER GOES ONE WAY. Hiding the quantity gives the name more
 * room, so it would then fit, so the quantity would come back, so it would not
 * fit — a loop that renders for ever. Latching it closed is what stops that,
 * and it is sound here because a basket line's content never changes.
 */
export function PendingEntryRow({ entry }: { entry: PendingEntry }) {
  const theme = useTheme();
  const [crowded, setCrowded] = useState(false);
  const quantity = crowded ? null : describePendingEntryQuantity(entry);

  function measure(event: { nativeEvent: TextLayoutEventData }): void {
    if (crowded) return;
    const line = event.nativeEvent.lines[0];
    if (line !== undefined && wasNameTruncated(line.text, entry.name)) setCrowded(true);
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.identity}>
        <View style={styles.heading}>
          <Text
            style={[styles.name, { color: theme.colors.text }]}
            numberOfLines={1}
            onTextLayout={measure}
          >
            {entry.name}
          </Text>
          {quantity === null ? null : (
            <Text style={[styles.quantity, { color: theme.colors.textMuted }]}>
              {quantity}
            </Text>
          )}
        </View>

        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {describePendingEntryMacros(entry)}
        </Text>
      </View>

      <Text style={[styles.kcal, { color: theme.colors.text }]}>
        {formatKcal(pendingEntryKcal(entry))} kcal
      </Text>
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
  // The name may shrink; the quantity never does, or it stops being readable
  // at exactly the moment it matters.
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontSize: 16 },
  quantity: { fontSize: 16 },
  detail: { fontSize: 13 },
  kcal: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
