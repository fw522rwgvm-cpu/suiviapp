import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeBack } from '@/core/ui/swipe-back';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useTheme } from '@/core/theme';
import type { ExerciseId } from '@/core/db/schema';
import { SearchField } from '@/features/nutrition/components/search-field';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { ExerciseRow } from '../components/exercise-row';
import { RoutineBody } from '../components/routine-body';
import { useExercises } from '../data/exercise-queries';
import { useCreateRoutine } from '../data/routine-queries';
import {
  addExerciseBlock,
  addExerciseToBlock,
  emptyRoutineDraft,
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

/**
 * CREATING a routine (specs 10.2). Editing one happens on its own page.
 *
 * ## WHY CREATION IS STILL A WINDOW AND EDITING IS NOT
 *
 * Slice 3's rule is that acting on something opens a window OVER it, so the
 * thing acted on stays visible. Editing a routine broke that on its own terms:
 * the window covered exactly the routine it was changing, so nothing stayed
 * visible and a dismissal was spent for nothing. That moved onto the page.
 *
 * Creation has no such page — there is nothing to flip into edit mode when
 * nothing exists yet — so the window is what it has always been, opening over
 * the list the new routine will join.
 *
 * The body is RoutineBody, the same component the page renders, so the two
 * cannot drift about what a block looks like.
 */
export function RoutineEditorScreen() {
  const theme = useTheme();
  const dismiss = useDismiss();
  const create = useCreateRoutine();
  const catalogue = useExercises();

  const [draft, setDraft] = useState<RoutineDraft>(() => emptyRoutineDraft());
  const [picking, setPicking] = useState<{ intoBlock: number | null } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  usePanelHeading('Nouvelle routine', null);

  const byId = useMemo(
    () => new Map((catalogue.data ?? []).map((item) => [item.id, item])),
    [catalogue.data],
  );

  const problems = validateRoutineDraft(draft);

  function save(): void {
    setSubmitted(true);
    if (problems.length > 0) return;
    create.mutate(draft, { onSuccess: () => dismiss() });
  }

  const form = (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <RoutineBody
        draft={draft}
        editable
        catalogue={byId}
        onChange={setDraft}
        onPickInto={(intoBlock) => setPicking({ intoBlock })}
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
        <Text style={{ color: theme.colors.onAccent, fontSize: 16, fontWeight: '600' }}>
          Enregistrer
        </Text>
      </Pressable>
    </ScrollView>
  );

  if (picking === null) return form;

  return (
    /*
      key on the step, the lesson slice 3 paid two rounds for: SwipeBack takes
      the leaving layer to the edge and THEN tells its caller, so without a
      fresh identity the shared value survives and the arriving step is born
      pushed off screen.
    */
    <SwipeBack key="picking" onBack={() => setPicking(null)} behind={form}>
      <ExercisePicker
        intoSuperset={picking.intoBlock !== null}
        onChoose={(exerciseId, name) => {
          const into = picking.intoBlock;
          setDraft((current) =>
            into === null
              ? addExerciseBlock(current, exerciseId, name)
              : addExerciseToBlock(current, into, exerciseId, name),
          );
          setPicking(null);
        }}
        onCancel={() => setPicking(null)}
      />
    </SwipeBack>
  );
}

/** The filtered search, as a step — the same one the routine page uses. */
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
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.pickerHead}>
        <Text style={[styles.pickerTitle, { color: theme.colors.text }]}>
          {intoSuperset ? 'Ajouter au superset' : 'Ajouter un exercice'}
        </Text>
        {/*
          The way back is DECLARED: a step is not a pushed route and the
          navigator gives it none.
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

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 17, fontWeight: '600' },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  save: { paddingVertical: 14, alignItems: 'center' },
});
