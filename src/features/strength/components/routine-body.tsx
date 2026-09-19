import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { ExerciseDrawing } from './exercise-drawing';
import { SetTable } from './set-table';
import type { ExerciseListItem } from '../data/exercise-reads';
import {
  addRound,
  blockProgression,
  exercisesOfBlock,
  isSuperset,
  removeLine,
  restForBlock,
  setBlockProgression,
  setBlockRest,
  updateLine,
  type BlockDraft,
  type RoutineDraft,
} from '../domain/routine-draft';
import { restText } from '../domain/routine-text';

/**
 * A routine's blocks, read or edited, with ONE component for both.
 *
 * > Présentation identique à la création, non éditable.
 *
 * Specs 10.2 taken as far as it goes: the page and the editor are the same
 * layout with `editable` flipped, so there is no second rendering of a block to
 * drift from the first. It carries the warm-up and the name too, for the same
 * reason — every part of a routine that is shown is shown once.
 *
 * ## THE BLOCK IS A CARD THAT OPENS WITH ITS EXERCISES
 *
 * Asked for in as many words: closer to Hevy. What that means concretely, and
 * what was taken rather than copied:
 *
 * - The exercise NAME is the heading, in the accent colour, and touching it
 *   opens the exercise (specs 10.2, "Toucher un exercice ouvre sa page"). In a
 *   superset each name is its own target, prefixed by the letter its rows
 *   carry — one heading over two exercises could only ever open one of them.
 * - The rest sits directly under the names, one muted line with a timer glyph,
 *   because it is the question you have BETWEEN two sets and it governs all of
 *   them rather than following the last.
 * - The table has no inner frame. A grid drawn inside a card is two boxes, and
 *   the columns line up without one.
 * - A superset carries an accent rail down its left edge, which is how it is
 *   recognised before a word is read.
 *
 * What was NOT taken, and why: the exercise thumbnail — media is out of this
 * slice, and a placeholder circle is a promise the application does not keep —
 * and the "previous" column, which is slice 12's history; an empty column would
 * say there is nothing rather than that nothing is recorded yet.
 */
export function RoutineBody({
  draft,
  editable,
  catalogue,
  onChange,
  onPickInto,
  onOpenExercise,
}: {
  draft: RoutineDraft;
  editable: boolean;
  /** For the Temps column: which exercises are timed. */
  catalogue: ReadonlyMap<string, ExerciseListItem>;
  onChange?: (next: RoutineDraft) => void;
  /** Null adds a block, an index turns that block into a superset. */
  onPickInto?: (blockIndex: number | null) => void;
  onOpenExercise?: (exerciseId: string) => void;
}) {
  const theme = useTheme();

  return (
    <>
      {editable ? (
        <FormSection caption="ROUTINE">
          <FormRow label="Nom">
            <FormInput
              value={draft.name}
              onChangeText={(name) => onChange?.({ ...draft, name })}
              placeholder="Haut du corps A"
              autoCapitalize="sentences"
            />
          </FormRow>
        </FormSection>
      ) : null}

      <WarmupSection
        steps={draft.warmupSteps}
        editable={editable}
        onChange={(warmupSteps) => onChange?.({ ...draft, warmupSteps })}
      />

      {draft.blocks.map((block, blockIndex) => {
        const superset = isSuperset(block);
        const first = block.lines[0];
        const timed =
          first === undefined ? false : catalogue.get(first.exerciseId)?.tracksDuration === 1;

        return (
          <View
            key={block.id ?? `block-${blockIndex}`}
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
            {/* The rail, which says "superset" before a single word is read. */}
            {superset ? (
              <View style={[styles.rail, { backgroundColor: theme.colors.accent }]} />
            ) : null}

            <View style={styles.body}>
              <BlockHeading
                block={block}
                catalogue={catalogue}
                superset={superset}
                onOpenExercise={onOpenExercise}
              />

              <BlockRest
                block={block}
                superset={superset}
                editable={editable}
                onChange={(seconds) => onChange?.(setBlockRest(draft, blockIndex, seconds))}
              />

              <BlockProgression
                block={block}
                editable={editable}
                onChange={(enabled) => onChange?.(setBlockProgression(draft, blockIndex, enabled))}
              />

              <View style={styles.table}>
                <SetTable
                  block={block}
                  tracksDuration={timed}
                  editable={editable}
                  onChangeLine={(lineIndex, change) =>
                    onChange?.(updateLine(draft, blockIndex, lineIndex, change))
                  }
                  onDeleteLine={(lineIndex) => onChange?.(removeLine(draft, blockIndex, lineIndex))}
                />
              </View>

              {editable ? null : (
                <BlockNotes block={block} catalogue={catalogue} named={superset} />
              )}

              {editable ? (
                <View style={styles.actions}>
                  <BlockAction
                    label={superset ? 'Ajouter un tour' : 'Ajouter une série'}
                    onPress={() => onChange?.(addRound(draft, blockIndex))}
                  />
                  <BlockAction
                    label={superset ? 'Ajouter au superset' : 'En faire un superset'}
                    onPress={() => onPickInto?.(blockIndex)}
                  />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      {editable ? (
        /*
          At the FOOT of the list, which specs 10.2 asks for in as many words.
          Adding a block and adding an exercise are one button: an exercise
          arrives as its own block and becomes a superset by being joined, so
          there is no empty block to create.
        */
        <Pressable
          onPress={() => onPickInto?.(null)}
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
      ) : null}
    </>
  );
}

/**
 * The notes of a block's exercises, on the routine's page (specs 14.28).
 *
 * ## WHY THEY BELONG HERE AND NOT ONLY ON THE EXERCISE
 *
 * They are what specs 6.3 calls "exécution, réglage, respiration, erreurs
 * fréquentes" — four things written down precisely so they can be read WHILE
 * training, and the routine's page is the one open at that moment. Leaving them
 * one tap away on the exercise's page made them a reference rather than a
 * reminder.
 *
 * ## READ-ONLY, AND THE ROUTINE NEVER EDITS THEM
 *
 * A note belongs to the exercise, not to this routine: changing one here would
 * change it for every routine that uses it, from a screen that says nothing of
 * the sort. Touching the exercise's name — a row above — is the way to them.
 *
 * Nothing is drawn when there are none. An empty "NOTES" heading under every
 * block would be four words of furniture on the busiest page of the tab.
 *
 * The text comes from the catalogue the page already holds, so this costs no
 * query at all — which is the whole reason the notes ride on the list item.
 */
function BlockNotes({
  block,
  catalogue,
  named,
}: {
  block: BlockDraft;
  catalogue: ReadonlyMap<string, ExerciseListItem>;
  /** In a superset, say whose note this is; alone, the block already said. */
  named: boolean;
}) {
  const theme = useTheme();

  const written = exercisesOfBlock(block)
    .map((item) => ({ item, notes: notesOf(catalogue.get(item.exerciseId)) }))
    .filter((entry) => entry.notes.length > 0);

  if (written.length === 0) return null;

  return (
    <View style={styles.notes}>
      {written.map(({ item, notes }) => (
        <View key={item.exerciseId} style={styles.noteGroup}>
          {named ? (
            <Text style={[styles.noteOwner, { color: theme.colors.textMuted }]}>
              {item.exerciseName}
            </Text>
          ) : null}
          {notes.map((note) => (
            <View key={note.label} style={styles.note}>
              <Text style={[styles.noteLabel, { color: theme.colors.textMuted }]}>
                {note.label}
              </Text>
              <Text style={[styles.noteText, { color: theme.colors.text }]}>{note.text}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The four of specs 6.3, in the order they are written, minus the empty ones. */
function notesOf(
  exercise: ExerciseListItem | undefined,
): { label: string; text: string }[] {
  if (exercise === undefined) return [];

  return [
    { label: 'Exécution', text: exercise.noteExecution },
    { label: 'Réglage', text: exercise.noteSetup },
    { label: 'Respiration', text: exercise.noteBreathing },
    { label: 'Erreurs fréquentes', text: exercise.noteMistakes },
  ].flatMap((note) => (note.text === null || note.text === '' ? [] : [{ label: note.label, text: note.text }]));
}

/**
 * The exercises a block holds, each one its own way to its own page.
 *
 * ## ONE NAME, ONE TARGET — INCLUDING WHILE EDITING
 *
 * The first version put a single heading on the block, so a superset offered
 * one press for two exercises and it opened whichever came first. And it was
 * withheld entirely while editing, on the theory that navigating away would
 * lose the draft. It would not: a push leaves this screen MOUNTED underneath,
 * which is why a navigator has focus events at all — so the state survives the
 * visit, and the names stay live in both modes.
 *
 * ## THE THUMBNAIL, LEFT OF THE NAME
 *
 * Requested (specs 14.37), and it costs nothing here for the reason the notes
 * already gave: `media_uri` rides on the catalogue item this page ALREADY
 * HOLDS, so a picture per block is the same query it was before. Reading one
 * exercise per block would be the per-row cost slice 4 refused.
 *
 * ONE POSE, like every list row. The pair says how a movement runs and belongs
 * on the exercise page; at this size it would say it twice in half the width.
 *
 * A BLOCK DRAFT CARRIES A NAME BUT NOT A MEDIUM, and that is why the catalogue
 * is consulted rather than the draft extended: a routine line freezes nothing
 * and reads its exercise live (slice 10), so a copied `media_uri` would be a
 * second answer to a question the exercise already answers.
 */
function BlockHeading({
  block,
  catalogue,
  superset,
  onOpenExercise,
}: {
  block: BlockDraft;
  catalogue: ReadonlyMap<string, ExerciseListItem>;
  superset: boolean;
  onOpenExercise?: (exerciseId: string) => void;
}) {
  const theme = useTheme();
  const exercises = exercisesOfBlock(block);

  return (
    <View style={styles.heading}>
      {superset ? (
        <Text style={[styles.supersetLabel, { color: theme.colors.accent }]}>SUPERSET</Text>
      ) : null}

      {exercises.map((item, index) => {
        const inner = (
          <>
            <View style={styles.thumb}>
              <ExerciseDrawing
                mediaUri={catalogue.get(item.exerciseId)?.mediaUri ?? null}
                height={34}
              />
            </View>
            <Text style={[styles.name, { color: theme.colors.accent }]} numberOfLines={2}>
              {superset ? `${LETTERS[index] ?? '?'}  ${item.exerciseName}` : item.exerciseName}
            </Text>
          </>
        );

        if (onOpenExercise === undefined) {
          return (
            <View key={item.exerciseId} style={styles.nameRow}>
              {inner}
            </View>
          );
        }

        return (
          <Pressable
            key={item.exerciseId}
            onPress={() => onOpenExercise(item.exerciseId)}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${item.exerciseName}`}
            hitSlop={6}
            style={({ pressed }) => [styles.nameRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            {inner}
            <SymbolView name="chevron.right" size={12} tintColor={theme.colors.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** The same letters the rows carry, so a name and its sets are one thing. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * The rest, stated at the top of its block.
 *
 * Under the sets it read as a footnote to the last one. At the top it reads as
 * what governs all of them — and it is the question you have BETWEEN two sets,
 * not after the block.
 */
function BlockRest({
  block,
  superset,
  editable,
  onChange,
}: {
  block: BlockDraft;
  superset: boolean;
  editable: boolean;
  onChange: (seconds: number | null) => void;
}) {
  const theme = useTheme();
  const rest = restForBlock(block);
  const label = superset ? 'Repos entre les tours' : 'Repos entre les séries';

  if (!editable) {
    if (rest === null) return null;
    return (
      <View style={styles.line}>
        <SymbolView name="timer" size={13} tintColor={theme.colors.textMuted} />
        <Text style={[styles.lineText, { color: theme.colors.textMuted }]}>
          {`${label} : ${restText(rest)}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.line}>
      <SymbolView name="timer" size={13} tintColor={theme.colors.textMuted} />
      <Text style={[styles.lineText, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.restInput, { color: theme.colors.text }]}
        value={block.restSeconds === null ? '' : String(block.restSeconds)}
        onChangeText={(value) => {
          const seconds = value.trim() === '' ? null : Number(value.replace(',', '.'));
          onChange(
            seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.round(seconds)),
          );
        }}
        keyboardType="number-pad"
        placeholder="90 s"
        placeholderTextColor={theme.colors.textFaint}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * The progression rule, at the level of the block.
 *
 * ## IT WAS AN ARROW ON A ROW, AND THE ARROW HAD TO GO
 *
 * Asked for: remove the ↗ sitting at the end of some rows. It carried specs
 * 10.4's per-line switch, so deleting it alone would have left the rule with no
 * way in at all — a column in the schema that nothing could ever set.
 *
 * The block is where it belongs anyway, for the reason the rest is there:
 * nobody progresses the second set of an exercise and not the third. The COLUMN
 * stays per line, which section 10.4 requires and slice 12 will read; this
 * control writes it across every working set of the block.
 */
function BlockProgression({
  block,
  editable,
  onChange,
}: {
  block: BlockDraft;
  editable: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const theme = useTheme();
  const enabled = blockProgression(block);

  if (!editable) {
    if (!enabled) return null;
    return (
      <View style={styles.line}>
        <SymbolView name="chart.line.uptrend.xyaxis" size={13} tintColor={theme.colors.textMuted} />
        <Text style={[styles.lineText, { color: theme.colors.textMuted }]}>
          Progression automatique
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.line}>
      <SymbolView name="chart.line.uptrend.xyaxis" size={13} tintColor={theme.colors.textMuted} />
      <Text style={[styles.lineText, { color: theme.colors.textMuted }]}>
        Progression automatique
      </Text>
      <Switch
        value={enabled}
        onValueChange={onChange}
        accessibilityLabel="Progression automatique"
      />
    </View>
  );
}

function BlockAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: theme.colors.background,
          borderRadius: theme.radius.sm,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The warm-up, one step per line typed (specs 10.2).
 *
 * A trailing empty field is always present while editing, so adding a step
 * costs typing rather than a tap on "add" first. Blank lines are dropped on
 * save, which is what makes that safe. Read-only, it renders nothing at all
 * when there is no warm-up rather than an empty heading.
 */
function WarmupSection({
  steps,
  editable,
  onChange,
}: {
  steps: string[];
  editable: boolean;
  onChange: (steps: string[]) => void;
}) {
  const theme = useTheme();

  if (!editable) {
    if (steps.length === 0) return null;
    return (
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
        <View style={styles.body}>
          <Text style={[styles.warmupHeading, { color: theme.colors.text }]}>Échauffement</Text>
          <View>
            {steps.map((step, index) => (
              <View key={`${index}-${step}`}>
                {index === 0 ? null : <ListSeparator />}
                <View style={styles.step}>
                  <Text style={[styles.stepText, { color: theme.colors.text }]}>{step}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

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
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  body: { padding: 14, gap: 10 },
  heading: { gap: 2 },
  supersetLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  // A fixed width, so a photograph and the substitute leave the names on one
  // column — the rule every other list in this feature follows.
  thumb: { width: 48 },
  name: { flex: 1, fontSize: 17, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  lineText: { flex: 1, fontSize: 13 },
  restInput: { fontSize: 15, minWidth: 56, textAlign: 'right', paddingVertical: 4 },
  table: { paddingTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '500' },
  notes: { gap: 10, paddingTop: 2 },
  noteGroup: { gap: 6 },
  noteOwner: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  note: { gap: 2 },
  noteLabel: { fontSize: 12 },
  noteText: { fontSize: 14, lineHeight: 20 },
  warmupHeading: { fontSize: 17, fontWeight: '600' },
  step: { paddingVertical: 9 },
  stepText: { fontSize: 15 },
  add: { paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
});
