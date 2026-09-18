import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import type { SessionSetView } from '../data/session-reads';
import { setTypeShort } from '../domain/routine-text';
import { needsReps, type SetTarget, type TypedSet } from '../domain/session-set';
import { loadPlaceholder, repsPlaceholder, durationPlaceholder, rirLabel } from '../domain/session-text';
import { SetCell, SetChip, setColumns } from './set-cell';
import { RirRow } from './rir-row';

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
 * touching it records seventy. That is what makes the common path two taps —
 * do the set as written, say the RIR — and it is why recordSet() in the domain
 * owns the rule rather than this component.
 *
 * The one exception the placeholder cannot make is a RANGE: "6-8" prescribes no
 * number, so the reps have to be typed before the RIR row appears. needsReps()
 * decides; the row says so in words rather than simply refusing.
 *
 * ## ONE SET IS ACTIVE AT A TIME, AND IT CARRIES THE RIR ROW
 *
 * Eight RIR cells under every set would be a wall of forty buttons on an
 * ordinary workout. The row belongs to the set being done, which is the first
 * one not yet finished — and tapping another row moves it, because a workout is
 * not always performed in order.
 *
 * ## AND A DONE SET STOPS BEING A FORM
 *
 * It shows what was recorded, in the text colour rather than the faint one, and
 * a check where the RIR was. A field that stays editable after validation
 * invites a correction that would have to re-open the set; correcting is the
 * business of the finished session (specs 10.3, "reste éditable"), not of the
 * row you have moved past.
 */
export function LiveSetRow({
  set,
  round,
  letter,
  typed,
  active,
  onActivate,
  onType,
  onValidate,
  onDelete,
}: {
  set: SessionSetView;
  round: number;
  /** The exercise's letter in a superset; null in an ordinary block. */
  letter: string | null;
  typed: TypedSet;
  active: boolean;
  onActivate: () => void;
  onType: (typed: TypedSet) => void;
  onValidate: (rir: number) => void;
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

  const askReps = !done && !skipped && needsReps(target, typed);

  const content = (
    <View>
      <View style={styles.row}>
        <View style={setColumns.colSet}>
          <SetChip label={label} accented={set.setType !== 'work'} />
        </View>

        <SetCell
          style={setColumns.colValue}
          editable={!done && !skipped}
          value={done ? set.actualLoadKg : typed.loadKg}
          decimals
          placeholder={loadPlaceholder(target)}
          label="Charge en kilogrammes"
          emphasis={done}
          onChange={(loadKg) => onType({ ...typed, loadKg })}
        />

        {timed ? (
          <SetCell
            style={setColumns.colReps}
            editable={!done && !skipped}
            value={done ? set.actualDurationSeconds : typed.durationSeconds}
            placeholder={durationPlaceholder(target)}
            suffix="s"
            label="Durée en secondes"
            emphasis={done}
            onChange={(durationSeconds) => onType({ ...typed, durationSeconds })}
          />
        ) : (
          <SetCell
            style={setColumns.colReps}
            editable={!done && !skipped}
            value={done ? set.actualReps : typed.reps}
            placeholder={repsPlaceholder(target)}
            label="Répétitions"
            emphasis={done}
            onChange={(reps) => onType({ ...typed, reps })}
          />
        )}

        {/*
          The fourth column is the STATE, where the routine table puts the
          target RIR. A live set already carries its target in the placeholders;
          what it does not know is whether it happened.
        */}
        <View style={[setColumns.colValue, styles.state]}>
          {done ? (
            <View style={styles.doneState}>
              <SymbolView
                name="checkmark.circle.fill"
                tintColor={theme.colors.accent}
                size={17}
                fallback={<Text style={{ color: theme.colors.accent }}>✓</Text>}
              />
              <Text style={[styles.rirDone, { color: theme.colors.textMuted }]}>
                {set.actualRir === null ? '' : rirLabel(set.actualRir)}
              </Text>
            </View>
          ) : skipped ? (
            <Text style={[styles.passed, { color: theme.colors.textFaint }]}>Passée</Text>
          ) : (
            <Text style={[styles.passed, { color: theme.colors.textFaint }]}>—</Text>
          )}
        </View>
      </View>

      {active && !done && !skipped ? (
        askReps ? (
          /*
            Said rather than simply refused. A RIR row that silently did nothing
            would read as a broken control, and the reason it is absent is not
            guessable: a range prescribes no number, so nothing can be filled in
            for the user — and guessing the top of it would fire the progression
            rule of specs 10.4 on a set nobody described.
          */
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            {timed ? 'Indiquez le temps tenu pour valider.' : 'Indiquez les répétitions pour valider.'}
          </Text>
        ) : (
          <RirRow onPick={onValidate} />
        )
      ) : null}
    </View>
  );

  /*
    The swipe owns the press, never a Pressable wrapped around the content:
    React Native's responder system and gesture-handler do not arbitrate, so a
    Pressable under an active pan fires on release — the defect slice 4 found on
    the cart and on the Journal, on the same day.

    The press here ACTIVATES the row rather than opening anything, which is why
    it is safe beside the fields: tapping a cell focuses it, tapping anywhere
    else moves the RIR row to this set.
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
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 44,
  },
  state: { alignItems: 'center', justifyContent: 'center' },
  doneState: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rirDone: { fontSize: 13, fontVariant: ['tabular-nums'] },
  passed: { fontSize: 13 },
  hint: { fontSize: 13, paddingHorizontal: 4, paddingBottom: 8 },
});
