import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatLongDate, formatWeight, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useSettled } from '@/core/query/use-settled';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { Text } from '@/core/ui/text';
import { useToday } from '@/features/settings/data/settings-queries';
import { useDeleteWeight, useSetWeight, useWeightPrefill } from '../data/weight-queries';
import { canWeighOn, prefillValue } from '../domain/weight-prefill';

/**
 * Recording a weight on one date (specs 9.1).
 *
 * > Une mesure au plus par date. Une nouvelle saisie sur une date déjà
 * > renseignée écrase la précédente, APRÈS CONFIRMATION.
 *
 * ## THE CONFIRMATION IS HERE AND NOWHERE ELSE
 *
 * The write is an upsert and deliberately stays one: it also serves the seed,
 * the import and a correction made from the history, and asking all of them to
 * be excused would be the wrong shape. So the screen is what asks — and asks
 * ONLY when there is something to overwrite. Weighing on a blank date, which is
 * every ordinary morning, costs no dialogue at all.
 *
 * That is not a softening of specs 9.1: "une nouvelle saisie sur une date DÉJÀ
 * RENSEIGNÉE écrase la précédente, après confirmation" is exactly this
 * condition. A dialogue on every weighing would be the thing slice 4 removed
 * everywhere else — an answered question asked again, which is how a dialog
 * becomes something dismissed without reading.
 *
 * ## IT OPENS ON THE FIGURE THE CARD WAS SHOWING
 *
 * Its own measurement if the date has one, otherwise the last weighing before
 * it (specs 14.15). Both come from `weightPrefill`, the same function the card
 * reads — so the window never opens on a different number from the one that was
 * tapped, whatever the state.
 *
 * A CARRIED figure is pre-filled but nothing is written until Enregistrer:
 * "ce que l'utilisateur enregistre explicitement s'écrit ; ce qu'il se contente
 * de consulter non", the rule ensureMaterialized and ensureOffFood both follow.
 * Opening this window on a date and closing it leaves exactly nothing.
 *
 * ## THE FIELD IS FILLED FROM A QUERY, SO autoFocus IS WRONG HERE
 *
 * Slice 3 established the rule and slice 4 the exception. autoFocus fires at
 * MOUNT; the existing weight arrives from React Query a tick later, so
 * selectTextOnFocus would dutifully select an empty string and then the value
 * would appear with the cursor wherever iOS left it — filled but not selected,
 * costing a tap to clear.
 *
 * So: no autoFocus, and focus from the effect that sets the value, inside a
 * requestAnimationFrame. selectTextOnFocus stays, for every LATER tap on the
 * field, where it lands in the case that works — focusing a field already full.
 */
export function WeightEntryScreen({ date }: { date: LocalDate }) {
  const theme = useTheme();
  const dismiss = useDismiss();

  usePanelHeading('Poids', formatLongDate(date));

  const today = useToday();
  const prefill = useWeightPrefill(date);
  // Only once the bus has stopped flagging it: correcting a weight and
  // reopening the same date would otherwise fill the field from the value
  // BEFORE the correction, and saving would write it back. See
  // core/query/use-settled.
  const settled = useSettled(prefill);
  const setWeight = useSetWeight();
  const deleteWeight = useDeleteWeight();

  const field = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

  /**
   * `undefined` is "not yet", `null` is "never weighed". Two different things,
   * and folding them together is the defect slice 4 paid for twice — the
   * quantity wheels that opened in grams, and the editor that hung on loading
   * dots for ever. Here it would open an empty field on a date that has a
   * measurement, and the user would type a second one over it.
   */
  useEffect(() => {
    if (loaded || settled === undefined) return;

    const proposed = prefillValue(settled);
    if (proposed !== null) {
      // Written with the separator the field accepts and the user types, not
      // the one JavaScript prints.
      setText(String(proposed).replace('.', ','));
    }
    setLoaded(true);

    // The focus places the cursor itself, so a selection set in the same tick
    // is overwritten. One frame later it holds.
    const frame = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [settled, loaded]);

  const valueKg = parseDecimal(text);
  /**
   * Weighing ahead is refused (specs 14.15, amending 9.1).
   *
   * Checked here as well as on the card, because this screen is a ROUTE: the
   * date arrives as a string parameter, and the scheme is registered, so a deep
   * link can ask for any date at all. The rule cannot be a CHECK — "in the
   * future" is a relation to the clock, not a property of the row — so the
   * boundary is where it has to live.
   */
  const weighable = canWeighOn(date, today);
  // Zero is not a weight, and ck_weight_value would refuse it — but a CHECK
  // gives a SQLite error, and this is the line that can say so in French.
  const valid = weighable && valueKg !== null && valueKg > 0;
  /**
   * Only a MEASUREMENT counts as something to overwrite or delete.
   *
   * A carried figure is a proposal: there is nothing on this date to confirm
   * replacing, and nothing to offer to delete. Reading `prefillValue` here
   * instead would put a "Supprimer la mesure" button under a date that has
   * none.
   */
  const previous = settled?.kind === 'measured' ? settled.valueKg : null;

  const close = { onSuccess: dismiss };

  function save(): void {
    if (!valid || valueKg === null) return;

    if (previous === null) {
      setWeight.mutate({ date, valueKg }, close);
      return;
    }

    Alert.alert(
      'Remplacer la mesure ?',
      `Cette date porte déjà ${formatWeight(previous)}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Remplacer',
          style: 'destructive',
          onPress: () => setWeight.mutate({ date, valueKg }, close),
        },
      ],
    );
  }

  function remove(): void {
    // No confirmation, and the rule is the one slice 4 settled: getting here
    // means opening the measurement and pressing a button that says what it
    // does. Specs 5.3 reserves a warning for a deletion that destroys
    // something, and nothing in the database points at a measurement.
    deleteWeight.mutate(date, close);
  }

  return (
    <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
      >
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {weighable ? null : (
          <Text style={[styles.refusal, { color: theme.colors.textMuted }]}>
            Cette date est à venir. Le poids se saisit le jour même ou après, jamais
            à l’avance.
          </Text>
        )}

        <FormSection>
          <FormRow label="Poids (kg)">
            <FormInput
              ref={field}
              editable={weighable}
              value={text}
              onChangeText={setText}
              placeholder="0,0"
              keyboardType="decimal-pad"
              selectTextOnFocus
              onSubmitEditing={save}
              returnKeyType="done"
            />
          </FormRow>
        </FormSection>

        <Pressable
          onPress={save}
          disabled={!valid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid }}
          style={[
            styles.primary,
            { backgroundColor: valid ? theme.colors.accent : theme.colors.border },
          ]}
        >
          <Text
            style={[
              styles.primaryLabel,
              { color: valid ? theme.colors.onAccent : theme.colors.textFaint },
            ]}
          >
            Enregistrer
          </Text>
        </Pressable>

        {previous === null ? null : (
          <Pressable onPress={remove} accessibilityRole="button" style={styles.destructive}>
            <Text style={[styles.destructiveLabel, { color: theme.colors.danger }]}>
              Supprimer la mesure
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  refusal: { fontSize: 14, lineHeight: 20 },
  // The same shapes free-entry-screen uses: these two buttons sit in the same
  // kind of window and must not be a second dialect of the same control.
  primary: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  destructive: { paddingVertical: 12, alignItems: 'center' },
  destructiveLabel: { fontSize: 16 },
});
