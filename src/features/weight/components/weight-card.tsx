import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { LocalDate } from '@/core/date';
import { formatDayAndMonth, formatWeight } from '@/core/format';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import { useSetWeight, useWeightPrefill } from '../data/weight-queries';
import {
  canWeighOn,
  prefillValue,
  stepWeight,
  WEIGHT_STEP_KG,
  type WeightPrefill,
} from '../domain/weight-prefill';

/**
 * The weight of the day being looked at (specs 9.1, amended — specs 14.15).
 *
 * > Champ de saisie sous la liste des repas de l'écran Journal, sur la date
 * > consultée.
 *
 * ## THE FIGURE SHOWN IS THE FIGURE THE BUTTONS ADJUST
 *
 * The card, the two step buttons and the window all read `weightPrefill`, once.
 * Slice 4 settled what happens otherwise: three code paths agree almost always,
 * and the day they diverge the row lies about what its own button does, both
 * numbers being plausible.
 *
 * ## FOUR STATES, AND MERGING ANY TWO OF THEM STATES SOMETHING FALSE
 *
 *  - MEASURED — this date was weighed. The figure is a fact, drawn in full
 *    colour, and a tap on ± corrects it.
 *  - CARRIED — not weighed, but an earlier weighing exists. The figure is a
 *    PROPOSAL: drawn muted, with the date it came from written underneath. A
 *    card that drew this like the one above would state a weight nobody stood
 *    on a scale for — plausible, wrong, invisible.
 *  - NONE — nothing has ever been weighed before this date. There is no figure
 *    to step from, so the ± buttons would be arithmetic on nothing; the card
 *    offers to open the window instead.
 *  - FUTURE — weighing ahead is refused (specs 14.15). No buttons and no way
 *    in, and it says why rather than simply not responding.
 *
 * A future date that ALREADY HOLDS a measurement — from an archive written
 * before this rule, or repaired by hand — still shows it, read-only. Refusing
 * to CREATE one is not a reason to hide one that exists: it is real data, it is
 * drawn on the curve and deletable from the history, and a Journal page that
 * silently omitted it would be the only screen pretending it was not there.
 *
 * ## THE THREE TARGETS ARE SIBLINGS, NEVER NESTED
 *
 * "−", the figure, "+". A Pressable inside a Pressable is the trap this project
 * has already paid for once, and there is no reason to test whether the inner
 * one wins: the figure carries the tap that opens the window, and the two
 * buttons sit beside it.
 *
 * ## A STEP WRITES IMMEDIATELY, AND WITHOUT A CONFIRMATION
 *
 * "Ajouter/retirer 0,1 kg à la valeur enregistrée" is a write, and a button
 * that only moved a draft would need a second tap to commit — which is exactly
 * the tap these buttons exist to remove.
 *
 * No overwrite confirmation either, and that is a reading of specs 9.1 rather
 * than an exception to it: the confirmation guards a NEW SAYING typed over a
 * measurement you cannot see. A step starts FROM the figure on screen and moves
 * it one visible digit; asking about it every tenth of a kilo would be the
 * dialogue nobody reads.
 */
export function WeightCard({
  date,
  /** False on the carousel's neighbours: a tap there is an accident waiting. */
  interactive,
  today,
  onPress,
}: {
  date: LocalDate;
  interactive: boolean;
  today: LocalDate;
  onPress: () => void;
}) {
  const theme = useTheme();
  const prefill = useWeightPrefill(date);
  const setWeight = useSetWeight();

  const weighable = canWeighOn(date, today);
  const pending = prefill.data === undefined;
  const state: WeightPrefill = prefill.data ?? { kind: 'none' };
  const value = prefillValue(state);

  function step(direction: number): void {
    if (value === null || !weighable) return;
    setWeight.mutate({ date, valueKg: stepWeight(value, direction) });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Poids</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {/*
            A space rather than a dash while the query is in flight: a dash is
            an answer ("nothing"), and the point of keeping the states apart is
            that "not yet" must not look like one.
          */}
          {pending ? ' ' : hintFor(state, weighable)}
        </Text>
      </View>

      {pending ? null : !weighable ? (
        /*
          Nothing to create here, but anything already recorded is still shown.
          Read-only: no steps, and no way into the window.
        */
        state.kind === 'measured' ? (
          <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
            {formatWeight(state.valueKg)}
          </Text>
        ) : null
      ) : value === null ? (
        /*
          Nothing to step from. The window is the only way in, so the card says
          so in a word rather than offering two buttons that would compute on
          nothing.
        */
        <Pressable
          onPress={interactive ? onPress : undefined}
          disabled={!interactive}
          accessibilityRole="button"
          accessibilityLabel="Ajouter le poids de cette date"
          style={({ pressed }) => [
            styles.add,
            { backgroundColor: pressed ? theme.colors.background : 'transparent' },
          ]}
        >
          <Text style={[styles.addLabel, { color: theme.colors.accent }]}>Ajouter</Text>
        </Pressable>
      ) : (
        <View style={styles.stepper}>
          <StepButton
            symbol="minus"
            label={`Retirer ${WEIGHT_STEP_KG} kilogramme`}
            onPress={() => step(-1)}
            enabled={interactive}
          />

          <Pressable
            onPress={interactive ? onPress : undefined}
            disabled={!interactive}
            accessibilityRole="button"
            accessibilityLabel={
              state.kind === 'measured'
                ? `Poids : ${formatWeight(value)}. Modifier.`
                : `Aucune pesée. Reprise de ${formatWeight(value)}. Saisir.`
            }
            style={({ pressed }) => [
              styles.figureBox,
              { backgroundColor: pressed ? theme.colors.background : 'transparent' },
            ]}
          >
            <Text
              style={[
                styles.figure,
                {
                  // Muted while it is a PROPOSAL, full colour once it is a
                  // measurement. The one visual difference between a weight
                  // somebody stood on a scale for and one carried forward.
                  color:
                    state.kind === 'measured' ? theme.colors.text : theme.colors.textMuted,
                },
              ]}
            >
              {formatWeight(value)}
            </Text>
          </Pressable>

          <StepButton
            symbol="plus"
            label={`Ajouter ${WEIGHT_STEP_KG} kilogramme`}
            onPress={() => step(1)}
            enabled={interactive}
          />
        </View>
      )}
    </View>
  );
}

/** What the second line says, which is how the four states tell themselves apart. */
function hintFor(state: WeightPrefill, weighable: boolean): string {
  if (!weighable) {
    // A measurement that is already there is named as such; what is refused is
    // creating one, not having one.
    return state.kind === 'measured'
      ? 'Enregistré · date à venir'
      : 'Pas de pesée sur une date à venir';
  }

  switch (state.kind) {
    case 'measured':
      return 'Enregistré pour cette date';
    case 'carried':
      // The date it came from, always. A figure carried from three weeks ago is
      // worth proposing and worth labelling; the same figure with no date
      // beside it is a claim.
      return `Pas encore pesé · repris du ${formatDayAndMonth(state.from)}`;
    case 'none':
      return 'Pas encore pesé';
  }
}

function StepButton({
  symbol,
  label,
  onPress,
  enabled,
}: {
  symbol: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  enabled: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      // A generous target: these are the two most-tapped controls of the card,
      // and the iOS minimum is 44 points.
      hitSlop={8}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: pressed ? theme.colors.accent : theme.colors.background,
        },
      ]}
    >
      <SymbolView
        name={symbol}
        size={16}
        tintColor={theme.colors.accent}
        fallback={
          <Text style={[styles.stepFallback, { color: theme.colors.accent }]}>
            {symbol === 'plus' ? '+' : '−'}
          </Text>
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepFallback: { fontSize: 18, fontWeight: '600' },
  figureBox: {
    // Fixed, so the row does not shift as the figure goes from 78,4 to 100,1 —
    // a control that changes width under a finger tapping it repeatedly is the
    // one thing these buttons must not do.
    minWidth: 86,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  figure: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  add: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  addLabel: { fontSize: 16, fontWeight: '600' },
});
