import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatLongDate, formatWeight } from '@/core/format';
import { useTheme } from '@/core/theme';
import { EmptyState } from '@/core/ui/empty-state';
import { ListSeparator } from '@/core/ui/list-separator';
import { LoadingDots } from '@/core/ui/loading-dots';
import { Text } from '@/core/ui/text';
import { SwipeToDeleteRow } from '@/features/nutrition/components/swipe-to-delete-row';
import { useDeleteWeight, useWeightHistory } from '../data/weight-queries';

/**
 * Every measurement, newest first, editable and deletable (specs 9.1).
 *
 * > Historique consultable et corrigeable : liste chronologique, édition et
 * > suppression de n'importe quelle mesure.
 *
 * ## WHERE IT LIVES IS A GAP IN THE SPECS, FILLED HERE
 *
 * Specs 9.1 asks for the list and names no place for it; specs 7 does not list
 * it and specs 12 does not put it in the Settings. It is pushed inside the
 * Stats tab, one step from the curve — because correcting a measurement follows
 * SEEING it look wrong, and the curve is where that happens. Recorded as an
 * amendment rather than left as an undocumented choice.
 *
 * Consulting is a push, which is the rule since slice 3; the correction itself
 * opens the same window the Journal opens, on that date.
 *
 * ## THE ROW IS A SwipeToDeleteRow, WHICH OWNS ITS OWN TAP
 *
 * Not a Pressable with a swipe layered over it. A Pan that activates does not
 * cancel a Pressable underneath, so the release reads as a press — the defect
 * slice 4 found on the device, on the basket and on the Journal both. The tap
 * lives inside the gesture component, where it RACES the pan and loses to it.
 *
 * Two gestures to delete, as everywhere: the first swipe uncovers the button,
 * the second or the button itself removes.
 */
export function WeightHistoryScreen() {
  const theme = useTheme();
  const router = useRouter();

  const history = useWeightHistory();
  const remove = useDeleteWeight();

  if (history.data === undefined) {
    return (
      <View style={[styles.waiting, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }

  if (history.data.length === 0) {
    return (
      <View style={[styles.waiting, { backgroundColor: theme.colors.background }]}>
        <EmptyState
          symbol="scalemass"
          title="Aucune pesée"
          message="Saisissez votre poids sous les repas du Journal."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {history.data.map((row, index) => (
          <View key={row.date}>
            {index === 0 ? null : <ListSeparator />}
            <SwipeToDeleteRow
              onDelete={() => remove.mutate(row.date)}
              onPress={() =>
                router.push({ pathname: '/(modals)/weight', params: { date: row.date } })
              }
              accessibilityLabel={`${formatLongDate(row.date)} : ${formatWeight(row.valueKg)}`}
            >
              <View style={styles.row}>
                <Text style={[styles.date, { color: theme.colors.text }]}>
                  {formatLongDate(row.date)}
                </Text>
                <Text style={[styles.value, { color: theme.colors.text }]}>
                  {formatWeight(row.valueKg)}
                </Text>
              </View>
            </SwipeToDeleteRow>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  date: { fontSize: 16, flex: 1 },
  // Tabular, so the column of weights lines up down the list.
  value: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
