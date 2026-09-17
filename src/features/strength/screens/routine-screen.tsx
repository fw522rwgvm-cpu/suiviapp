import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeBack } from '@/core/ui/swipe-back';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import type { ExerciseId, RoutineId } from '@/core/db/schema';
import { SearchField } from '@/features/nutrition/components/search-field';
import { BodyMapView } from '../components/body-map-view';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { ExerciseRow } from '../components/exercise-row';
import { RoutineBody } from '../components/routine-body';
import { useExercises } from '../data/exercise-queries';
import type { RoutineView } from '../data/routine-reads';
import {
  useDeleteRoutine,
  useRoutine,
  useRoutineDraft,
  useUpdateRoutine,
} from '../data/routine-queries';
import {
  addExerciseBlock,
  addExerciseToBlock,
  musclesOfDraft,
  validateRoutineDraft,
  type RoutineDraft,
} from '../domain/routine-draft';
import {
  availableEquipment,
  availableMuscles,
  NO_FILTER,
  searchExercises,
  type ExerciseFilter,
} from '../domain/exercise-search';
import { routineProblemText } from '../domain/routine-text';
import { tallyMuscles } from '../domain/muscle-volume';

/**
 * The page of one routine (specs 10.2), which is also where it is edited.
 *
 * ## EDITING HAPPENS HERE, NOT IN A WINDOW
 *
 * The first version pushed a panel over this page. It obeyed slice 3's rule on
 * paper — acting on something opens a window over it — but the rule exists so
 * that the thing being acted on STAYS VISIBLE, and here the window covered
 * exactly the routine it was changing. Nothing was gained and a dismissal was
 * spent.
 *
 * Specs 10.2 asks for "présentation identique à la création", and the honest
 * reading is one page in two states rather than two pages that resemble each
 * other. RoutineBody draws both, with `editable` flipped, so there is no second
 * layout to drift.
 *
 * CREATION IS STILL A WINDOW, and that is not an inconsistency: there is no
 * page to flip when nothing exists yet.
 *
 * ## CHOOSING AN EXERCISE IS STILL A STEP
 *
 * Slice 3's other rule, unchanged: swapping the contents of a screen costs a
 * render where pushing a route costs an animation and a dismissal. SwipeBack
 * carries the return, with the `key` that slice paid two rounds to learn.
 */

type Mode =
  | { kind: 'reading' }
  | { kind: 'editing'; draft: RoutineDraft }
  | { kind: 'picking'; draft: RoutineDraft; intoBlock: number | null };

export function RoutineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = toEntityId<RoutineId>(params.id ?? '');

  const routine = useRoutine(id);
  const stored = useRoutineDraft(id);
  const catalogue = useExercises();
  const update = useUpdateRoutine();
  const remove = useDeleteRoutine();

  const [mode, setMode] = useState<Mode>({ kind: 'reading' });
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const byId = useMemo(
    () => new Map((catalogue.data ?? []).map((item) => [item.id, item])),
    [catalogue.data],
  );

  /**
   * Fall back to reading if the routine disappears under us — deleted from
   * elsewhere, or an import swapping the database. Editing one that no longer
   * exists would save rows nothing points at.
   */
  useEffect(() => {
    if (routine.data === null && mode.kind !== 'reading') setMode({ kind: 'reading' });
  }, [routine.data, mode.kind]);

  if (id === null) return <Missing />;

  // undefined is "not answered yet"; null is "no such routine".
  if (routine.data === undefined) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }
  if (routine.data === null) return <Missing />;

  const view = routine.data;
  const editing = mode.kind !== 'reading';
  const draft = mode.kind === 'reading' ? null : mode.draft;

  /**
   * What the body map shows: the stored routine while reading, the DRAFT while
   * editing.
   *
   * So adding an exercise lights its muscles before anything is saved — which
   * is the whole reason to watch the map while building. It answers "what does
   * this routine miss", and an answer lagging behind the edit answers about a
   * routine that is no longer on screen.
   */
  const muscles =
    draft === null
      ? view.muscles
      : [
          ...musclesOfDraft(draft, (exerciseId) => {
            const item = byId.get(exerciseId);
            return item === undefined ? [] : [item.primaryMuscle, ...item.secondaryMuscles];
          }),
        ];

  const volume =
    draft === null
      ? view.volume
      : tallyMuscles(
          draft.blocks.flatMap((block) =>
            block.lines.map((line) => {
              const item = byId.get(line.exerciseId);
              return {
                primaryMuscle: item?.primaryMuscle ?? '',
                secondaryMuscles: item?.secondaryMuscles ?? [],
              };
            }),
          ),
        );

  function startEditing(): void {
    if (stored.data == null) return;
    setSubmitted(false);
    setMode({ kind: 'editing', draft: stored.data });
  }

  function save(): void {
    if (draft === null || id === null) return;
    setSubmitted(true);
    if (validateRoutineDraft(draft).length > 0) return;

    update.mutate({ id, draft }, { onSuccess: () => setMode({ kind: 'reading' }) });
  }

  function confirmDelete(): void {
    if (id === null) return;
    /**
     * A plain confirmation, without the warning specs 5.3 reserves for an
     * exercise: deleting a routine destroys nothing that cannot be rebuilt. The
     * exercises it pointed at are untouched, and no history hangs off it.
     */
    Alert.alert(`Supprimer « ${view.name} » ?`, 'Les exercices ne sont pas supprimés.', [
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
    ]);
  }

  const problems = draft === null ? [] : validateRoutineDraft(draft);

  const page = (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
          theme.shadow,
        ]}
      >
        <BodyMapView muscles={muscles} volume={volume} />
      </View>

      <RoutineBody
        draft={draft ?? toDraft(view)}
        editable={editing}
        catalogue={byId}
        onChange={(next) =>
          setMode((current) =>
            current.kind === 'reading' ? current : { ...current, draft: next },
          )
        }
        onPickInto={(intoBlock) =>
          setMode((current) =>
            current.kind === 'reading'
              ? current
              : { kind: 'picking', draft: current.draft, intoBlock },
          )
        }
        onOpenExercise={
          editing
            ? undefined
            : (exerciseId) => router.push(`/(tabs)/training/exercise/${exerciseId}`)
        }
      />

      {/*
        Problems appear only once a save has been ATTEMPTED. A form that goes
        red as you type your first letter scolds; one that waits until you say
        you are finished helps.
      */}
      {submitted && problems.length > 0 ? (
        <View style={styles.problems}>
          {problems.map((problem, index) => (
            <Text
              key={`${problem.kind}-${index}`}
              style={[styles.problem, { color: theme.colors.danger }]}
            >
              {routineProblemText(problem)}
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
            Supprimer la routine
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: editing ? 'Modifier' : view.name,
          headerRight: () => (
            // A bare Pressable, never a GlassButton: on iOS 26 the bar already
            // lays its own material behind what it is given.
            <Pressable
              onPress={editing ? () => setMode({ kind: 'reading' }) : startEditing}
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

      {mode.kind === 'picking' ? (
        /*
          key on the step: SwipeBack takes the leaving layer to the edge and
          THEN tells its caller, so without a fresh identity the shared value
          survives and the arriving step is born pushed off screen.
        */
        <SwipeBack
          key="picking"
          onBack={() => setMode({ kind: 'editing', draft: mode.draft })}
          behind={page}
        >
          <ExercisePicker
            intoSuperset={mode.intoBlock !== null}
            onChoose={(exerciseId, name) => {
              const next =
                mode.intoBlock === null
                  ? addExerciseBlock(mode.draft, exerciseId, name)
                  : addExerciseToBlock(mode.draft, mode.intoBlock, exerciseId, name);
              setMode({ kind: 'editing', draft: next });
            }}
            onCancel={() => setMode({ kind: 'editing', draft: mode.draft })}
          />
        </SwipeBack>
      ) : (
        page
      )}
    </>
  );
}

/**
 * The stored routine in the draft shape, for the read-only rendering.
 *
 * No assertion anywhere: routine-reads.ts narrows exerciseId and setType where
 * they enter the application, so this is a plain reshape — and the page and the
 * editor hand RoutineBody exactly the same thing, which is what keeps the two
 * from drifting.
 */
function toDraft(view: RoutineView): RoutineDraft {
  return {
    name: view.name,
    warmupSteps: view.warmupSteps,
    blocks: view.blocks.map((block) => ({
      id: block.id,
      restSeconds: block.restSeconds,
      lines: block.lines.map((line) => ({
        id: line.id,
        exerciseId: line.exerciseId,
        exerciseName: line.exerciseName,
        setType: line.setType,
        repsMin: line.repsMin,
        repsMax: line.repsMax,
        targetLoadKg: line.targetLoadKg,
        targetRir: line.targetRir,
        durationSeconds: line.durationSeconds,
        restSeconds: line.restSeconds,
        progressionEnabled: line.progressionEnabled === 1,
        // A text field cannot hold absence; the row renders nothing for ''.
        note: line.note ?? '',
      })),
    })),
  };
}

/**
 * The filtered search, as a step (specs 10.2, "L'ajout d'un exercice ouvre la
 * recherche filtrée").
 *
 * The same field, strips and row as the library — one search rendered twice,
 * rather than two searches that would rank the same term differently.
 */
function ExercisePicker({
  intoSuperset,
  onChoose,
  onCancel,
}: {
  intoSuperset: boolean;
  onChoose: (id: ExerciseId, name: string) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);

  const exercises = useExercises();
  const held = useMemo(() => exercises.data ?? [], [exercises.data]);
  const shown = useMemo(() => searchExercises(held, term, filter), [held, term, filter]);
  const available = useMemo(
    () => ({ muscles: availableMuscles(held), equipment: availableEquipment(held) }),
    [held],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.pickerHead}>
        <Text style={[styles.pickerTitle, { color: theme.colors.text }]}>
          {intoSuperset ? 'Ajouter au superset' : 'Ajouter un exercice'}
        </Text>
        {/*
          The way back is DECLARED: a step is not a pushed route and the
          navigator gives it none. Without it, choosing the wrong thing costs
          leaving the page and coming back.
        */}
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={12}>
          <Text style={{ color: theme.colors.accent, fontSize: 15 }}>Retour</Text>
        </Pressable>
      </View>

      <SearchField value={term} onChange={setTerm} />
      <ExerciseFilterStrips available={available} filter={filter} onChange={setFilter} />

      {shown.length === 0 ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 15 }}>
          {held.length === 0
            ? 'Aucun exercice. Créez-en un depuis l’onglet Entraînement.'
            : 'Aucun exercice ne correspond.'}
        </Text>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {shown.map((exercise, index) => (
            <View key={exercise.id}>
              {index === 0 ? null : <ListSeparator />}
              <ExerciseRow
                exercise={exercise}
                onPress={() => onChoose(exercise.id, exercise.name)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Missing() {
  const theme = useTheme();
  return (
    <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.textMuted }}>Cette routine n’existe plus.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 56 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 17, fontWeight: '600' },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  primary: { paddingVertical: 14, alignItems: 'center' },
  delete: { paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteLabel: { fontSize: 16, fontWeight: '500' },
});
