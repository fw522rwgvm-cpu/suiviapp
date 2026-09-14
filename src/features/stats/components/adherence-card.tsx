import { StyleSheet } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import type { Adherence } from '../domain/adherence';
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
      <Text style={[styles.rule, { color: theme.colors.textFaint }]}>
        {describeAdherenceRule(tolerancePct)}
      </Text>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  // Set apart from the two lines above it: those are about this history, this
  // one is about the rule being applied to it.
  rule: { fontSize: 13, lineHeight: 19, marginTop: 10 },
});
