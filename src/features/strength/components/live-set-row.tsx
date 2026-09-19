import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import type { SessionSetView } from '../data/session-reads';
import { setTypeShort } from '../domain/routine-text';
import { needsReps, type SetTarget, type TypedSet } from '../domain/session-set';
import {
  loadPlaceholder,
  repsPlaceholder,
  durationPlaceholder,
  rirLabel,
} from '../domain/session-text';
import { SetCell, SetChip, setColumns } from './set-cell';

/**
 * One set of a live session (specs 10.3).
 *
 * > Par série : charge réelle, répétitions, RIR ressenti, état. Les champs
 * > portent en texte indicatif les valeurs attendues de la routine ; pour une
 * > plage, la plage complète.
 *
 * ## THE PLACEHOLDER IS THE TARGET, AND IT IS A PROMISE
 *
 * A field showing "70" greyed is not decoration: validating the set without
 * touching it records seventy. That is what makes the common path short — do
 * the set as written, tap the check — and it is why recordSet() in the domain
 * owns the rule rather than this component.
 *
 * The one exception the placeholder cannot make is a RANGE: "6-8" prescribes no
 * number, so the reps have to be typed. needsReps() decides; the row says so in
 * words rather than simply refusing.
 *
 * ## FIVE COLUMNS SINCE specs 14.38, AND THE SPLIT IS THE POINT
 *
 * Série · kg · Reps/Temps · RIR · ✓.
 *
 * Slice 11 had four, with a STATE column that showed a check and the RIR
 * together — because picking the RIR was what validated the set. One control
 * doing two things, and it made the second unreachable: there was no way to
 * correct a mis-tapped RIR, and no way to record one before the set was done.
 *
 * Now the RIR is a value like the load, and the check is the only thing that
 * says the set happened. Each is reversible on its own.
 *
 * ## A DONE SET IS STILL A FORM
 *
 * Slice 11 froze it, arguing that "correcting is the business of the finished
 * session, not of the row you have moved past". Requested reversed: you notice
 * the wrong load one set later, not one session later. The fields stay live and
 * `saveTypedSet` never touched `status`, so editing one records the correction
 * and leaves the set done.
 *
 * What still takes a deliberate act is UNDOING the validation, which is the
 * check button pressed a second time — because that is the one edit that
 * changes what the session counts.
 */
export function LiveSetRow({
  set,
  round,
  letter,
  typed,
  active,
  onActivate,
  onType,
  onOpenRir,
  onValidate,
  onReopen,
  onDelete,
}: {
  set: SessionSetView;
  round: number;
  letter: string | null;
  typed: TypedSet;
  active: boolean;
  onActivate: () => void;
  onType: (typed: TypedSet) => void;
  onOpenRir: () => void;
  onValidate: (rir: number) => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  const target: SetTarget = {
    setType: set.setType,
    repsMin: set.targetRepsMin,
    repsMax: set.targetRepsMax,
    loadKg: set.targetLoadKg,
    rir: set.targetRir,
    durationSeconds: set.targetDurationSeconds,
  };
  const done = set.status === 'done';
  const skipped = set.status === 'skipped';
  const number = set.setType === 'work' ? String(round) : setTypeShort(set.setType);
  const label = letter === null ? number : `${letter}${number}`;

  /**
   * Seconds or repetitions, decided by the EXERCISE and read live.
   *
   * The one thing on this row that is not frozen, because it decides which
   * COLUMN the row shows: a session whose plank still asked for repetitions
   * would be a screen that cannot record what is happening. When the exercise
   * is gone, the target says which it was.
   */
  const timed =
    set.tracksDuration === null ? set.targetDurationSeconds !== null : set.tracksDuration === 1;

  /**
   * The RIR this set would record, and whether anybody said so.
   *
   * `actualRir` is a CHOICE — written the moment the picker is used, on a
   * pending set as much as on a done one. The target is the promise the
   * placeholder makes everywhere else on this row: validating without touching
   * it records the target. `chosen` decides only how it is DRAWN, so a value
   * nobody picked reads as faint the way an untouched field does.
   */
  const effectiveRir = set.actualRir ?? target.rir;
  const chosen = set.actualRir !== null;

  const askReps = !skipped && needsReps(target, typed);
  const askRir = !skipped && effectiveRir === null;
  const canValidate = !askReps && !askRir;

  const content = (
    <View>
      <View style={styles.row}>
        <View style={setColumns.colSet}>
          <SetChip label={label} accented={set.setType !== 'work'} />
        </View>

        <SetCell
          style={setColumns.colValue}
          editable={!skipped}
          value={typed.loadKg}
          decimals
          placeholder={loadPlaceholder(target)}
          label="Charge en kilogrammes"
          emphasis={done}
          onChange={(loadKg) => onType({ ...typed, loadKg })}
        />

        {timed ? (
          <SetCell
            style={setColumns.colReps}
            editable={!skipped}
            value={typed.durationSeconds}
            placeholder={durationPlaceholder(target)}
            suffix="s"
            label="Durée en secondes"
            emphasis={done}
            onChange={(durationSeconds) => onType({ ...typed, durationSeconds })}
          />
        ) : (
          <SetCell
            style={setColumns.colReps}
            editable={!skipped}
            value={typed.reps}
            placeholder={repsPlaceholder(target)}
            label="Répétitions"
            emphasis={done}
            onChange={(reps) => onType({ ...typed, reps })}
          />
        )}

        {/*
          THE RIR COLUMN IS A BUTTON, NOT A FIELD.

          Eight values with halves in the middle is not something anybody types
          on a numeric pad between two sets, and it is not free text either —
          specs 10.3 fixes the eight. So the cell shows the value and opens the
          window that changes it.
        */}
        <Pressable
          onPress={onOpenRir}
          disabled={skipped}
          accessibilityRole="button"
          accessibilityLabel={
            effectiveRir === null
              ? 'Choisir le RIR'
              : `RIR ${effectiveRir >= 4 ? '4 ou plus' : rirLabel(effectiveRir)}, modifier`
          }
          hitSlop={4}
          style={({ pressed }) => [
            setColumns.colRir,
            styles.rirCell,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text
            style={[
              setColumns.cellText,
              {
                color: skipped
                  ? theme.colors.textFaint
                  : chosen
                    ? theme.colors.text
                    : theme.colors.textFaint,
              },
            ]}
          >
            {effectiveRir === null ? '—' : rirLabel(effectiveRir)}
          </Text>
        </Pressable>

        {/*
          THE CHECK IS THE ONLY THING THAT SAYS THE SET HAPPENED.

          Pressed again it takes it back — the same button, because "did this
          set happen" is one question with two answers and a separate undo would
          be a second control for the negative of the first.
        */}
        <Pressable
          onPress={done ? onReopen : () => (effectiveRir === null ? undefined : onValidate(effectiveRir))}
          disabled={!done && !canValidate}
          accessibilityRole="button"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? 'Annuler la validation' : 'Valider la série'}
          hitSlop={6}
          style={({ pressed }) => [
            setColumns.colCheck,
            styles.checkCell,
            { opacity: pressed ? 0.5 : !done && !canValidate ? 0.35 : 1 },
          ]}
        >
          <SymbolView
            name={done ? 'checkmark.circle.fill' : 'circle'}
            tintColor={done ? theme.colors.accent : theme.colors.textFaint}
            size={24}
            fallback={
              <Text style={{ color: done ? theme.colors.accent : theme.colors.textFaint }}>
                {done ? '☑' : '☐'}
              </Text>
            }
          />
        </Pressable>
      </View>

      {/*
        Said rather than simply refused. A check that silently did nothing would
        read as a broken control, and neither reason is guessable: a range
        prescribes no number, so nothing can be filled in for the user — and
        guessing the top of it would fire the progression rule of specs 10.4 on
        a set nobody described.
      */}
      {active && !done && !skipped && !canValidate ? (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {askReps
            ? timed
              ? 'Indiquez le temps tenu pour valider.'
              : 'Indiquez les répétitions pour valider.'
            : 'Choisissez un RIR pour valider.'}
        </Text>
      ) : null}
    </View>
  );

  /*
    The swipe owns the press, never a Pressable wrapped around the content:
    React Native's responder system and gesture-handler do not arbitrate, so a
    Pressable under an active pan fires on release — the defect slice 4 found on
    the cart and on the Journal, on the same day.

    The press here ACTIVATES the row rather than opening anything, which is why
    it is safe beside the fields and the two buttons: tapping a cell focuses it,
    tapping a button does its own thing, tapping anywhere else moves the hint to
    this set.
  */
  return (
    <SwipeToDeleteRow
      onDelete={onDelete}
      onPress={active ? undefined : onActivate}
      accessibilityLabel={`Série ${label}`}
      actionLabel="Retirer"
    >
      {content}
    </SwipeToDeleteRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 44,
  },
  rirCell: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  checkCell: { alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, paddingHorizontal: 4, paddingBottom: 8 },
});
