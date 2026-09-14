import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme, type ColorTokens } from '@/core/theme';
import type { MacroSplit, MacroSplits } from '../domain/series';
import { formatMeanGrams, formatShare } from '../domain/stats-text';
import { StatCard } from './stat-card';

/**
 * The P / G / L split, in grams and as a percentage (specs 8.7).
 *
 * ## THE BAR IS DRAWN WITH VIEWS, AND IT DOES NOT WANT SVG
 *
 * Three boxes whose widths are three proportions is flexbox doing exactly what
 * flexbox is for. react-native-svg arrives in this slice for the charts, and
 * reaching for it here would be using it because it is there — a stacked bar
 * has no curve, no axis and no scale.
 *
 * ## THE COLOURS ARE THE MACRO TOKENS, UNCHANGED
 *
 * One colour per nutrient, the same one everywhere it appears (amendment 14.4
 * no 15). A user who has learnt that the violet bar on the Journal is fat
 * should not have to learn it again here. Calories are absent on purpose: they
 * are what the three come to, not a fourth slice — see macroSplits.
 */
export function SplitCard({
  splits,
  recorded,
  span,
}: {
  splits: MacroSplits | null;
  recorded: number;
  span: number;
}) {
  const theme = useTheme();

  if (splits === null) {
    return (
      <StatCard
        title="Répartition"
        caption="Aucune journée renseignée sur cette plage."
      />
    );
  }

  const rows: { label: string; split: MacroSplit; color: keyof ColorTokens }[] = [
    { label: 'Protéines', split: splits.protein, color: 'macroProtein' },
    { label: 'Glucides', split: splits.carbs, color: 'macroCarbs' },
    { label: 'Lipides', split: splits.fat, color: 'macroFat' },
  ];

  return (
    /*
      NO HEADLINE, AND NO CAPTION UNDER IT.

      They stated the three shares as one big line, then the bar stated them as
      lengths, then the rows stated them again beside their names. Three
      readings of one fact, of which the first was the least useful: a
      percentage read as text is compared by arithmetic, where the same
      percentage read as a length is compared by looking — which is the entire
      reason the bar is there.

      What survives is the basis, because it is not redundant with anything:
      nothing in the drawing says how many days it covers.
    */
    <StatCard
      title="Répartition"
      note={`Moyenne par journée renseignée, sur ${recorded} sur ${span}.`}
    >
      <View style={styles.bar}>
        {rows.map((row) => (
          <View
            key={row.label}
            // flexGrow on a share, so the three fill the row exactly whatever
            // the numbers. A width in per cent would round three times and
            // leave a hairline of background showing at the end.
            style={{ flexGrow: row.split.share, backgroundColor: theme.colors[row.color] }}
          />
        ))}
      </View>

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: theme.colors[row.color] }]} />
            <Text style={[styles.label, { color: theme.colors.text }]}>{row.label}</Text>
            <Text style={[styles.grams, { color: theme.colors.textMuted }]}>
              {formatMeanGrams(row.split.grams)}
            </Text>
            <Text style={[styles.share, { color: theme.colors.text }]}>
              {formatShare(row.split.share)}
            </Text>
          </View>
        ))}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  // No headline above it any more, so the bar IS the top of the card.
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 4 },
  rows: { marginTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  label: { fontSize: 15, flex: 1 },
  // Tabular so the three figures line up as a column rather than as three
  // sentences that happen to be stacked.
  grams: { fontSize: 15, fontVariant: ['tabular-nums'] },
  share: { fontSize: 15, fontWeight: '600', minWidth: 48, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
