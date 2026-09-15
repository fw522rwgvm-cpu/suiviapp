import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { FormRow, FormSection } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import type { ExerciseId } from '@/core/db/schema';
import {
  useDeleteExercise,
  useExercise,
  useExerciseUsage,
} from '../data/exercise-queries';
import { equipmentLabel, muscleLabel } from '../domain/vocabulary';
import { deletionWarning } from '../domain/exercise-text';

/**
 * The page of one exercise (specs 10.1).
 *
 * WHAT IS NOT HERE YET, and it is most of what specs 10.1 lists: the charts,
 * the personal records, the complete history. All four need session_set, which
 * is slice 11's table — a page showing an empty chart would be a layer built
 * "for later", which section 7 rules out. What ships is what has data behind
 * it: identity, notes, and the increment.
 *
 * A PUSH RATHER THAN A WINDOW, which is slice 3's rule: consulting is a push,
 * acting on something is a window over it. Editing therefore opens a panel from
 * here, and deleting asks from here without going anywhere.
 */
export function ExerciseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = toEntityId<ExerciseId>(params.id ?? '');

  const exercise = useExercise(id);
  const usage = useExerciseUsage(id);
  const remove = useDeleteExercise();
  const [deleting, setDeleting] = useState(false);

  if (id === null) return <Missing />;

  // undefined is "not answered yet"; null is "no such exercise". Keeping the
  // two apart is what stops a stale link rendering as a blank page forever.
  if (exercise.data === undefined) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }
  if (exercise.data === null) return <Missing />;

  const view = exercise.data;
  const equipment = equipmentLabel(view.equipment);

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
      `Supprimer « ${view.name} » ?`,
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
          title: view.name,
          headerRight: () => (
            /*
              A bare Pressable with its symbol, never a GlassButton: on iOS 26
              the bar already lays its own material behind what it is given, so
              glass in a header is glass inside glass — a button inside a
              button, and it shows.
            */
            <Pressable
              onPress={() => router.push(`/(modals)/exercise-edit?id=${view.id}`)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Modifier"
            >
              <SymbolView name="pencil" size={19} tintColor={theme.colors.accent} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormSection caption="EXERCICE">
          <FormRow label="Muscle principal">
            <Value text={muscleLabel(view.primaryMuscle)} />
          </FormRow>
          {view.secondaryMuscles.length === 0 ? null : (
            <FormRow label="Muscles secondaires">
              <Value text={view.secondaryMuscles.map(muscleLabel).join(', ')} />
            </FormRow>
          )}
          {equipment === null ? null : (
            <FormRow label="Matériel">
              <Value text={equipment} />
            </FormRow>
          )}
          <FormRow label="Incrément">
            <Value text={`${formatKg(view.incrementKg)} kg`} />
          </FormRow>
        </FormSection>

        {hasNotes(view) ? (
          <FormSection caption="NOTES">
            <Note label="Exécution" text={view.noteExecution} first />
            <Note label="Réglage" text={view.noteSetup} />
            <Note label="Respiration" text={view.noteBreathing} />
            <Note label="Erreurs fréquentes" text={view.noteMistakes} />
          </FormSection>
        ) : null}

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
      </ScrollView>
    </>
  );
}

/** A read-only value in a form row: right-aligned, quiet, drawing nothing. */
function Value({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={[styles.value, { color: theme.colors.textMuted }]}>{text}</Text>;
}

function hasNotes(view: {
  noteExecution: string | null;
  noteSetup: string | null;
  noteBreathing: string | null;
  noteMistakes: string | null;
}): boolean {
  return (
    view.noteExecution !== null ||
    view.noteSetup !== null ||
    view.noteBreathing !== null ||
    view.noteMistakes !== null
  );
}

/**
 * A note renders nothing at all when it is absent — never an empty row.
 *
 * Four labelled rows with three of them blank is a form, not a page. The
 * section itself disappears when all four are empty, which is why hasNotes
 * exists rather than each row deciding alone.
 */
function Note({ label, text, first }: { label: string; text: string | null; first?: boolean }) {
  const theme = useTheme();
  if (text === null) return null;

  return (
    <View style={[styles.note, first === true ? null : { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.noteLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.noteText, { color: theme.colors.text }]}>{text}</Text>
    </View>
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

/** 2,5 rather than 2.5, and 2 rather than 2,0. */
function formatKg(value: number): string {
  return String(value).replace('.', ',');
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 56 },
  value: { fontSize: 16, textAlign: 'right' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  note: { paddingVertical: 11, paddingHorizontal: 14, gap: 3 },
  noteLabel: { fontSize: 13 },
  noteText: { fontSize: 15, lineHeight: 21 },
  delete: { paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteLabel: { fontSize: 16, fontWeight: '500' },
});
