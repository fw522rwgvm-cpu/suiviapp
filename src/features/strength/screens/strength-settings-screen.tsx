import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch } from 'react-native';
import { Text } from '@/core/ui/text';
import { DecimalInput } from '@/core/ui/decimal-input';
import { FormRow, FormSection } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';
import {
  useProgressionIncrement,
  useRestAlert,
  useSetRestAlert,
  useWriteProgressionIncrement,
} from '../data/exercise-queries';
import {
  MAX_PROGRESSION_INCREMENT_KG,
  MIN_PROGRESSION_INCREMENT_KG,
  formatIncrement,
  normalizeProgressionIncrement,
} from '../domain/exercise-draft';

/**
 * Réglages → Musculation (specs 12, "Incrément de progression global par
 * défaut").
 *
 * ## WHAT THIS SETTING DOES, SAID ON THE SCREEN RATHER THAN IN A COMMENT
 *
 * It is an INITIAL VALUE, not a rule. Changing it affects exercises created
 * afterwards and nothing that already exists — specs 6.3 makes the increment
 * "propre à l'exercice", and an exercise's own value is never re-read from
 * here.
 *
 * The line is on the page because the opposite assumption is the natural one: a
 * global setting that leaves everything unchanged is surprising unless it says
 * so. Without it, the first correction made here would silently do nothing the
 * reader expected.
 *
 * ## DecimalInput RATHER THAN A FIELD OF ITS OWN
 *
 * It already holds the half-typed state slice 8 found by shipping the opposite:
 * bound to a number, "2," parses to 2, re-renders as "2", and the separator
 * just typed disappears under the caret. Written on blur, for the same reason —
 * clamping a half-typed number moves the value while the caret is still in it.
 */
export function StrengthSettingsScreen() {
  const theme = useTheme();
  const stored = useProgressionIncrement();
  const restAlert = useRestAlert();
  const setRestAlert = useSetRestAlert();
  const write = useWriteProgressionIncrement();

  const [value, setValue] = useState<number | null>(null);

  // Takes the stored value once, when the query answers. NULL here is "not read
  // yet", never "no increment" — the distinction slice 4 paid for twice.
  useEffect(() => {
    if (stored.data !== undefined && value === null) setValue(stored.data);
  }, [stored.data, value]);

  function commit(): void {
    const clamped = normalizeProgressionIncrement(value);
    write.mutate(clamped);
    // Shown back CLAMPED, so what is displayed is what is stored. A field still
    // reading 500 after storing 50 is a field that lies quietly.
    setValue(clamped);
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <FormSection caption="PROGRESSION">
        <FormRow label="Incrément par défaut (kg)">
          <DecimalInput value={value} onChangeValue={setValue} onBlur={commit} placeholder="2,5" />
        </FormRow>
      </FormSection>

      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        Valeur de départ d’un nouvel exercice. Les exercices existants gardent la leur :
        l’incrément est propre à chaque exercice et se modifie sur sa fiche.
      </Text>

      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        {`Entre ${formatIncrement(MIN_PROGRESSION_INCREMENT_KG)} et ${formatIncrement(
          MAX_PROGRESSION_INCREMENT_KG,
        )} kg.`}
      </Text>

      <FormSection caption="REPOS">
        <FormRow label="Vibrer à la fin du repos">
          <Switch
            value={restAlert.data ?? true}
            onValueChange={(next) => setRestAlert.mutate(next)}
            accessibilityLabel="Vibrer à la fin du repos"
          />
        </FormRow>
      </FormSection>

      {/*
        THE LIMIT IS ON THE PAGE, not only in the code.

        Slice 11 rang the end of a rest with a local notification, which is what
        reached you with the phone in a pocket. A vibration is driven by the
        application, so it needs the application to be running — and somebody
        who turns this on and then locks their phone would otherwise read the
        silence as a bug.
      */}
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        La vibration ne se déclenche que si l’application est ouverte. Écran verrouillé
        ou application en arrière-plan, le repos se termine sans rien signaler.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 56 },
  note: { fontSize: 13, lineHeight: 19 },
});
