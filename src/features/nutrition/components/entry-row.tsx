import { StyleSheet, Text, View } from 'react-native';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { JournalEntryView } from '../data/day-reads';
import { describeMacros, hasKcalWarning } from '../domain/macros';
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
 * ## What the grey line under the name carries
 *
 * How much, then what it is worth: "2 tranches · 50 g · P 4,0 · G 23,5 · L 1,5".
 * A logged line answers two questions, and they belong together on one line
 * because they are read together — how much of it, and what it cost.
 *
 * The macros are spelled exactly as the basket spells them, through the same
 * function: the line about to be added and the same line once added must read
 * identically, or they are read as two different things.
 *
 * KCAL KEEPS ITS UNIT AND ITS PLACE, on the right, out of the grey line. It is
 * the one figure the journal is scanned for, and a bare number in a row of
 * grams has to be worked out rather than read.
 *
 * No calculation of its own: the total arrives already derived from the read
 * layer (D9 — nothing in a component).
 */
/**
 * IT NO LONGER CARRIES ITS OWN PRESS, and that is not a simplification.
 *
 * A Pressable here could not tell a tap from the release of a swipe:
 * gesture-handler's pan and React Native's responder system do not arbitrate
 * with each other, so swiping a row open and letting go over it fired the
 * press. SwipeToDeleteRow owns the tap now — where it races the pan and loses
 * to it, which is the arbitration that was missing — and the pressed highlight
 * comes from there too.
 */
export function EntryRow({ entry }: { entry: JournalEntryView }) {
  const theme = useTheme();
  const total = entry.total;

  // A food logged as a portion says so: "2 tranches · 50 g". Showing only the
  // grams would be showing the storage form. A free entry has no quantity
  // anyone typed — that is the one concession above — so it starts at the
  // macros.
  const quantity =
    entry.kind === 'free' || entry.quantity === null || entry.baseUnit === null
      ? null
      : formatEntryQuantity(
          entry.quantity,
          entry.baseUnit,
          entry.portionName,
          entry.portionQuantity,
        );

  const detail = [quantity, total === null ? null : describeMacros(total)]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    // No background of its own: the swipe row paints it, so the highlight can
    // follow the finger on the UI thread rather than through React state.
    <View style={styles.row}>
      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {entry.name}
          {entry.brand === null ? '' : ` · ${entry.brand}`}
        </Text>
        {detail === '' ? null : (
          <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>

      <View style={styles.figures}>
        <Text style={[styles.kcal, { color: theme.colors.text }]}>
          {total === null ? '—' : `${formatKcal(total.kcal)} kcal`}
        </Text>
        {total !== null && hasKcalWarning(total) ? (
          // Non-blocking, and deliberately quiet: specs 5.1 asks for a warning
          // beyond 10% of discrepancy, not for an obstacle.
          <Text style={[styles.warning, { color: theme.colors.warning }]}>écart kcal</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * SMALLER THAN A STANDARD LIST ROW, DELIBERATELY.
 *
 * A meal holds five or six of these and they are read as a group -- what did
 * this meal come to -- not one at a time. At the system's list size a meal
 * stops fitting on a screen, and a list that has to be scrolled to be totalled
 * is a list that gets totalled wrong.
 *
 * The vertical padding comes down with the type. Text that shrinks inside a
 * box that does not leaves the row looking under-filled, which reads as a
 * mistake rather than as a density.
 */
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  identity: { flex: 1, gap: 1 },
  name: { fontSize: 14 },
  // Smaller again than the name, because it carries two things and is read
  // second -- and never so small that the figures stop being figures.
  detail: { fontSize: 11 },
  figures: { alignItems: 'flex-end' },
  kcal: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  warning: { fontSize: 10 },
});
