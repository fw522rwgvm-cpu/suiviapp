import { StyleSheet, Text } from 'react-native';
import { FormInput, FormRow } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';

/**
 * The four figures a food is worth, one question per row.
 *
 * Used by the food editor and by free entry, which ask exactly the same thing
 * and must therefore ask it the same way — two spellings of one question get
 * answered as if they were two.
 *
 * A ROW EACH, not a line of four. Four boxes abreast do fit, but they are four
 * answers crammed into the space of one, and they need boxes of their own to
 * be told apart — a second container saying what the row already says. A row
 * gives each its name on the left and its figure on the right: the shape of
 * every other question in these forms, and the only one that lets a column of
 * values be read straight down.
 *
 * No coloured dots, unlike the block that DISPLAYS these figures: a colour
 * tells four values apart at a glance, and glancing is not what is done at a
 * form. Here the label is read, then typed into.
 */

export type MacroKey = 'protein' | 'carbs' | 'fat' | 'kcal';

/**
 * The four, in the order they are read everywhere else.
 *
 * Calories come last and are not a fourth macro: they are what the other three
 * come to, which is why specs 5.1 checks the one against the others.
 */
export const MACRO_FIELDS: readonly { key: MacroKey; label: string; unit: string }[] = [
  { key: 'protein', label: 'Protéines', unit: 'g' },
  { key: 'carbs', label: 'Glucides', unit: 'g' },
  { key: 'fat', label: 'Lipides', unit: 'g' },
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
];

/**
 * One of them, as a row of its own so that a section can rule between them.
 *
 * IT SPEAKS IN TEXT, NOT IN NUMBERS. Its two callers hold their figures
 * differently — the editor as numbers on a draft, free entry as the strings
 * that were typed — and the string is the one that can be shared. A number
 * round-tripped through a field eats the comma the moment it is typed: "1,"
 * parses to 1, renders back as "1", and the decimal can never be reached.
 */
export function MacroFieldRow({
  field,
  value,
  onChange,
}: {
  field: { key: MacroKey; label: string; unit: string };
  value: string;
  onChange: (key: MacroKey, text: string) => void;
}) {
  const theme = useTheme();

  return (
    <FormRow label={field.label}>
      <FormInput
        value={value}
        onChangeText={(text) => onChange(field.key, text)}
        placeholder="0"
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={`${field.label} (${field.unit})`}
      />
      {/* Part of the value, not of the question: "Protéines" is what is asked,
          "g" is what the answer is counted in. */}
      <Text style={[styles.unit, { color: theme.colors.textMuted }]}>{field.unit}</Text>
    </FormRow>
  );
}

const styles = StyleSheet.create({
  unit: { fontSize: 17 },
});
