import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { SetTable } from './set-table';
import type { ExerciseListItem } from '../data/exercise-reads';
import {
  addRound,
  isSuperset,
  removeLine,
  restForBlock,
  setBlockRest,
  updateLine,
  type RoutineDraft,
} from '../domain/routine-draft';
import { blockTitle, restText } from '../domain/routine-text';

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
 * ## THE REST IS STATED AT THE TOP OF ITS BLOCK
 *
 * Under the sets it read as a footnote to the last one. At the top it reads as
 * a property of the block, which is what it is since it stopped belonging to
 * the line — and it is what you need BEFORE the sets, not after: how long to
 * wait is the question between them.
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
        const title = blockTitle(block.lines.map((line) => line.exerciseName));
        const superset = isSuperset(block);
        const heading = title ?? block.lines[0]?.exerciseName ?? 'Bloc';
        const rest = restForBlock(block);
        const first = block.lines[0];
        const timed =
          first === undefined
            ? false
            : catalogue.get(first.exerciseId)?.tracksDuration === 1;

        return (
          <View key={block.id ?? `block-${blockIndex}`} style={styles.section}>
            {/*
              Specs 10.2: "Toucher un exercice ouvre sa page". It is the TITLE
              that carries it, not a row: a cell is a number, and a press
              spanning four of them would fight the swipe that removes the set.
            */}
            {onOpenExercise === undefined || first === undefined ? (
              <Text style={[styles.heading, { color: superset ? theme.colors.accent : theme.colors.text }]}>
                {heading}
              </Text>
            ) : (
              <Pressable
                onPress={() => onOpenExercise(first.exerciseId)}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.heading,
                    { color: superset ? theme.colors.accent : theme.colors.text },
                  ]}
                >
                  {heading}
                </Text>
              </Pressable>
            )}

            {/*
              THE REST, ABOVE THE SETS. Below them it read as a footnote to the
              last row; above, it reads as what governs all of them — and it is
              the question you have between two sets, not after the block.
            */}
            {editable ? (
              <View style={styles.restField}>
                <Text style={[styles.restLabel, { color: theme.colors.textMuted }]}>
                  {superset ? 'Repos entre les tours' : 'Repos entre les séries'}
                </Text>
                <FormInput
                  value={block.restSeconds === null ? '' : String(block.restSeconds)}
                  onChangeText={(value) => {
                    const seconds = value.trim() === '' ? null : Number(value.replace(',', '.'));
                    onChange?.(
                      setBlockRest(
                        draft,
                        blockIndex,
                        seconds === null || !Number.isFinite(seconds)
                          ? null
                          : Math.max(0, Math.round(seconds)),
                      ),
                    );
                  }}
                  keyboardType="number-pad"
                  placeholder="90 s"
                />
              </View>
            ) : rest === null ? null : (
              <Text style={[styles.restLine, { color: theme.colors.textMuted }]}>
                {superset
                  ? `Repos entre les tours : ${restText(rest)}`
                  : `Repos entre les séries : ${restText(rest)}`}
              </Text>
            )}

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
              <SetTable
                block={block}
                tracksDuration={timed}
                editable={editable}
                onChangeLine={(lineIndex, change) =>
                  onChange?.(updateLine(draft, blockIndex, lineIndex, change))
                }
                onDeleteLine={(lineIndex) => onChange?.(removeLine(draft, blockIndex, lineIndex))}
              />

              {editable ? (
                <>
                  <ListSeparator />
                  <Pressable
                    onPress={() => onChange?.(addRound(draft, blockIndex))}
                    accessibilityRole="button"
                    style={styles.blockAction}
                  >
                    <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
                      Ajouter une série
                    </Text>
                  </Pressable>

                  <ListSeparator />
                  <Pressable
                    onPress={() => onPickInto?.(blockIndex)}
                    accessibilityRole="button"
                    style={styles.blockAction}
                  >
                    <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
                      {superset ? 'Ajouter un exercice au superset' : 'En faire un superset'}
                    </Text>
                  </Pressable>
                </>
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
      <View style={styles.section}>
        <Text style={[styles.heading, { color: theme.colors.text }]}>Échauffement</Text>
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
  section: { gap: 8 },
  heading: { fontSize: 17, fontWeight: '600' },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  blockAction: { paddingVertical: 11, paddingHorizontal: 14 },
  restLine: { fontSize: 13 },
  restField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  restLabel: { fontSize: 13 },
  step: { paddingVertical: 11, paddingHorizontal: 14 },
  stepText: { fontSize: 15 },
  add: { paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
});
