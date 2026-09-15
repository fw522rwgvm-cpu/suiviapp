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
 * ## THE CARD CARRIES NO TITLE OF ITS OWN
 *
 * The page heading above it already says "Poids", and the same word twice in
 * eighteen points of vertical space is the word saying nothing the second time.
 * Same reasoning that took the section titles off the recipe and recent-meal
 * lists once the filter named them.
 *
 * What is left is the figure and its two buttons, centred and large — the whole
 * content of the card is now the control, so it is sized like one.
 *
 * ## THE SECOND LINE SURVIVES ONLY WHERE IT SAYS SOMETHING THE FIGURE CANNOT
 *
 * A measured weight needs no caption: the figure IS the statement, and
 * "enregistré pour cette date" only repeated what a solid black number already
 * meant.
 *
 * A CARRIED figure is a different matter and keeps its line. It is the one
 * thing the number cannot say — that nobody stood on a scale for it, and which
 * day it came from. Dropping it would leave the distinction resting on a shade
 * of grey, and a grey number does not explain itself. The muted colour and the
 * line are one signal in two parts, not two signals.
 *
 * ## FOUR STATES, AND MERGING ANY TWO OF THEM STATES SOMETHING FALSE
 *
 *  - MEASURED — weighed. Figure in full colour, no caption, ± corrects it.
 *  - CARRIED — not weighed; the figure is a PROPOSAL, muted and dated.
 *  - NONE — nothing ever weighed before this date, so there is nothing to step
 *    from: the card offers the window instead of arithmetic on nothing.
 *  - FUTURE — weighing ahead is refused (specs 14.15). A measurement already
 *    there is still shown, read-only: refusing to CREATE one is not a reason to
 *    hide one that exists.
 *
 * ## THE THREE TARGETS ARE SIBLINGS, NEVER NESTED
 *
 * "−", the figure, "+". A Pressable inside a Pressable is the trap this project
 * has already paid for once. The figure carries the tap that opens the window,
 * and the two buttons sit beside it.
 *
 * ## A STEP WRITES IMMEDIATELY, AND WITHOUT A CONFIRMATION
 *
 * A button that only moved a draft would need a second tap to commit — exactly
 * the tap these exist to remove. And no overwrite confirmation: specs 9.1
 * guards a NEW SAYING typed over a measurement you cannot see, whereas a step
 * starts FROM the figure on screen and moves it one visible digit.
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
  const note = pending ? null : noteFor(state, weighable);

  function step(direction: number): void {
    if (value === null || !weighable) return;
    setWeight.mutate({ date, valueKg: stepWeight(value, direction) });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      {/*
        A held height while the query is in flight, so the card does not grow
        under the meals the moment it answers. Local SQLite takes tens of
        milliseconds; a page that resized in that time is the settling the
        carousel spent slice 3 removing.
      */}
      {pending ? (
        <View style={styles.pendingRow} />
      ) : !weighable ? (
        state.kind === 'measured' ? (
          <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
            {formatWeight(state.valueKg)}
          </Text>
        ) : null
      ) : value === null ? (
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
                  // measurement — half of the signal, the other half being the
                  // line underneath.
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

      {note === null ? null : (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>{note}</Text>
      )}
    </View>
  );
}

/**
 * The second line, where there is one.
 *
 * A measured weight returns null: the figure says it, and a caption repeating
 * it is the one that gets skipped and then ignored everywhere else too.
 */
function noteFor(state: WeightPrefill, weighable: boolean): string | null {
  if (!weighable) {
    // Without this the card would be blank on a future date, with nothing to
    // explain why. A measurement already there is named as such.
    return state.kind === 'measured'
      ? 'Enregistré · date à venir'
      : 'Pas de pesée sur une date à venir';
  }

  switch (state.kind) {
    case 'measured':
      return null;
    case 'carried':
      // The one thing the figure cannot say: nobody stood on a scale for it,
      // and this is the day it came from.
      return `Repris du ${formatDayAndMonth(state.from)}`;
    case 'none':
      // The "Ajouter" button already says what there is to do.
      return null;
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
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: pressed ? theme.colors.border : theme.colors.background },
      ]}
    >
      <SymbolView
        name={symbol}
        size={20}
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

/**
 * Forty-four points, which is Apple's minimum touch target rather than a number
 * that looked right. These two are the most-tapped controls of the page, and
 * the card has nothing else in it to make room for.
 */
const STEP_SIZE = 44;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  // The same height the stepper occupies, so nothing moves when it arrives.
  pendingRow: { height: STEP_SIZE },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: STEP_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepFallback: { fontSize: 22, fontWeight: '600' },
  figureBox: {
    // Fixed, so the row does not shift as the figure goes from 78,4 to 100,1 —
    // a control that changes width under a finger tapping it repeatedly is the
    // one thing these buttons must not do.
    minWidth: 132,
    borderRadius: 12,
    paddingVertical: 4,
    alignItems: 'center',
  },
  figure: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13 },
  add: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  addLabel: { fontSize: 17, fontWeight: '600' },
});
