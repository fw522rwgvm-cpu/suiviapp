import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useTheme } from '@/core/theme';
import { ExerciseBody } from '../components/exercise-body';
import { useCreateExercise, useProgressionIncrement } from '../data/exercise-queries';
import {
  emptyExerciseDraft,
  validateExerciseDraft,
  type ExerciseDraft,
} from '../domain/exercise-draft';
import { problemText } from '../domain/exercise-text';

/**
 * CREATING an exercise (specs 10.1). Editing one happens on its own page.
 *
 * ## WHY CREATION IS STILL A WINDOW AND EDITING IS NOT
 *
 * Slice 3's rule is that acting on something opens a window OVER it, so the
 * thing acted on stays visible. Editing an exercise broke that on its own
 * terms: the window covered exactly the exercise it was changing, so nothing
 * stayed visible and a dismissal was spent for nothing. That moved onto the
 * page (specs 14.27), exactly as the routine editor did in slice 10.
 *
 * Creation has no such page — there is nothing to flip into edit mode when
 * nothing exists yet — so the window is what it has always been, opening over
 * the list the new exercise will join.
 *
 * The body is ExerciseBody, the same component the page renders, so the two
 * cannot drift about what an exercise looks like.
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
 */
export function ExerciseEditorScreen() {
  const increment = useProgressionIncrement();

  usePanelHeading('Nouvel exercice', null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {increment.data === undefined ? (
        <View style={styles.waiting}>
          <LoadingDots />
        </View>
      ) : (
        <EditorBody initial={emptyExerciseDraft(increment.data)} />
      )}
    </ScrollView>
  );
}

function EditorBody({ initial }: { initial: ExerciseDraft }) {
  const theme = useTheme();
  const dismiss = useDismiss();
  const create = useCreateExercise();

  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [submitted, setSubmitted] = useState(false);

  const problems = validateExerciseDraft(draft);

  function save(): void {
    setSubmitted(true);
    if (problems.length > 0) return;
    create.mutate(draft, { onSuccess: () => dismiss() });
  }

  return (
    <>
      <ExerciseBody draft={draft} editable onChange={setDraft} />

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

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  waiting: { paddingVertical: 48, alignItems: 'center' },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  save: { paddingVertical: 14, alignItems: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
