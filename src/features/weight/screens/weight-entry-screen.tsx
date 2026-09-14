import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatLongDate, formatWeight, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { Text } from '@/core/ui/text';
import { useDeleteWeight, useSetWeight, useWeight } from '../data/weight-queries';

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

  const existing = useWeight(date);
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
    if (loaded || existing.data === undefined) return;

    if (existing.data !== null) {
      // Written with the separator the field accepts and the user types, not
      // the one JavaScript prints.
      setText(String(existing.data).replace('.', ','));
    }
    setLoaded(true);

    // The focus places the cursor itself, so a selection set in the same tick
    // is overwritten. One frame later it holds.
    const frame = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [existing.data, loaded]);

  const valueKg = parseDecimal(text);
  // Zero is not a weight, and ck_weight_value would refuse it — but a CHECK
  // gives a SQLite error, and this is the line that can say so in French.
  const valid = valueKg !== null && valueKg > 0;
  const previous = existing.data ?? null;

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
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormSection>
          <FormRow label="Poids (kg)">
            <FormInput
              ref={field}
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
  // The same shapes free-entry-screen uses: these two buttons sit in the same
  // kind of window and must not be a second dialect of the same control.
  primary: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  destructive: { paddingVertical: 12, alignItems: 'center' },
  destructiveLabel: { fontSize: 16 },
});
