import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import type { ExerciseId } from '@/core/db/schema';
import { ExerciseBody } from '../components/exercise-body';
import {
  useDeleteExercise,
  useExerciseDraft,
  useExerciseUsage,
  useUpdateExercise,
} from '../data/exercise-queries';
import {
  sameExerciseDraft,
  validateExerciseDraft,
  type ExerciseDraft,
} from '../domain/exercise-draft';
import { deletionWarning, problemText } from '../domain/exercise-text';

/**
 * The page of one exercise (specs 10.1), which is also where it is edited.
 *
 * WHAT IS NOT HERE YET, and it is most of what specs 10.1 lists: the charts,
 * the personal records, the complete history. All four need session_set, which
 * is slice 11's table — a page showing an empty chart would be a layer built
 * "for later", which section 7 rules out. What ships is what has data behind
 * it: the body map, identity, notes, and the increment.
 *
 * ## EDITING HAPPENS HERE, NOT IN A WINDOW
 *
 * Asked for (specs 14.27), and it is the same correction the routine page made
 * in slice 10 for the same reason. Slice 3's rule is that acting on something
 * opens a window OVER it, so the thing acted on stays visible; a window that
 * covers exactly the exercise it is changing gains nothing and spends a
 * dismissal. CREATION IS STILL A WINDOW — there is no page to flip when nothing
 * exists yet.
 *
 * ## WHILE EDITING THERE IS ONE WAY OUT, AND IT IS GUARDED
 *
 * The back button and the swipe are both off. That is not a restriction for its
 * own sake: an edit with unsaved changes has exactly two honest endings, saving
 * and discarding, and a gesture that means "go back" cannot be told apart from
 * either. So the way out is named — "Annuler" — and it asks before throwing
 * anything away.
 */
type Mode = { kind: 'reading' } | { kind: 'editing'; draft: ExerciseDraft };

export function ExerciseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = toEntityId<ExerciseId>(params.id ?? '');

  const stored = useExerciseDraft(id);
  const usage = useExerciseUsage(id);
  const update = useUpdateExercise();
  const remove = useDeleteExercise();

  const [mode, setMode] = useState<Mode>({ kind: 'reading' });
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Fall back to reading if the exercise disappears under us — deleted from
   * elsewhere, or an import swapping the database. Editing one that no longer
   * exists would save rows nothing points at.
   */
  useEffect(() => {
    if (stored.data === null && mode.kind !== 'reading') setMode({ kind: 'reading' });
  }, [stored.data, mode.kind]);

  if (id === null) return <Missing />;

  // undefined is "not answered yet"; null is "no such exercise". Keeping the
  // two apart is what stops a stale link rendering as a blank page forever.
  if (stored.data === undefined) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }
  if (stored.data === null) return <Missing />;

  const saved = stored.data;
  const editing = mode.kind === 'editing';
  const draft = mode.kind === 'editing' ? mode.draft : saved;
  const problems = editing ? validateExerciseDraft(draft) : [];

  function startEditing(): void {
    if (stored.data == null) return;
    setSubmitted(false);
    setMode({ kind: 'editing', draft: stored.data });
  }

  function save(): void {
    if (!editing || id === null) return;
    setSubmitted(true);
    if (validateExerciseDraft(draft).length > 0) return;

    update.mutate({ id, draft }, { onSuccess: () => setMode({ kind: 'reading' }) });
  }

  /**
   * Leaving the edit without saving (specs 14.27).
   *
   * Nothing is asked when nothing was touched: a confirmation on a form that is
   * still exactly as it was opened is the kind that teaches people to tap
   * through confirmations without reading them.
   */
  function cancel(): void {
    if (stored.data != null && !sameExerciseDraft(draft, stored.data)) {
      Alert.alert('Abandonner les modifications ?', 'Elles ne seront pas enregistrées.', [
        { text: 'Continuer', style: 'cancel' },
        {
          text: 'Abandonner',
          style: 'destructive',
          onPress: () => setMode({ kind: 'reading' }),
        },
      ]);
      return;
    }
    setMode({ kind: 'reading' });
  }

  function confirmDelete() {
    if (id === null) return;
    /**
     * THE ONE WARNING SPECS 5.3 KEEPS, and it keeps it because this deletion
     * genuinely destroys something:
     *
     * > Supprimer un exercice possédant des séances affiche un avertissement
     * > nommant explicitement ce qui sera perdu.
     *
     * Naming means counting first, which is why routine_line.exercise_id is NO
     * ACTION and readExerciseUsage exists. A cascade would have done the same
     * work silently and left this text guessing.
     *
     * Sessions do not exist yet, so what is named is the routines. Slice 11
     * adds the rest of the sentence.
     */
    Alert.alert(
      `Supprimer « ${saved.name} » ?`,
      deletionWarning(usage.data ?? { routineNames: [], lineCount: 0 }),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            remove.mutate(id, {
              onSuccess: () => router.back(),
              onError: () => setDeleting(false),
            });
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: editing ? 'Modifier' : saved.name,
          /*
            No way back while editing, and no swipe either: the only honest
            endings are saving and discarding, and neither of them is what a
            back gesture means. See the note at the top.
          */
          headerBackVisible: !editing,
          gestureEnabled: !editing,
          headerRight: () => (
            /*
              A bare Pressable with its symbol, never a GlassButton: on iOS 26
              the bar already lays its own material behind what it is given, so
              glass in a header is glass inside glass — a button inside a
              button, and it shows.
            */
            <Pressable
              onPress={editing ? cancel : startEditing}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Annuler' : 'Modifier'}
            >
              {editing ? (
                <Text style={{ color: theme.colors.accent, fontSize: 16 }}>Annuler</Text>
              ) : (
                <SymbolView name="pencil" size={19} tintColor={theme.colors.accent} />
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ExerciseBody
          draft={draft}
          editable={editing}
          onChange={(next) =>
            setMode((current) =>
              current.kind === 'reading' ? current : { kind: 'editing', draft: next },
            )
          }
        />

        {/*
          Problems appear only once a save has been ATTEMPTED. A form that goes
          red as you type your first letter scolds; one that waits until you say
          you are finished helps.
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

        {editing ? (
          <Pressable
            onPress={save}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.lg,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.colors.onAccent, fontSize: 16, fontWeight: '600' }}>
              Enregistrer
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.delete,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                opacity: pressed || deleting ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>
              Supprimer l’exercice
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function Missing() {
  const theme = useTheme();
  return (
    <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.textMuted }}>Cet exercice n’existe plus.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 56 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  primary: { paddingVertical: 14, alignItems: 'center' },
  delete: { paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteLabel: { fontSize: 16, fontWeight: '500' },
});
