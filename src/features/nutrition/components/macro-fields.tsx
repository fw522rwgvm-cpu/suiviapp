import { StyleSheet, Text, View } from 'react-native';
import { FormInput } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';

/**
 * The four figures, typed side by side: what this food is worth.
 *
 * Used by the food editor and by free entry, which ask the very same question
 * and must therefore ask it the same way. Four columns rather than four rows
 * because the whole answer then fits in one glance and one run of taps.
 *
 * ## THE ONE PLACE A FIELD KEEPS A BOX OF ITS OWN
 *
 * Everywhere else in a form the row IS the field: a label on one side, a value
 * on the other, nothing drawn around either. That works because there is one
 * value per row and the eye reads a single column of them.
 *
 * Four of them abreast have no such column, and nothing would say where one
 * ends and the next begins, or where to tap. So each keeps a soft fill -- the
 * page colour, the material iOS uses for a field that has to show its own
 * edges, as in a search bar. A deliberate exception, stated so it is not
 * copied into rows that do not need it.
 *
 * No coloured dots, unlike the block that DISPLAYS these figures: colour tells
 * four values apart at a glance, and glancing is not what is done at a form.
 *
 * ## IT SPEAKS IN TEXT, NOT IN NUMBERS
 *
 * Its two callers hold their figures differently -- the editor as numbers on a
 * draft, free entry as the strings that were typed -- and the string is the
 * one that can be shared. A number round-tripped through a field eats the
 * comma the moment it is typed: "1," parses to 1, renders back as "1", and the
 * decimal can never be reached. So the caller keeps whatever form suits it and
 * hands over text.
 */

/** The four, in the order they are read everywhere else in the application. */
const FIELDS = [
  { key: 'protein', label: 'Protéines', unit: 'g' },
  { key: 'carbs', label: 'Glucides', unit: 'g' },
  { key: 'fat', label: 'Lipides', unit: 'g' },
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
] as const;

export type MacroKey = 'protein' | 'carbs' | 'fat' | 'kcal';

export function MacroFields({
  values,
  onChange,
}: {
  values: Record<MacroKey, string>;
  onChange: (key: MacroKey, text: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {FIELDS.map((field) => (
        <View key={field.key} style={styles.column}>
          <Text
            style={[styles.label, { color: theme.colors.textMuted }]}
            numberOfLines={1}
            // Four names abreast on a narrow screen: shrinking one reads
            // better than cutting it.
            adjustsFontSizeToFit
          >
            {field.label}
          </Text>

          <View style={[styles.box, { backgroundColor: theme.colors.background }]}>
            <FormInput
              value={values[field.key]}
              onChangeText={(text) => onChange(field.key, text)}
              placeholder="0"
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel={`${field.label} (${field.unit})`}
              style={styles.value}
            />
            {/* Part of the value, not of the question: "Protéines" is what is
                asked, "g" is what the answer is counted in. */}
            <Text style={[styles.unit, { color: theme.colors.textMuted }]}>{field.unit}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  column: { flex: 1, gap: 6 },
  label: { fontSize: 12, textAlign: 'center' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
  },
  value: { fontSize: 17 },
  unit: { fontSize: 12 },
});
