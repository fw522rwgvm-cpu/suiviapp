import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { JournalEntryView } from '../data/day-reads';
import { describeMacros, hasKcalWarning } from '../domain/macros';
import { formatEntryQuantity } from './portion-text';
import { describeBlockQuantity } from './recipe-text';

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
export function EntryRow({
  entry,
  expanded,
}: {
  entry: JournalEntryView;
  /**
   * Whether a grouped block is open. Undefined for a leaf, which has nothing
   * to fold.
   *
   * A CHEVRON, NOT A BUTTON. It is drawn inside a row whose tap belongs to the
   * swipe gesture, and a Pressable here would be React Native's responder
   * system inside a gesture subtree — the documented trap this file's own note
   * records having already been paid for once.
   */
  expanded?: boolean;
}) {
  const theme = useTheme();
  const total = entry.total;

  /**
   * A GROUPED BLOCK STATES HOW MUCH OF THE RECIPE, not a weight of ingredients.
   *
   * "2 portions", or "250 g" for a recipe whose yield is a weight. It comes
   * from the row's own stored columns rather than from the recipe, because an
   * entry is a closed capsule (D5/R1) and the recipe is a living object that
   * may since have changed its yield or been deleted.
   *
   * The quantity on a parent is the one place in the schema where that column
   * does not mean base units — safe only because the row carries no macros, so
   * nothing ever multiplies it (see the note in JournalEntryView).
   */
  const block = entry.children.length > 0;

  // A food logged as a portion says so: "2 tranches · 50 g". Showing only the
  // grams would be showing the storage form. A free entry has no quantity
  // anyone typed — that is the one concession above — so it starts at the
  // macros.
  const quantity = block
    ? describeBlockQuantity(entry.quantity, entry.baseUnit, entry.portionName)
    : entry.kind === 'free' || entry.quantity === null || entry.baseUnit === null
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
      {expanded === undefined ? null : (
        <SymbolView
          name={expanded ? 'chevron.down' : 'chevron.right'}
          size={11}
          tintColor={theme.colors.textFaint}
        />
      )}

      <View style={styles.identity}>
        <Text
          style={[styles.name, block ? styles.blockName : null, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {entry.name}
          {entry.brand === null ? '' : ` · ${entry.brand}`}
        </Text>
        {detail === '' ? null : (
          <Text
            style={[styles.detail, styles.detailFigures, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
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
    // Tightened from 16/12 to buy back about ten points for the grey line,
    // which was losing its last macro to an ellipsis on a phone.
    paddingHorizontal: 14,
    gap: 8,
  },
  identity: { flex: 1, gap: 1 },
  name: { fontSize: 14 },
  // A block names a meal rather than an ingredient, so it leads its own list.
  blockName: { fontWeight: '600' },
  /**
   * Smaller again than the name, because it carries two things and is read
   * second -- and never so small that the figures stop being figures.
   *
   * DOWN FROM 11, and the reason is a defect seen on the device rather than a
   * preference: "2 tranches · 50 g · P 4,0 · G 23,5 · L 1,5" is five values on
   * one line, and it was being cut at the last one. A truncated macro is worse
   * than a small one — it reads as a value rather than as a missing value,
   * because the ellipsis lands where a digit would.
   *
   * The letter spacing comes down with it. At ten points the default tracking
   * is what costs the line its last two characters, and the figures stay
   * tabular so a column of rows still lines up.
   */
  detail: { fontSize: 10, letterSpacing: -0.1 },
  figures: { alignItems: 'flex-end' },
  kcal: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  detailFigures: { fontVariant: ['tabular-nums'] },
  warning: { fontSize: 10 },
});
