import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/core/ui/text';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import { MUSCLES, EQUIPMENT, type ExerciseId, type Muscle } from '@/core/db/schema';
import {
  useCreateExercise,
  useExerciseDraft,
  useProgressionIncrement,
  useUpdateExercise,
} from '../data/exercise-queries';
import {
  emptyExerciseDraft,
  muscleRoles,
  toggleSecondary,
  validateExerciseDraft,
  type ExerciseDraft,
} from '../domain/exercise-draft';
import { BodyMapView } from '../components/body-map-view';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../domain/vocabulary';
import { problemText } from '../domain/exercise-text';

/**
 * Creating and editing an exercise (specs 10.1, "Bouton de création",
 * "Exercice éditable").
 *
 * A WINDOW OVER THE LIST, not a pushed screen: slice 3's rule is that
 * consulting is a push and ACTING on something is a window over it. Creating an
 * exercise is acting on the library, so it opens on top of it.
 *
 * ## THE BODY WAITS FOR ITS VALUE; THE SCROLL VIEW DOES NOT
 *
 * The shape slice 4 arrived at after the quantity wheels spun on opening. An
 * effect runs AFTER its render has been painted, so a form that mounts on a
 * default and moves when the query answers is a form that visibly moves. And
 * swapping a View for a ScrollView between the two states is what made the day
 * page jump — UIKit recomputes a new scroll view's content inset from scratch,
 * and under a transparent header that inset is not zero.
 *
 * So: ONE ScrollView in both states, and only the BODY waits. It gets its
 * initial draft from a pure function at useState time, never from an effect.
 *
 * NULL MEANS "NOT YET", NEVER "NONE" — the trap the same slice named. Creating
 * a new exercise has nothing to wait for once the increment is known, so it
 * states its starting draft rather than waiting forever on a query that will
 * never answer with a row.
 */
export function ExerciseEditorScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id === undefined ? null : toEntityId<ExerciseId>(params.id);

  const stored = useExerciseDraft(id);
  const increment = useProgressionIncrement();

  usePanelHeading(id === null ? 'Nouvel exercice' : 'Modifier l’exercice', null);

  // What the body needs before it can mount: an existing draft, or the default
  // increment a new one starts from. Either is a value, and neither is a
  // default the form would have to move off later.
  const initial: ExerciseDraft | null =
    id === null
      ? increment.data === undefined
        ? null
        : emptyExerciseDraft(increment.data)
      : (stored.data ?? null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {initial === null ? <Waiting /> : <EditorBody initial={initial} exerciseId={id} />}
    </ScrollView>
  );
}

function Waiting() {
  return (
    <View style={styles.waiting}>
      <LoadingDots />
    </View>
  );
}

function EditorBody({
  initial,
  exerciseId,
}: {
  initial: ExerciseDraft;
  exerciseId: ExerciseId | null;
}) {
  const theme = useTheme();
  const dismiss = useDismiss();
  const create = useCreateExercise();
  const update = useUpdateExercise();

  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [submitted, setSubmitted] = useState(false);

  // The body is keyed on the draft's identity by its caller, so this only ever
  // runs when a genuinely different exercise arrives — never to correct a
  // default, which is the whole point of taking `initial` at useState time.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const problems = validateExerciseDraft(draft);
  const canSave = problems.length === 0;

  function save(): void {
    setSubmitted(true);
    if (!canSave) return;

    if (exerciseId === null) create.mutate(draft, { onSuccess: () => dismiss() });
    else update.mutate({ id: exerciseId, draft }, { onSuccess: () => dismiss() });
  }

  return (
    <>
      <FormSection caption="IDENTITÉ">
        <FormRow label="Nom">
          <FormInput
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            placeholder="Développé couché"
            autoCapitalize="sentences"
          />
        </FormRow>
        <FormRow label="Incrément (kg)">
          <FormInput
            value={draft.incrementKg}
            onChangeText={(incrementKg) => setDraft((current) => ({ ...current, incrementKg }))}
            keyboardType="decimal-pad"
            placeholder="2,5"
          />
        </FormRow>
      </FormSection>

      {/*
        WHAT THE CHIPS BELOW ARE SAYING, ON A BODY (specs 14.24).

        The vocabulary is invented — fifteen names chosen in slice 10, never
        confronted with a real exercise — so "lats" or "traps" is a word before
        it is a place. The figure is what turns the choice back into anatomy,
        and it is the only thing on this form that can tell you the chip you
        just tapped is not the muscle you meant.

        Shaded by ROLE rather than by volume: an exercise has no sets to count.
        The same component the routine page uses, so the two cannot drift about
        where a muscle is.
      */}
      <View
        style={[
          styles.map,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <BodyMapView
          muscles={[draft.primaryMuscle, ...draft.secondaryMuscles]}
          roles={muscleRoles(draft.primaryMuscle, draft.secondaryMuscles)}
          height={200}
        />
      </View>

      <ChoiceGroup
        caption="MUSCLE PRINCIPAL"
        options={MUSCLES.map((value) => ({ value, label: MUSCLE_LABELS[value] }))}
        selected={[draft.primaryMuscle]}
        onPress={(value) => {
          const muscle = MUSCLES.find((item) => item === value);
          if (muscle !== undefined) setDraft((c) => ({ ...c, primaryMuscle: muscle }));
        }}
      />

      <ChoiceGroup
        caption="MUSCLES SECONDAIRES"
        options={MUSCLES.filter((m) => m !== draft.primaryMuscle).map((value) => ({
          value,
          label: MUSCLE_LABELS[value],
        }))}
        selected={[...draft.secondaryMuscles]}
        onPress={(value) => {
          const muscle = MUSCLES.find((item) => item === value);
          if (muscle === undefined) return;
          setDraft((c) => ({
            ...c,
            secondaryMuscles: toggleSecondary(c.secondaryMuscles, muscle),
          }));
        }}
      />

      <ChoiceGroup
        caption="MATÉRIEL"
        options={EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }))}
        selected={draft.equipment === null ? [] : [draft.equipment]}
        onPress={(value) => {
          const item = EQUIPMENT.find((option) => option === value);
          setDraft((c) => ({
            ...c,
            // Tapping the selected one clears it, as a filter chip does.
            equipment: item === undefined || c.equipment === item ? null : item,
          }));
        }}
      />

      <FormSection caption="NOTES">
        <NoteField
          label="Exécution"
          value={draft.noteExecution}
          onChange={(noteExecution) => setDraft((c) => ({ ...c, noteExecution }))}
        />
        <NoteField
          label="Réglage"
          value={draft.noteSetup}
          onChange={(noteSetup) => setDraft((c) => ({ ...c, noteSetup }))}
        />
        <NoteField
          label="Respiration"
          value={draft.noteBreathing}
          onChange={(noteBreathing) => setDraft((c) => ({ ...c, noteBreathing }))}
        />
        <NoteField
          label="Erreurs fréquentes"
          value={draft.noteMistakes}
          onChange={(noteMistakes) => setDraft((c) => ({ ...c, noteMistakes }))}
        />
      </FormSection>

      {/*
        Problems appear only once a save has been ATTEMPTED. A form that goes
        red as you start typing your first letter is a form that scolds; one
        that waits until you say you are finished is one that helps.
      */}
      {submitted && problems.length > 0 ? (
        <View style={styles.problems}>
          {problems.map((problem) => (
            <Text key={problem.kind} style={[styles.problem, { color: theme.colors.danger }]}>
              {problemText(problem)}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={save}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.save,
          {
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radius.lg,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.saveLabel, { color: theme.colors.onAccent }]}>Enregistrer</Text>
      </Pressable>
    </>
  );
}

function NoteField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormRow label={label}>
      <FormInput
        value={value}
        onChangeText={onChange}
        placeholder="Facultatif"
        multiline
        autoCapitalize="sentences"
      />
    </FormRow>
  );
}

/**
 * A group of chips, for a choice with more options than a segmented control
 * can hold.
 *
 * Fifteen muscles do not fit in a segmented control and would not fit in a
 * picker wheel either without hiding fourteen of them behind a scroll. Chips
 * wrap, show every option at once, and are the same control the filter strips
 * use — so choosing a muscle and filtering on one look alike, which they
 * should: they name the same thing.
 */
function ChoiceGroup({
  caption,
  options,
  selected,
  onPress,
}: {
  caption: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onPress: (value: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{caption}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => onPress(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                  borderColor: active ? theme.colors.accent : theme.colors.border,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? theme.colors.onAccent : theme.colors.text },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

void (undefined as unknown as Muscle);

const styles = StyleSheet.create({
  map: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    // The figures are drawn to the top of their viewBox and carry their own
    // air above; the card owes them the bottom, as the routine page's does.
    paddingBottom: 12,
  },
  content: { padding: 16, gap: 20, paddingBottom: 48 },
  waiting: { paddingVertical: 48, alignItems: 'center' },
  group: { gap: 8 },
  caption: { fontSize: 12, letterSpacing: 0.6, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14, fontWeight: '500' },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  save: { paddingVertical: 14, alignItems: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
