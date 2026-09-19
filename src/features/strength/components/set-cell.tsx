import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';

/**
 * One numeric cell of a set table: text when read, a field when written.
 *
 * ## IT MOVED HERE AT ITS SECOND REAL USER, WHICH IS THE RULE
 *
 * It was private to set-table.tsx, which was right while routines were the only
 * table of sets. Slice 11 gives it a second: a live session draws the same four
 * columns, and copying it would have been the third copy of the local-text rule
 * below — the one whose absence moved digits in five places before slice 8
 * found it.
 *
 * NOT `core/ui`, though: this knows it is a cell of a set table, with that
 * table's alignment and its dash for "nothing stated". `core/ui/decimal-input`
 * is the generic one and it wraps a FORM row, which is the other idiom. Two
 * shapes, two components, one rule shared between them in prose rather than in
 * code — stated here because merging them is the tempting cleanup.
 *
 * ## THE FIELD HOLDS THE TEXT, THE CALLER HOLDS THE NUMBER
 *
 * Bound straight to a number, "6," parses to 6, re-renders as "6", and the
 * separator just typed vanishes under the caret. Worse than vanishing: typing
 * "1,2" leaves "12" in the field and twelve in the caller. Plausible, wrong and
 * invisible.
 *
 * So the text is local state. It travels OUT on every keystroke, as a number or
 * as null, and travels IN only when the value changed for some other reason —
 * a set duplicated, a session reloaded. Comparing the incoming number with what
 * the text parses to is what tells those two apart.
 */
export function SetCell({
  style,
  editable,
  value,
  decimals,
  placeholder,
  suffix,
  label,
  emphasis,
  onChange,
}: {
  style: object;
  editable: boolean;
  value: number | null;
  decimals?: boolean;
  placeholder: string;
  suffix?: string;
  label: string;
  /** Drawn as a stated value rather than as a hint. Default: from `value`. */
  emphasis?: boolean;
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
    const stated = emphasis ?? shown !== null;
    return (
      <Text
        style={[
          styles.cell,
          style,
          { color: stated ? theme.colors.text : theme.colors.textFaint },
        ]}
      >
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
      placeholderTextColor={theme.colors.textFaint}
      accessibilityLabel={label}
      selectTextOnFocus
    />
  );
}

/**
 * The set number in a chip, which is where the eye goes first down a table of
 * figures.
 *
 * It is the only cell that is not a measurement, so it reads as the row's
 * handle rather than as a fifth number. The page's own ground, so it reads as
 * recessed into the card rather than as a colour the palette would justify.
 */
export function SetChip({ label, accented }: { label: string; accented: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.colors.background, borderRadius: theme.radius.sm },
      ]}
    >
      <Text
        style={[
          styles.setLabel,
          { color: accented ? theme.colors.accent : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** A comma, because a French keyboard offers one. No trailing zero. */
export function formatCell(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * A complete number, or null.
 *
 * An empty field CLEARS the value rather than writing zero: Number('') is 0,
 * and a set showing "0 kg" nobody typed is the defect slice 4 named. A
 * half-typed "2," parses to 2 and the field keeps showing what was typed,
 * because the caller holds the number and the text is the field's own.
 */
export function parseCell(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The column widths both tables share, so the two never drift apart. */
export const setColumns = StyleSheet.create({
  colSet: { width: 38 },
  colValue: { width: 52, textAlign: 'center' },
  colReps: { flex: 1, minWidth: 46, textAlign: 'center' },
  /**
   * The two columns only a LIVE set has (specs 14.38).
   *
   * The routine table has four columns and ends at the target RIR; a session
   * row has five, because the RIR it records and the fact that it happened are
   * two different answers. They live here rather than in live-set-row so the
   * header the session draws by hand cannot drift from the cells underneath —
   * the same reason colSet and colValue are shared.
   */
  colRir: { width: 46, textAlign: 'center' },
  colCheck: { width: 32, textAlign: 'center' },
  /**
   * PRÉCÉDENT, which only a live set has and which is the widest of the narrow
   * columns: it carries two short lines rather than one figure.
   */
  colPrev: { width: 66 },
  /** The type a cell's text is set in, for callers drawing one by hand. */
  cellText: { fontSize: 16, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  chip: { minWidth: 30, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' },
  setLabel: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cell: { fontSize: 16, fontVariant: ['tabular-nums'] },
  input: { paddingVertical: 4, paddingHorizontal: 2 },
});
