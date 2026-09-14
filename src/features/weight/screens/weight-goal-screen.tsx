import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addDays, type LocalDate } from '@/core/date';
import { formatLongDate, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { Segmented } from '@/core/ui/segmented';
import { Text } from '@/core/ui/text';
import { useToday } from '@/features/settings/data/settings-queries';
import {
  useActiveGoal,
  useDeactivateGoal,
  useDeleteGoal,
  useSetGoal,
} from '../data/weight-queries';
import type { WeightGoalMode } from '@/core/db/schema';
import { validateGoalDraft } from '../domain/weight-goal';
import { goalProblemText } from '../domain/weight-text';

/**
 * Defining, changing, switching off and deleting the weight goal
 * (specs 6.2, 9.2, 12).
 *
 * > Objectif de poids : poids cible, défini au choix par date cible (rythme
 * > calculé) ou par rythme visé en kg/semaine (date estimée). Modifiable et
 * > désactivable DEPUIS LES RÉGLAGES.
 *
 * ## ONE FORM, TWO MODES, AND ONLY ONE TERM EVER REACHES THE DATABASE
 *
 * The mode chooses which of the two questions is asked, and ck_weight_goal_terms
 * refuses a row carrying both — because one of them is DERIVED from the other
 * (specs 6.2) and D9 forbids storing what is derivable.
 *
 * So the idle field is not merely ignored on save: it is never sent.
 * setActiveGoal drops it, the CHECK would refuse it, and validateGoalDraft does
 * not complain about it. Three layers agreeing, which is what makes the rule
 * hard to undo by accident.
 *
 * ## DEACTIVATING IS NOT DELETING, AND THE SCREEN HAS TO SHOW BOTH
 *
 * Specs 6.2 lists "modifiable, désactivable, supprimable" as three different
 * actions. Offering only a delete would collapse two of them: switching a goal
 * off for a month while travelling is not the same as abandoning it, and a
 * deactivated goal keeps its target, its mode and the date it was set.
 */

const MODE_OPTIONS: { value: WeightGoalMode; label: string }[] = [
  { value: 'rate', label: 'Par rythme' },
  { value: 'target_date', label: 'Par date' },
];

export function WeightGoalScreen() {
  const theme = useTheme();
  const router = useRouter();

  const active = useActiveGoal();
  const setGoal = useSetGoal();
  const deactivate = useDeactivateGoal();
  const remove = useDeleteGoal();

  const goal = active.data ?? null;

  /**
   * The form starts from the active goal ONCE, then belongs to the user.
   *
   * Initialised from props in the state initialiser rather than corrected in an
   * effect — the rule slice 4 paid for on the quantity wheels, which spun as
   * they opened because an effect runs after its render has been painted. Here
   * the query may not have answered yet, so the body is only mounted once it
   * has (see the guard below): the value exists before the fields do.
   */
  if (active.data === undefined) {
    return <View style={{ backgroundColor: theme.colors.background }} />;
  }

  return (
    <GoalForm
      key={goal?.id ?? 'none'}
      initialMode={goal?.mode ?? 'rate'}
      initialTarget={goal === null ? '' : String(goal.targetKg).replace('.', ',')}
      initialRate={
        goal?.rateKgPerWeek === null || goal?.rateKgPerWeek === undefined
          ? ''
          : String(goal.rateKgPerWeek).replace('.', ',')
      }
      initialDate={goal?.targetDate ?? null}
      hasGoal={goal !== null}
      onSave={(draft) => setGoal.mutate(draft, { onSuccess: () => router.back() })}
      onDeactivate={() => deactivate.mutate(undefined, { onSuccess: () => router.back() })}
      onDelete={() => {
        if (goal === null) return;
        Alert.alert(
          'Supprimer l’objectif ?',
          'Vos pesées ne changent pas. Seul l’objectif disparaît.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => remove.mutate(goal.id, { onSuccess: () => router.back() }),
            },
          ],
        );
      }}
    />
  );
}

/**
 * The body, mounted only once the goal is known.
 *
 * Split out for the reason the quantity screen is: a component whose state is
 * initialised from a value cannot be mounted before that value exists, and
 * `key` on the goal's identity is what remounts it when a different goal
 * becomes active.
 */
function GoalForm({
  initialMode,
  initialTarget,
  initialRate,
  initialDate,
  hasGoal,
  onSave,
  onDeactivate,
  onDelete,
}: {
  initialMode: WeightGoalMode;
  initialTarget: string;
  initialRate: string;
  initialDate: LocalDate | null;
  hasGoal: boolean;
  onSave: (draft: {
    targetKg: number;
    mode: WeightGoalMode;
    targetDate: LocalDate | null;
    rateKgPerWeek: number | null;
  }) => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  const [mode, setMode] = useState<WeightGoalMode>(initialMode);
  const [target, setTarget] = useState(initialTarget);
  const [rate, setRate] = useState(initialRate);
  const [date, setDate] = useState<LocalDate | null>(initialDate);

  const draft = {
    targetKg: parseDecimal(target),
    mode,
    targetDate: date,
    rateKgPerWeek: parseDecimal(rate),
  };

  /**
   * Today comes from useToday, never from a Date of our own.
   *
   * core/date is the single entry point (D3), and the shortcut that suggests
   * itself here — new Date().toISOString().slice(0, 10) — is wrong twice over:
   * it is a forbidden construction, and toISOString answers in UTC, so east of
   * Greenwich it names TOMORROW for most of the evening. A target date
   * validated against the wrong day is refused or accepted one day out, which
   * is the plausible kind of wrong.
   */
  const today = useToday();
  const problems = validateGoalDraft(draft, today);
  const valid = problems.length === 0 && draft.targetKg !== null;

  return (
    <FormNavigation>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {/*
            Segmented is generic over its value type, so onChange hands back a
            WeightGoalMode already narrowed — no lookup, and no way for a third
            string to reach setMode.
          */}
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} grow />

          <FormSection>
            <FormRow label="Poids cible (kg)">
              <FormInput
                value={target}
                onChangeText={setTarget}
                placeholder="0,0"
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </FormRow>

            {mode === 'rate' ? (
              <FormRow label="Rythme (kg/sem)">
                <FormInput
                  value={rate}
                  onChangeText={setRate}
                  // A rate is SIGNED: negative loses weight. The minus has to be
                  // typeable, so this is not a decimal-pad — that keypad has no
                  // sign key at all, and a goal to lose weight would be
                  // unenterable.
                  keyboardType="numbers-and-punctuation"
                  placeholder="-0,35"
                  selectTextOnFocus
                />
              </FormRow>
            ) : (
              <FormRow label="Date cible">
                <DateStepper date={date} onChange={setDate} today={today} />
              </FormRow>
            )}
          </FormSection>

          {problems.length === 0 ? null : (
            <View style={styles.problems}>
              {problems.map((problem) => (
                <Text
                  key={problem}
                  style={[styles.problem, { color: theme.colors.danger }]}
                >
                  {goalProblemText(problem)}
                </Text>
              ))}
            </View>
          )}

          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            {mode === 'rate'
              ? 'La date d’atteinte est estimée à partir de votre poids lissé. Un rythme nul veut dire maintien.'
              : 'Le rythme à tenir est calculé à partir de votre poids lissé, et se recalcule chaque jour.'}
          </Text>

          <Pressable
            onPress={() => {
              if (!valid || draft.targetKg === null) return;
              onSave({ ...draft, targetKg: draft.targetKg });
            }}
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

          {!hasGoal ? null : (
            <>
              <Pressable
                onPress={onDeactivate}
                accessibilityRole="button"
                style={styles.secondary}
              >
                <Text style={[styles.secondaryLabel, { color: theme.colors.accent }]}>
                  Désactiver l’objectif
                </Text>
              </Pressable>

              <Pressable onPress={onDelete} accessibilityRole="button" style={styles.secondary}>
                <Text style={[styles.secondaryLabel, { color: theme.colors.danger }]}>
                  Supprimer l’objectif
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </FormNavigation>
  );
}

/**
 * A date chosen by stepping, not by typing.
 *
 * ## NO DATE PICKER, AND NO NEW DEPENDENCY FOR ONE
 *
 * A target date is always some weeks or months out, never an exact day someone
 * has in mind — and section 5 carries no date picker. @react-native-picker is
 * in the tree, but a UIPickerView of every day for two years is a scroll, not a
 * choice.
 *
 * So: steps of a week and of a month, from today. Four taps reach three months
 * out, which is the granularity a weight goal actually has.
 */
function DateStepper({
  date,
  onChange,
  today,
}: {
  date: LocalDate | null;
  onChange: (date: LocalDate) => void;
  today: LocalDate;
}) {
  const theme = useTheme();
  // A sensible starting point rather than nothing: twelve weeks is a quarter,
  // which is the horizon a weight goal is usually set against.
  const current = date ?? addDays(today, 84);

  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(addDays(current, -7))}
        accessibilityRole="button"
        accessibilityLabel="Une semaine plus tôt"
        style={styles.step}
      >
        <Text style={[styles.stepLabel, { color: theme.colors.accent }]}>−7 j</Text>
      </Pressable>

      <Text style={[styles.stepperDate, { color: theme.colors.text }]}>
        {formatLongDate(current)}
      </Text>

      <Pressable
        onPress={() => onChange(addDays(current, 7))}
        accessibilityRole="button"
        accessibilityLabel="Une semaine plus tard"
        style={styles.step}
      >
        <Text style={[styles.stepLabel, { color: theme.colors.accent }]}>+7 j</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  problems: { gap: 4 },
  problem: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 13, lineHeight: 18 },
  primary: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryLabel: { fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { paddingHorizontal: 8, paddingVertical: 4 },
  stepLabel: { fontSize: 15, fontWeight: '600' },
  stepperDate: { fontSize: 15, flex: 1, textAlign: 'center' },
});
