import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/core/ui/text';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { LoadingDots } from '@/core/ui/loading-dots';
import { SwipeBack } from '@/core/ui/swipe-back';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import type { ExerciseId, RoutineId } from '@/core/db/schema';
import { SearchField } from '@/features/nutrition/components/search-field';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { ExerciseRow } from '../components/exercise-row';
import { SetRow } from '../components/set-row';
import { useExercises } from '../data/exercise-queries';
import { useCreateRoutine, useRoutineDraft, useUpdateRoutine } from '../data/routine-queries';
import {
  addExerciseBlock,
  addExerciseToBlock,
  duplicateLine,
  emptyRoutineDraft,
  isSuperset,
  removeLine,
  setBlockRest,
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
import { blockTitle, restText, routineProblemText } from '../domain/routine-text';

/**
 * Building and editing a routine (specs 10.2).
 *
 * ## CHOOSING AN EXERCISE IS A STEP, NOT A SECOND WINDOW
 *
 * Slice 3 settled this on the add-to-journal path: the quantity screen is a
 * STATE of the window already on screen, because swapping the contents of an
 * open window costs one render where presenting a second costs an animation and
 * a second dismissal on the way back. The same reasoning applies here, and more
 * strongly — building a routine means adding several exercises in a row, so the
 * cost is paid once per exercise.
 *
 * It also settles a question a second window would have raised: how the chosen
 * exercise gets back. As a step, it does not have to travel at all.
 *
 * SwipeBack carries the return, with the `key` slice 3 paid two rounds to
 * learn: a component that animates an exit needs an IDENTITY PER STEP, or React
 * updates the instance instead of mounting a new one and the arriving step is
 * born pushed off screen.
 */

type Step = { kind: 'editing' } | { kind: 'picking'; intoBlock: number | null };

export function RoutineEditorScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id === undefined ? null : toEntityId<RoutineId>(params.id);

  const stored = useRoutineDraft(id);

  usePanelHeading(id === null ? 'Nouvelle routine' : 'Modifier la routine', null);

  // A new routine has nothing to wait for: it states its starting draft rather
  // than waiting forever on a query that will never answer with a row. NULL
  // means "not yet", never "none" — the trap slice 4 named.
  const initial: RoutineDraft | null = id === null ? emptyRoutineDraft() : (stored.data ?? null);

  if (initial === null) {
    return (
      <View style={styles.waiting}>
        <LoadingDots />
      </View>
    );
  }

  return <EditorBody initial={initial} routineId={id} />;
}

function EditorBody({
  initial,
  routineId,
}: {
  initial: RoutineDraft;
  routineId: RoutineId | null;
}) {
  const theme = useTheme();
  const dismiss = useDismiss();
  const create = useCreateRoutine();
  const update = useUpdateRoutine();

  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [step, setStep] = useState<Step>({ kind: 'editing' });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const problems = validateRoutineDraft(draft);

  function save(): void {
    setSubmitted(true);
    if (problems.length > 0) return;

    if (routineId === null) create.mutate(draft, { onSuccess: () => dismiss() });
    else update.mutate({ id: routineId, draft }, { onSuccess: () => dismiss() });
  }

  function chose(exerciseId: ExerciseId, name: string): void {
    setDraft((current) =>
      step.kind === 'picking' && step.intoBlock !== null
        ? addExerciseToBlock(current, step.intoBlock, exerciseId, name)
        : addExerciseBlock(current, exerciseId, name),
    );
    setStep({ kind: 'editing' });
  }

  const form = (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <FormSection caption="ROUTINE">
        <FormRow label="Nom">
          <FormInput
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            placeholder="Haut du corps A"
            autoCapitalize="sentences"
          />
        </FormRow>
      </FormSection>

      <WarmupEditor
        steps={draft.warmupSteps}
        onChange={(warmupSteps) => setDraft((current) => ({ ...current, warmupSteps }))}
      />

      {draft.blocks.map((block, blockIndex) => {
        const title = blockTitle(block.lines.map((line) => line.exerciseName));
        const superset = isSuperset(block);

        return (
          <View key={`block-${blockIndex}`} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: superset ? theme.colors.accent : theme.colors.text }]}>
              {title ?? block.lines[0]?.exerciseName ?? 'Bloc'}
            </Text>

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
              {block.lines.map((line, lineIndex) => (
                <View key={line.id ?? `line-${lineIndex}`}>
                  {lineIndex === 0 ? null : <ListSeparator />}
                  {/*
                    The swipe lives in the row and the press is handed over, not
                    wrapped: React Native's responder system and gesture-handler
                    do not arbitrate, so a Pressable under an active pan fires on
                    release. A Tap and a Pan in one detector race instead.
                  */}
                  <SetRow
                    block={block}
                    line={line}
                    lineIndex={lineIndex}
                    editable
                    onPress={() => setDraft((c) => duplicateLine(c, blockIndex, lineIndex))}
                    onDelete={() => setDraft((c) => removeLine(c, blockIndex, lineIndex))}
                  />
                </View>
              ))}

              <ListSeparator />
              <Pressable
                onPress={() => setStep({ kind: 'picking', intoBlock: blockIndex })}
                accessibilityRole="button"
                style={styles.blockAction}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
                  {superset ? 'Ajouter un exercice au superset' : 'En faire un superset'}
                </Text>
              </Pressable>
            </View>

            {/*
              The block's rest is offered ONLY on a superset, because that is
              the only shape where it is read. Showing the field on an ordinary
              block would invite a value nothing uses — two numbers and no rule
              saying which wins, which is what restForLine exists to prevent.
            */}
            {superset ? (
              <FormSection>
                <FormRow label="Repos entre les tours">
                  <FormInput
                    value={block.restSeconds === null ? '' : String(block.restSeconds)}
                    onChangeText={(value) => {
                      const seconds = value.trim() === '' ? null : Number(value.replace(',', '.'));
                      setDraft((c) =>
                        setBlockRest(
                          c,
                          blockIndex,
                          seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, seconds),
                        ),
                      );
                    }}
                    keyboardType="number-pad"
                    placeholder="90"
                  />
                </FormRow>
              </FormSection>
            ) : null}

            {superset && block.restSeconds !== null ? (
              <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
                {`Chaque tour est suivi de ${restText(block.restSeconds)}.`}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/*
        The add button sits at the FOOT of the list, which specs 10.2 asks for
        in as many words ("boutons d'ajout d'exercice et de bloc en pied
        d'écran"). Adding a block and adding an exercise are one button here:
        an exercise arrives as its own block, and becomes a superset by being
        joined — there is no separate empty block to create.
      */}
      <Pressable
        onPress={() => setStep({ kind: 'picking', intoBlock: null })}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.add,
          {
            borderColor: theme.colors.accent,
            borderRadius: theme.radius.lg,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text style={{ color: theme.colors.accent, fontSize: 16, fontWeight: '500' }}>
          Ajouter un exercice
        </Text>
      </Pressable>

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

  if (step.kind === 'editing') return form;

  return (
    /*
      key={step.kind} — the lesson slice 3 paid two rounds for. SwipeBack takes
      the leaving layer to the edge of the screen and THEN tells its caller, so
      at the moment the contents swap the translation is still a screen wide.
      Without a key, React updates the instance, the shared value survives, and
      the arriving step is born pushed off screen.
    */
    <SwipeBack key={step.kind} onBack={() => setStep({ kind: 'editing' })} behind={form}>
      <ExercisePicker
        intoSuperset={step.intoBlock !== null}
        onChoose={chose}
        onCancel={() => setStep({ kind: 'editing' })}
      />
    </SwipeBack>
  );
}

/**
 * The filtered search, as a step (specs 10.2, "L'ajout d'un exercice ouvre la
 * recherche filtrée").
 *
 * The same SearchField, the same filter strips and the same ExerciseRow as the
 * library — one search, rendered in two places, rather than two searches that
 * would rank the same term differently.
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
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.pickerHead}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          {intoSuperset ? 'Ajouter au superset' : 'Ajouter un exercice'}
        </Text>
        {/*
          The way back is DECLARED, because a step is not a pushed route and the
          navigator gives it none. Without it, choosing the wrong thing costs
          closing the window and starting over — three taps to undo one.
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

/**
 * The warm-up, one step per line typed (specs 10.2).
 *
 * A trailing empty field is always present, so adding a step costs typing
 * rather than a tap on "add" first. Blank lines are dropped on save, which is
 * what makes that safe: the field that is always there never becomes a step.
 */
function WarmupEditor({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
}) {
  const shown = [...steps, ''];

  return (
    <FormSection caption="ÉCHAUFFEMENT">
      {shown.map((step, index) => (
        <FormRow key={`warmup-${index}`}>
          <FormInput
            value={step}
            onChangeText={(text) => {
              const next = [...steps];
              if (index < next.length) next[index] = text;
              else next.push(text);
              onChange(next.filter((line, i) => line.trim() !== '' || i < next.length - 1));
            }}
            placeholder={index === 0 ? '5 min de rameur' : 'Étape suivante'}
            autoCapitalize="sentences"
          />
        </FormRow>
      ))}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  waiting: { paddingVertical: 48, alignItems: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  blockAction: { paddingVertical: 11, paddingHorizontal: 14 },
  hint: { fontSize: 13 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  problems: { gap: 4 },
  problem: { fontSize: 14 },
  save: { paddingVertical: 14, alignItems: 'center' },
});
