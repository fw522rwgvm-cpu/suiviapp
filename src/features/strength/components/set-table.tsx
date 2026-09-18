import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import { SET_TYPES } from '@/core/db/schema';
import type { BlockDraft, LineDraft } from '../domain/routine-draft';
import { exercisesOfBlock, roundsOf } from '../domain/routine-draft';
import { setTypeShort } from '../domain/routine-text';
import { SetCell, SetChip, formatCell, parseCell, setColumns } from './set-cell';

/**
 * The sets of a block, as a table (specs 10.2).
 *
 * > Présentation identique à la création, non éditable.
 *
 * ONE COMPONENT FOR BOTH, with `editable` deciding whether a cell is a field.
 * That sentence of the specification is taken literally, and it is also the only
 * way the two stay in step: a page and a form drawn by two components start
 * disagreeing about what a set says, and the first thing to drift would be
 * which column the reps live in.
 *
 * ## FOUR COLUMNS, AND WHAT PUSHED THE REST OUT
 *
 * Série · kg · Reps or Temps · RIR. The rest is NOT among them — it moved to
 * the block, where it belongs in every shape: nobody rests differently between
 * two sets of the same exercise, and giving each row its own rest cost the row
 * the width the targets needed. The progression flag left the same way, for the
 * same reason and to the same place.
 *
 * ## THE ROWS ARE ORDERED BY ROUND, WHICH ONLY SHOWS IN A SUPERSET
 *
 * An ordinary block has one exercise, so one set per round, and the table is
 * what it always was: S1, S2, S3. A superset alternates — A, B, then A, B again
 * — which is the order it is performed in, so a row has to say WHICH exercise
 * it is. It says so with a letter, assigned by the order the exercises appear
 * in the block and spelled out under the block's title.
 *
 * A letter rather than the name: a name does not fit beside four numbers, and
 * truncating it would make two rows of a superset look alike, which is the one
 * thing this layout must not do.
 *
 * ## THE FIRST COLUMN CARRIES TWO THINGS, AND THAT IS DELIBERATE
 *
 * It shows the set number for a working set and "Éch", "Drop" or "Long"
 * otherwise — `travail` being the default (specs 6.3), labelling every ordinary
 * row with it would be a column of the same word, and the exceptions, which are
 * the ones worth seeing, would stop standing out. In edit mode touching it
 * cycles the type, so one cell states the type and changes it.
 *
 * ## REPS OR TIME, NEVER BOTH
 *
 * The exercise decides, through `tracksDuration`. A plank states 45 s and no
 * repetitions at all; the column header changes with it. That is why the flag
 * is on the exercise and not on the line — the header belongs to the block, and
 * a per-line flag could disagree with itself inside one block.
 */
export function SetTable({
  block,
  tracksDuration,
  editable,
  onChangeLine,
  onDeleteLine,
}: {
  block: BlockDraft;
  /** Whether this block's exercise is measured in seconds. */
  tracksDuration: boolean;
  editable: boolean;
  onChangeLine?: (lineIndex: number, change: Partial<LineDraft>) => void;
  onDeleteLine?: (lineIndex: number) => void;
}) {
  const theme = useTheme();

  const rounds = roundsOf(block);
  const exercises = exercisesOfBlock(block);
  const letters = new Map(exercises.map((item, index) => [item.exerciseId, LETTERS[index] ?? '?']));
  const lettered = exercises.length > 1;

  let separated = false;

  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.headCell, setColumns.colSet, { color: theme.colors.textMuted }]}>
          {lettered ? 'Tour' : 'Série'}
        </Text>
        <Text style={[styles.headCell, setColumns.colValue, { color: theme.colors.textMuted }]}>kg</Text>
        <Text style={[styles.headCell, setColumns.colReps, { color: theme.colors.textMuted }]}>
          {tracksDuration ? 'Temps' : 'Reps'}
        </Text>
        <Text style={[styles.headCell, setColumns.colValue, { color: theme.colors.textMuted }]}>
          RIR
        </Text>
      </View>

      {rounds.map((round, roundIndex) =>
        round.map(({ line, lineIndex }) => {
          const wasSeparated = separated;
          separated = true;
          return (
            <View key={line.id ?? `line-${lineIndex}`}>
              {wasSeparated ? <ListSeparator /> : null}
              <SetRowInner
                line={line}
                round={roundIndex + 1}
                letter={lettered ? (letters.get(line.exerciseId) ?? '?') : null}
                tracksDuration={tracksDuration}
                editable={editable}
                onChange={(change) => onChangeLine?.(lineIndex, change)}
                onDelete={() => onDeleteLine?.(lineIndex)}
              />
            </View>
          );
        }),
      )}
    </View>
  );
}

/** A, B, C… Beyond three exercises a block stops being a superset anyone runs. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function SetRowInner({
  line,
  round,
  letter,
  tracksDuration,
  editable,
  onChange,
  onDelete,
}: {
  line: LineDraft;
  round: number;
  /** The exercise's letter in a superset; null in an ordinary block. */
  letter: string | null;
  tracksDuration: boolean;
  editable: boolean;
  onChange: (change: Partial<LineDraft>) => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const number = line.setType === 'work' ? String(round) : setTypeShort(line.setType);
  const label = letter === null ? number : `${letter}${number}`;

  function cycleType(): void {
    const at = SET_TYPES.indexOf(line.setType);
    const next = SET_TYPES[(at + 1) % SET_TYPES.length];
    if (next !== undefined) onChange({ setType: next });
  }

  const chip = <SetChip label={label} accented={line.setType !== 'work'} />;

  const content = (
    <View style={styles.row}>
      {editable ? (
        <Pressable
          onPress={cycleType}
          accessibilityRole="button"
          accessibilityLabel={`Type de série : ${label}`}
          style={setColumns.colSet}
        >
          {chip}
        </Pressable>
      ) : (
        <View style={setColumns.colSet}>{chip}</View>
      )}

      <SetCell
        style={setColumns.colValue}
        editable={editable}
        value={line.targetLoadKg}
        decimals
        placeholder="—"
        label="Charge en kilogrammes"
        onChange={(targetLoadKg) => onChange({ targetLoadKg })}
      />

      {tracksDuration ? (
        <SetCell
          style={setColumns.colReps}
          editable={editable}
          value={line.durationSeconds}
          placeholder="—"
          suffix="s"
          label="Durée en secondes"
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      ) : (
        <RangeCell
          editable={editable}
          min={line.repsMin}
          max={line.repsMax}
          onChange={(change) => onChange(change)}
        />
      )}

      <SetCell
        style={setColumns.colValue}
        editable={editable}
        value={line.targetRir}
        decimals
        placeholder="—"
        label="RIR cible"
        onChange={(targetRir) => onChange({ targetRir })}
      />
    </View>
  );

  if (!editable) return content;

  /*
    The swipe lives in the row and the press is handed over, never wrapped:
    React Native's responder system and gesture-handler do not arbitrate, so a
    Pressable under an active pan fires on release. No onPress here — the cells
    are fields, and a row-wide press would fight them.
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

/**
 * The rep range, which is two numbers in one column.
 *
 * Read as "6-8", "10", "8+" or "≤ 12"; edited as two small fields with a dash
 * between them. A half-open range is not an error — ck_line_reps allows one
 * bound alone, and both readings are things people write down.
 *
 * Both halves are Cells, so they inherit the local-text rule rather than
 * repeating it: the fix for a lost separator belongs in one place.
 */
function RangeCell({
  editable,
  min,
  max,
  onChange,
}: {
  editable: boolean;
  min: number | null;
  max: number | null;
  onChange: (change: { repsMin?: number | null; repsMax?: number | null }) => void;
}) {
  const theme = useTheme();

  if (!editable) {
    const shown = rangeText(min, max);
    return (
      <Text
        style={[
          setColumns.cellText,
          setColumns.colReps,
          { color: shown === '—' ? theme.colors.textFaint : theme.colors.text },
        ]}
      >
        {shown}
      </Text>
    );
  }

  return (
    <View style={[setColumns.colReps, styles.range]}>
      <SetCell
        style={styles.rangeField}
        editable
        value={min}
        placeholder="—"
        label="Répétitions minimum"
        onChange={(repsMin) => onChange({ repsMin })}
      />
      <Text style={{ color: theme.colors.textFaint, fontSize: 13 }}>–</Text>
      <SetCell
        style={styles.rangeField}
        editable
        value={max}
        placeholder="—"
        label="Répétitions maximum"
        onChange={(repsMax) => onChange({ repsMax })}
      />
    </View>
  );
}

/** "6-8", "10", "8+", "≤ 12", or a dash when neither bound is set. */
function rangeText(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  if (min !== null && max === null) return `${min}+`;
  if (min === null && max !== null) return `≤ ${max}`;
  return min === max ? String(min) : `${min}-${max}`;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  headCell: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 44,
  },
  range: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  rangeField: { width: 34, textAlign: 'center' },
});
