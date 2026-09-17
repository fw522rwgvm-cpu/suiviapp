import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import { SET_TYPES } from '@/core/db/schema';
import type { BlockDraft, LineDraft } from '../domain/routine-draft';
import { setIndexOf } from '../domain/routine-draft';
import { setTypeShort } from '../domain/routine-text';

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
 * the width the targets needed.
 *
 * ## THE FIRST COLUMN CARRIES TWO THINGS, AND THAT IS DELIBERATE
 *
 * It shows "S1" for a working set and "Éch", "Drop" or "Long" otherwise —
 * `travail` being the default (specs 6.3), labelling every ordinary row with it
 * would be a column of the same word, and the exceptions, which are the ones
 * worth seeing, would stop standing out. In edit mode touching it cycles the
 * type, so one cell states the type and changes it.
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

  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.headCell, styles.colSet, { color: theme.colors.textMuted }]}>
          Série
        </Text>
        <Text style={[styles.headCell, styles.colValue, { color: theme.colors.textMuted }]}>
          kg
        </Text>
        <Text style={[styles.headCell, styles.colReps, { color: theme.colors.textMuted }]}>
          {tracksDuration ? 'Temps' : 'Reps'}
        </Text>
        <Text style={[styles.headCell, styles.colValue, { color: theme.colors.textMuted }]}>
          RIR
        </Text>
        <View style={styles.colFlag} />
      </View>

      {block.lines.map((line, lineIndex) => (
        <View key={line.id ?? `line-${lineIndex}`}>
          <ListSeparator />
          <SetRowInner
            block={block}
            line={line}
            lineIndex={lineIndex}
            tracksDuration={tracksDuration}
            editable={editable}
            onChange={(change) => onChangeLine?.(lineIndex, change)}
            onDelete={() => onDeleteLine?.(lineIndex)}
          />
        </View>
      ))}
    </View>
  );
}

function SetRowInner({
  block,
  line,
  lineIndex,
  tracksDuration,
  editable,
  onChange,
  onDelete,
}: {
  block: BlockDraft;
  line: LineDraft;
  lineIndex: number;
  tracksDuration: boolean;
  editable: boolean;
  onChange: (change: Partial<LineDraft>) => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const index = setIndexOf(block, lineIndex);
  const label = line.setType === 'work' ? `S${index}` : setTypeShort(line.setType);

  function cycleType(): void {
    const at = SET_TYPES.indexOf(line.setType);
    const next = SET_TYPES[(at + 1) % SET_TYPES.length];
    if (next !== undefined) onChange({ setType: next });
  }

  const content = (
    <View style={styles.row}>
      {editable ? (
        <Pressable
          onPress={cycleType}
          accessibilityRole="button"
          accessibilityLabel={`Type de série : ${label}`}
          style={styles.colSet}
        >
          <Text style={[styles.setLabel, { color: theme.colors.accent }]}>{label}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.setLabel, styles.colSet, { color: theme.colors.textMuted }]}>
          {label}
        </Text>
      )}

      <Cell
        style={styles.colValue}
        editable={editable}
        value={line.targetLoadKg}
        decimals
        placeholder="—"
        label="Charge en kilogrammes"
        onChange={(targetLoadKg) => onChange({ targetLoadKg })}
      />

      {tracksDuration ? (
        <Cell
          style={styles.colReps}
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

      <Cell
        style={styles.colValue}
        editable={editable}
        value={line.targetRir}
        decimals
        placeholder="—"
        label="RIR cible"
        onChange={(targetRir) => onChange({ targetRir })}
      />

      {/*
        The progression flag, as a mark rather than a column: specs 10.4 makes
        it a per-line switch, but it is off on most sets and a header for it
        would cost width four numbers need. Touched in edit mode, read-only
        otherwise.
      */}
      {editable ? (
        <Pressable
          onPress={() => onChange({ progressionEnabled: !line.progressionEnabled })}
          accessibilityRole="switch"
          accessibilityState={{ checked: line.progressionEnabled }}
          accessibilityLabel="Règle de progression"
          style={styles.colFlag}
        >
          <Text
            style={[
              styles.flag,
              { color: line.progressionEnabled ? theme.colors.accent : theme.colors.border },
            ]}
          >
            ↗
          </Text>
        </Pressable>
      ) : (
        <View style={styles.colFlag}>
          {line.progressionEnabled ? (
            <Text style={[styles.flag, { color: theme.colors.accent }]}>↗</Text>
          ) : null}
        </View>
      )}
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
      accessibilityLabel={`Série ${index}`}
      actionLabel="Retirer"
    >
      {content}
    </SwipeToDeleteRow>
  );
}

/**
 * One numeric cell: text when read, a field when edited.
 *
 * ## THE FIELD HOLDS THE TEXT, THE DRAFT HOLDS THE NUMBER
 *
 * Not the other way round — and the first version of this file got it wrong
 * while its own comment described the fix. Bound straight to the draft, "6,"
 * parses to 6, re-renders as "6", and the separator just typed vanishes under
 * the caret. That is exactly what slice 8 found by shipping it on the weight
 * field.
 *
 * So the text is local state. It travels OUT on every keystroke, as a number or
 * as null, and travels IN only when the draft changed for some other reason — a
 * set duplicated, a routine reloaded. Comparing the incoming number with what
 * the text parses to is what tells those two apart.
 */
function Cell({
  style,
  editable,
  value,
  decimals,
  placeholder,
  suffix,
  label,
  onChange,
}: {
  style: object;
  editable: boolean;
  value: number | null;
  decimals?: boolean;
  placeholder: string;
  suffix?: string;
  label: string;
  onChange: (value: number | null) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(() => (value === null ? '' : formatCell(value)));

  /**
   * Adopt an incoming value only when it says something the text does not.
   *
   * Adjusted DURING the render rather than in an effect, which is React's own
   * answer to this: an effect runs after its render has been painted, so the
   * cell would show the stale text for a frame. Slice 3 paid for that on the
   * day carousel and slice 4 on the quantity wheels.
   */
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseCell(text) !== value) setText(value === null ? '' : formatCell(value));
  }

  if (!editable) {
    const shown =
      value === null ? null : `${formatCell(value)}${suffix === undefined ? '' : ` ${suffix}`}`;
    return (
      <Text style={[styles.cell, style, { color: theme.colors.text }]}>
        {shown ?? placeholder}
      </Text>
    );
  }

  return (
    <TextInput
      style={[styles.cell, styles.input, style, { color: theme.colors.text }]}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseCell(next));
      }}
      keyboardType={decimals === true ? 'decimal-pad' : 'number-pad'}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      accessibilityLabel={label}
      selectTextOnFocus
    />
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
    return (
      <Text style={[styles.cell, styles.colReps, { color: theme.colors.text }]}>
        {rangeText(min, max)}
      </Text>
    );
  }

  return (
    <View style={[styles.colReps, styles.range]}>
      <Cell
        style={styles.rangeField}
        editable
        value={min}
        placeholder="—"
        label="Répétitions minimum"
        onChange={(repsMin) => onChange({ repsMin })}
      />
      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>–</Text>
      <Cell
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

/** A comma, because a French keyboard offers one. No trailing zero. */
function formatCell(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * A complete number, or null.
 *
 * An empty field CLEARS the target rather than writing zero: Number('') is 0,
 * and a set showing "0 kg" nobody typed is the defect slice 4 named. A
 * half-typed "2," parses to 2 and the field keeps showing what was typed,
 * because the draft holds the number and the text is the field's own.
 */
function parseCell(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  headCell: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  colSet: { width: 44 },
  colValue: { width: 58, textAlign: 'center' },
  colReps: { flex: 1, minWidth: 74, textAlign: 'center' },
  colFlag: { width: 22, alignItems: 'center' },
  setLabel: { fontSize: 13, fontVariant: ['tabular-nums'] },
  cell: { fontSize: 15, fontVariant: ['tabular-nums'] },
  input: { paddingVertical: 4, paddingHorizontal: 2 },
  range: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  rangeField: { width: 34, textAlign: 'center' },
  flag: { fontSize: 15 },
});
