import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { LocalDate } from '@/core/date';
import { formatWeight } from '@/core/format';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import { useWeight } from '../data/weight-queries';

/**
 * The weight of the day being looked at (specs 9.1).
 *
 * > Champ de saisie sous la liste des repas de l'écran Journal, sur la date
 * > consultée.
 *
 * ## IT IS A ROW THAT OPENS A WINDOW, NOT A FIELD IN THE PAGE
 *
 * Specs 9.1 says "champ de saisie", and a literal reading would put a live
 * TextInput at the foot of the Journal. Three things rule that out, and the
 * third is decisive:
 *
 *  - the Journal is a carousel with THREE pages mounted at once, so a live
 *    field would exist three times over, two of them for days nobody is
 *    looking at;
 *  - a keyboard rising inside a horizontally-swiping strip fights the gesture
 *    that page is built around;
 *  - the overwrite confirmation specs 9.1 requires has to happen between typing
 *    and writing, and a field that saves on blur has no such moment.
 *
 * So the row shows the measurement and opens the window that takes it — which
 * is also the rule this application already runs on: acting on a day happens in
 * a window over it, never in the page itself.
 *
 * ## THE THREE STATES ARE THREE, NEVER TWO
 *
 * `undefined` is "not read yet" and `null` is "never weighed". A card folding
 * them together would invite the user to type a second measurement over one
 * that already exists — the defect slice 4 paid for twice, on the quantity
 * wheels and on the portions list.
 */
export function WeightCard({
  date,
  /** False on the carousel's neighbours: a tap there is an accident waiting. */
  interactive,
  onPress,
}: {
  date: LocalDate;
  interactive: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const weight = useWeight(date);

  const pending = weight.data === undefined;
  const measured = weight.data ?? null;

  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Poids</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {pending
            ? ' '
            : measured === null
              ? 'Pas encore pesé'
              : 'Au réveil, sur cette date'}
        </Text>
      </View>

      <View style={styles.value}>
        <Text
          style={[
            styles.figure,
            { color: measured === null ? theme.colors.textFaint : theme.colors.text },
          ]}
        >
          {/*
            A space rather than a dash while the query is in flight: a dash is
            an answer ("nothing"), and the point of the three states is that
            "not yet" must not look like one.
          */}
          {pending ? ' ' : measured === null ? 'Ajouter' : formatWeight(measured)}
        </Text>
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={theme.colors.textFaint}
          fallback={null}
        />
      </View>
    </View>
  );

  if (!interactive) {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>{body}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        measured === null
          ? 'Ajouter le poids de cette date'
          : `Poids : ${formatWeight(measured)}. Modifier.`
      }
      style={({ pressed }) => [
        styles.card,
        {
          // The highlight food-row.tsx already uses: the page colour showing
          // through, rather than a token of its own for one card.
          backgroundColor: pressed ? theme.colors.background : theme.colors.surface,
        },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // tabular-nums so the figure does not shift as the tenth changes.
  figure: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
