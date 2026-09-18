import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';
import { EQUIPMENT, MUSCLES } from '@/core/db/schema';
import { BodyMapView } from './body-map-view';
import { ExerciseDrawing } from './exercise-drawing';
import {
  muscleRoles,
  toggleSecondary,
  type ExerciseDraft,
} from '../domain/exercise-draft';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, equipmentLabel, muscleLabel } from '../domain/vocabulary';

/**
 * One exercise, read or edited, with ONE component for both.
 *
 * The shape RoutineBody settled in slice 10, applied to the other page of this
 * tab: a page in two states rather than two pages that resemble each other, so
 * there is no second rendering to drift from the first. `exercise-editor-screen`
 * draws this too, which is what keeps creating and editing the same form.
 *
 * ## THE BODY MAP IS ALWAYS THERE
 *
 * Asked for (specs 14.27), and it settles something that was inconsistent: the
 * figure had arrived on the editing form only, so the fifteen invented muscle
 * names were turned back into anatomy while you chose them and never again. An
 * exercise's page is exactly where "where is that" gets asked, and the map
 * answers it without a tap.
 *
 * It shades by ROLE rather than by volume — an exercise has no sets to count —
 * and it is the same component the routine page uses, so the two cannot drift
 * about where a muscle is.
 */
export function ExerciseBody({
  draft,
  editable,
  mediaUri,
  onChange,
}: {
  draft: ExerciseDraft;
  editable: boolean;
  /**
   * The drawing, which is NOT part of the draft.
   *
   * Deliberately a separate prop: a draft is what the form edits, and nothing
   * on this screen edits the medium — choosing a file needs expo-image-picker,
   * outside section 5 (specs 14.20 no 4), and a catalogue key is written once
   * at install. Putting it on the draft would make it something
   * sameExerciseDraft has to compare and the editor has to preserve, for a
   * value neither of them can change.
   */
  mediaUri?: string | null;
  onChange?: (next: ExerciseDraft) => void;
}) {
  const theme = useTheme();

  function update(change: Partial<ExerciseDraft>): void {
    onChange?.({ ...draft, ...change });
  }

  return (
    <>
      {/*
        THE DRAWING, ABOVE THE BODY MAP, AND THE ORDER IS THE POINT.

        They answer two different questions and the first one asked is "what is
        this movement" — the drawing — before "where does it work", which is the
        map. Somebody who has just installed the catalogue is looking at a name
        they may not know; somebody choosing secondary muscles is looking at the
        figure. Both are on the page, in the order they are needed.

        It ANIMATES here, unlike in the catalogue list: this is one exercise
        being looked at, which is exactly where a movement belongs. A page of
        thirty-three would not sit still to be read.
      */}
      {mediaUri === undefined || mediaUri === null ? null : (
        <View
          style={[
            styles.drawing,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <ExerciseDrawing mediaUri={mediaUri} height={180} />
        </View>
      )}

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

      {editable ? (
        <FormSection caption="IDENTITÉ">
          <FormRow label="Nom">
            <FormInput
              value={draft.name}
              onChangeText={(name) => update({ name })}
              placeholder="Développé couché"
              autoCapitalize="sentences"
            />
          </FormRow>
          <FormRow label="Incrément (kg)">
            <FormInput
              value={draft.incrementKg}
              onChangeText={(incrementKg) => update({ incrementKg })}
              keyboardType="decimal-pad"
              placeholder="2,5"
            />
          </FormRow>
        </FormSection>
      ) : (
        <FormSection caption="EXERCICE">
          <FormRow label="Muscle principal">
            <Value text={muscleLabel(draft.primaryMuscle)} />
          </FormRow>
          {draft.secondaryMuscles.size === 0 ? null : (
            <FormRow label="Muscles secondaires">
              <Value text={[...draft.secondaryMuscles].map(muscleLabel).join(', ')} />
            </FormRow>
          )}
          {draft.equipment === null ? null : (
            <FormRow label="Matériel">
              <Value text={equipmentLabel(draft.equipment) ?? ''} />
            </FormRow>
          )}
          <FormRow label="Incrément">
            <Value text={`${draft.incrementKg} kg`} />
          </FormRow>
          {/*
            Shown only when it is true, unlike the increment, which is always
            there. "Répétitions" on every ordinary exercise is a row that says
            what every reader already assumes; "Temps" is the one that changes
            what the page below it means.
          */}
          {draft.tracksDuration ? (
            <FormRow label="Mesure">
              <Value text="Temps" />
            </FormRow>
          ) : null}
        </FormSection>
      )}

      {editable ? (
        <>
          <ChoiceGroup
            caption="MUSCLE PRINCIPAL"
            options={MUSCLES.map((value) => ({ value, label: MUSCLE_LABELS[value] }))}
            selected={[draft.primaryMuscle]}
            onPress={(value) => {
              const muscle = MUSCLES.find((item) => item === value);
              if (muscle !== undefined) update({ primaryMuscle: muscle });
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
              update({ secondaryMuscles: toggleSecondary(draft.secondaryMuscles, muscle) });
            }}
          />

          <ChoiceGroup
            caption="MATÉRIEL"
            options={EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }))}
            selected={draft.equipment === null ? [] : [draft.equipment]}
            onPress={(value) => {
              const item = EQUIPMENT.find((option) => option === value);
              // Tapping the selected one clears it, as a filter chip does.
              update({ equipment: item === undefined || draft.equipment === item ? null : item });
            }}
          />

          {/*
            THE CONTROL THAT WAS MISSING SINCE `0009`.

            exercise.tracks_duration was read in four places and written in
            none — no exercise could ever be timed, so the "Temps" column of
            SetTable could not appear and routine_line.duration_seconds was
            unreachable. Found in slice 11, writing a session that has to
            perform a plank.

            A ChoiceGroup rather than a switch, because the two values are
            NAMED here: "Temps" and "Répétitions" say what the set table will
            ask for, where a toggle labelled "chronométré" would leave the
            reader to work out what changes. It is also the idiom the three
            groups above already use.
          */}
          <ChoiceGroup
            caption="MESURE"
            options={[
              { value: 'reps', label: 'Répétitions' },
              { value: 'time', label: 'Temps' },
            ]}
            selected={[draft.tracksDuration ? 'time' : 'reps']}
            onPress={(value) => update({ tracksDuration: value === 'time' })}
          />
        </>
      ) : null}

      {editable ? (
        <FormSection caption="NOTES">
          <NoteField
            label="Exécution"
            value={draft.noteExecution}
            onChange={(noteExecution) => update({ noteExecution })}
          />
          <NoteField
            label="Réglage"
            value={draft.noteSetup}
            onChange={(noteSetup) => update({ noteSetup })}
          />
          <NoteField
            label="Respiration"
            value={draft.noteBreathing}
            onChange={(noteBreathing) => update({ noteBreathing })}
          />
          <NoteField
            label="Erreurs fréquentes"
            value={draft.noteMistakes}
            onChange={(noteMistakes) => update({ noteMistakes })}
          />
        </FormSection>
      ) : hasNotes(draft) ? (
        <FormSection caption="NOTES">
          <Note label="Exécution" text={draft.noteExecution} first />
          <Note label="Réglage" text={draft.noteSetup} />
          <Note label="Respiration" text={draft.noteBreathing} />
          <Note label="Erreurs fréquentes" text={draft.noteMistakes} />
        </FormSection>
      ) : null}
    </>
  );
}

/** A read-only value in a form row: right-aligned, quiet, drawing nothing. */
function Value({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={[styles.value, { color: theme.colors.textMuted }]}>{text}</Text>;
}

function hasNotes(draft: ExerciseDraft): boolean {
  return (
    draft.noteExecution !== '' ||
    draft.noteSetup !== '' ||
    draft.noteBreathing !== '' ||
    draft.noteMistakes !== ''
  );
}

/**
 * A note renders nothing at all when it is absent — never an empty row.
 *
 * Four labelled rows with three of them blank is a form, not a page. The
 * section itself disappears when all four are empty, which is why hasNotes
 * exists rather than each row deciding alone.
 */
function Note({ label, text, first }: { label: string; text: string; first?: boolean }) {
  const theme = useTheme();
  if (text === '') return null;

  return (
    <View
      style={[
        styles.note,
        first === true
          ? null
          : { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[styles.noteLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.noteText, { color: theme.colors.text }]}>{text}</Text>
    </View>
  );
}

/**
 * A note: its name above, the field below, across the whole row.
 *
 * NOT the labelled row the rest of the form uses, and the reason is the shape
 * of the answer. A muscle or an increment is a value and reads down the right
 * edge; a note is a sentence or three, and a paragraph pushed into the right
 * half of a row is ragged and cannot grow.
 *
 * It is also the shape the note has when it is READ, a few lines below — so the
 * page does not change layout when it flips into editing.
 */
function NoteField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();

  return (
    <FormRow>
      <View style={styles.noteField}>
        <Text style={[styles.noteLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <FormInput
          value={value}
          onChangeText={onChange}
          placeholder="Facultatif"
          multiline
          autoCapitalize="sentences"
        />
      </View>
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
 * use — so choosing a muscle and filtering on one look alike, which they are.
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
      <Text style={[styles.caption, { color: theme.colors.textFaint }]}>{caption}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => onPress(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? theme.colors.accent : theme.colors.surface,
                  borderColor: on ? theme.colors.accent : theme.colors.border,
                  borderRadius: theme.radius.pill,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: on ? theme.colors.onAccent : theme.colors.text },
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

const styles = StyleSheet.create({
  drawing: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: 10 },
  map: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    // The figures are drawn to the top of their viewBox and carry their own
    // air above; the card owes them the bottom, as the routine page's does.
    paddingBottom: 12,
  },
  value: { fontSize: 16, textAlign: 'right' },
  note: { paddingVertical: 11, paddingHorizontal: 14, gap: 3 },
  noteField: { flex: 1, gap: 3, paddingVertical: 4 },
  noteLabel: { fontSize: 13 },
  noteText: { fontSize: 15, lineHeight: 21 },
  group: { gap: 7 },
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14 },
});
