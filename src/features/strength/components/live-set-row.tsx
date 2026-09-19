import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import { SET_TYPES } from '@/core/db/schema';
import type { PreviousSet, SessionSetView } from '../data/session-reads';
import { setTypeShort } from '../domain/routine-text';
import { needsReps, type SetTarget, type TypedSet } from '../domain/session-set';
import {
  loadPlaceholder,
  repsPlaceholder,
  durationPlaceholder,
  previousText,
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
  number,
  letter,
  typed,
  previous,
  showPrevious = true,
  active,
  onType,
  onCycleType,
  onOpenRir,
  onValidate,
  onReopen,
  onDelete,
}: {
  set: SessionSetView;
  /**
   * What the first cell shows for a WORKING set. `null` for the other kinds,
   * which show their own short word instead (specs 14.41).
   */
  number: number | null;
  letter: string | null;
  typed: TypedSet;
  /** What this same set did last time the routine was done. `null` when never. */
  previous: PreviousSet | null;
  /**
   * Whether the PRÉCÉDENT column is drawn at all (slice 12).
   *
   * A finished session cannot answer the question honestly — readPreviousSets
   * looks for the last done session OTHER than this one, which for an old
   * session is a LATER one. The reasoning is in session-block-card; here it is
   * enough that the column is removed rather than filled with em dashes, so
   * its sixty-six points go to the reps column instead.
   */
  showPrevious?: boolean;
  active: boolean;
  onType: (typed: TypedSet) => void;
  onCycleType: (next: (typeof SET_TYPES)[number]) => void;
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
  /*
    A warm-up, a drop set and a long set state their kind; a working set states
    its rank among the working sets only — so [Éch, travail, travail] reads
    Éch · 1 · 2. The rule is workSetNumbers, in the domain, because the routine
    table numbers its rows the same way.
  */
  const shown = number === null ? setTypeShort(set.setType) : String(number);
  const label = letter === null ? shown : `${letter}${shown}`;

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

  const history = previousText(previous);

  const askReps = !skipped && needsReps(target, typed);
  const askRir = !skipped && effectiveRir === null;
  const canValidate = !askReps && !askRir;

  const content = (
    <View>
      <View style={styles.row}>
        {/*
          THE FIRST CELL STATES THE TYPE AND CHANGES IT, exactly as the routine
          table has since slice 10.

          It is not decoration: specs 10.1 counts volume on WORKING sets only,
          and specs 10.4 reads "toutes les séries de travail" to decide a
          progression. A warm-up you decided on mid-session and could not
          relabel would inflate both, quietly and for ever.
        */}
        <Pressable
          onPress={() => onCycleType(nextSetType(set.setType))}
          disabled={skipped}
          accessibilityRole="button"
          accessibilityLabel={`Série ${label}, changer le type`}
          hitSlop={4}
          style={({ pressed }) => [setColumns.colSet, { opacity: pressed ? 0.5 : 1 }]}
        >
          <SetChip label={label} accented={set.setType !== 'work'} />
        </Pressable>

        {/*
          PRÉCÉDENT — what this same set did the last time this routine was
          performed. Between the number and the load, because it is what you
          read to decide the load you are about to type.
        */}
        {!showPrevious ? null : (
          <View style={setColumns.colPrev}>
            <Text
              style={[styles.prevLine, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {history.line}
            </Text>
            {history.rir === null ? null : (
              <Text style={[styles.prevRir, { color: theme.colors.textFaint }]} numberOfLines={1}>
                {history.rir}
              </Text>
            )}
          </View>
        )}

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
          {/*
            A BUTTON THAT LOOKS LIKE ONE, not a number you have to discover is
            tappable. Filled once a value has been chosen, outlined while it is
            only the target the placeholder promises — the same distinction the
            fields make between typed and indicative, in the only shape a cell
            this narrow can carry.
          */}
          <View
            style={[
              styles.rirChip,
              {
                backgroundColor: chosen ? theme.colors.accent : 'transparent',
                borderColor: chosen ? theme.colors.accent : theme.colors.border,
                borderRadius: theme.radius.sm,
                opacity: skipped ? 0.4 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.rirLabel,
                { color: chosen ? theme.colors.onAccent : theme.colors.textMuted },
              ]}
            >
              {effectiveRir === null ? '—' : rirLabel(effectiveRir)}
            </Text>
          </View>
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
    NO `onPress` ON THE ROW, AND THAT IS THE FIX RATHER THAN AN OMISSION.

    SwipeToDeleteRow swallows touches with `pointerEvents="box-only"` whenever
    it is given one — a deliberate rule, because React Native's responder system
    and gesture-handler do not arbitrate and a Pressable under an active pan
    fires on release (the defect slice 4 found on the cart and on the Journal).

    But this row CONTAINS controls: two fields and two buttons. With a row press
    they received nothing, so the first tap activated the row, which removed the
    onPress, and only the second reached the button — reported as "je dois
    appuyer 2 fois sur le bouton valider". Slice 10 hit the same wall with the
    routine table's fields.

    There is nothing left for a row press to do anyway: the RIR strip it used to
    move became a column on every row.
  */
  return (
    <SwipeToDeleteRow
      onDelete={onDelete}
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
  rirCell: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  rirChip: {
    minWidth: 40,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  rirLabel: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  prevLine: { fontSize: 12, fontVariant: ['tabular-nums'] },
  prevRir: { fontSize: 11, fontVariant: ['tabular-nums'] },
  checkCell: { alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, paddingHorizontal: 4, paddingBottom: 8 },
});

/**
 * The next kind in the cycle, wrapping round.
 *
 * Derived from SET_TYPES rather than written out, so a fifth kind joins the
 * cycle by existing — the shape PORTION_NAMES settled in slice 3: data first,
 * everything else derived from it.
 */
function nextSetType(current: (typeof SET_TYPES)[number]): (typeof SET_TYPES)[number] {
  const index = SET_TYPES.indexOf(current);
  return SET_TYPES[(index + 1) % SET_TYPES.length] ?? SET_TYPES[0];
}
