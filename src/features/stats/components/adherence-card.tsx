import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme, type ColorTokens } from '@/core/theme';
import type { Adherence, MacroAdherence } from '../domain/adherence';
import {
  describeAdherenceDenominator,
  describeAdherenceExclusions,
  describeAdherenceRule,
  formatAdherenceRate,
} from '../domain/stats-text';
import { StatCard } from './stat-card';

/**
 * The adherence rate, and the two lines that stop it from lying (specs 8.7).
 *
 * > Corollaire obligatoire : le pourcentage est TOUJOURS affiché avec son
 * > dénominateur. Sans cela, la statistique récompense l'abandon du journal.
 *
 * Which is why the denominator is not optional here and not a detail behind a
 * tap: a rate of 100 % over two days and one over twenty-eight are the same
 * number, and only one of them means anything. It sits directly under the
 * figure, in the caption slot every card uses for "what this is a figure of".
 *
 * The exclusions line is a second guarantee and appears only when there is
 * something to explain. Without it the arithmetic visibly fails to add up on
 * the most common history there is — every day materialised before migration
 * 0004 has no goal, for good, so a user with months of history behind them
 * would see a denominator far below the range with nothing saying why.
 *
 * No colour, deliberately. A percentage is not an alarm: the Journal's calorie
 * gauge is the one figure in this application allowed to raise its voice
 * (amendment 9.5 no 13), and a rate turning red for a week of travelling would
 * be the application telling its user off.
 */
export function AdherenceCard({
  adherence,
  tolerancePct,
}: {
  adherence: Adherence;
  tolerancePct: number;
}) {
  const theme = useTheme();

  return (
    <StatCard
      title="Adhérence"
      headline={formatAdherenceRate(adherence.rate)}
      caption={describeAdherenceDenominator(adherence)}
      note={describeAdherenceExclusions(adherence)}
    >
      {/*
        THE FOUR, AND THEY DO NOT REPLACE THE ONE ABOVE — THEY EXPLAIN IT.

        The headline says how many days landed where they were aimed; it cannot
        say WHICH of the four cost the others. A month at 40 % reads very
        differently when protein is at 95 % and carbohydrates at 45 %, and the
        single figure hides exactly that.

        Same denominator as the headline, so the five are comparable — and the
        headline can never exceed the smallest of these four, since a day counts
        overall only if it counted on every one of them.

        Drawn like the split card's rows, with the macro colours: the reader has
        already learnt that the violet one is fat.
      */}
      {adherence.judged === 0 ? null : (
        <View style={styles.macros}>
          {MACRO_ROWS.map((row) => (
            <View key={row.label} style={styles.macroRow}>
              <View style={[styles.dot, { backgroundColor: theme.colors[row.color] }]} />
              <Text style={[styles.macroLabel, { color: theme.colors.text }]}>
                {row.label}
              </Text>
              <Text style={[styles.macroRate, { color: theme.colors.text }]}>
                {formatAdherenceRate(adherence.byMacro[row.key])}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.rule, { color: theme.colors.textFaint }]}>
        {describeAdherenceRule(tolerancePct)}
      </Text>
    </StatCard>
  );
}

/**
 * Calories last, which is the order the reader needs rather than the order the
 * domain lists them in: the three macros are the levers, and the calories are
 * what they come to. The split card puts them in the same order, minus the
 * calories it deliberately does not treat as a fourth slice.
 */
const MACRO_ROWS: readonly {
  key: keyof MacroAdherence;
  label: string;
  color: keyof ColorTokens;
}[] = [
  { key: 'protein', label: 'Protéines', color: 'macroProtein' },
  { key: 'carbs', label: 'Glucides', color: 'macroCarbs' },
  { key: 'fat', label: 'Lipides', color: 'macroFat' },
  { key: 'kcal', label: 'Calories', color: 'macroKcal' },
];

const styles = StyleSheet.create({
  macros: { marginTop: 14, gap: 8 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  macroLabel: { fontSize: 15, flex: 1 },
  // Tabular and right-aligned, so four percentages read as a column rather
  // than as four sentences that happen to be stacked.
  macroRate: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // Set apart from everything above it: those are about this history, this one
  // is about the rule being applied to it.
  rule: { fontSize: 13, lineHeight: 19, marginTop: 14 },
});
