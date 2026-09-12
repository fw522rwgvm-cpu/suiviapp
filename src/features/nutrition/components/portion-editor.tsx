import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatQuantity, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { PortionDraft } from '../domain/food-draft';
import { availableNames } from '../domain/portions';

/**
 * The portion list inside the food editor (specs 8.5).
 *
 * > Management of named portions, with their quantity in base units.
 *
 * Two rules the screen has to honour and cannot invent:
 *
 *  - the name comes from the closed list of specs 6.1, so it is CHOSEN, never
 *    typed. That is also why food_portion.name needs no CHECK constraint: the
 *    vocabulary is enforced where it can still be widened without rebuilding a
 *    table.
 *  - a name is unique per food, so a name already used is not offered. The
 *    unique index would refuse it at the end of a save, citing an index —
 *    which is the last thing that should be doing the talking.
 *
 * When every name is taken the add button disappears rather than opening an
 * empty menu.
 */
export function PortionEditor({
  portions,
  baseUnit,
  onChange,
}: {
  portions: PortionDraft[];
  baseUnit: string;
  onChange: (portions: PortionDraft[]) => void;
}) {
  const theme = useTheme();
  const free = availableNames(portions.map((portion) => portion.name));

  function add(): void {
    if (free.length === 0) return;
    Alert.alert('Ajouter une portion', 'Son nom', [
      { text: 'Annuler', style: 'cancel' },
      ...free.map((name) => ({
        text: name,
        onPress: () => onChange([...portions, { id: null, name, quantity: 0 }]),
      })),
    ]);
  }

  function setQuantity(index: number, text: string): void {
    const parsed = parseDecimal(text);
    onChange(
      portions.map((portion, at) =>
        at === index ? { ...portion, quantity: parsed ?? 0 } : portion,
      ),
    );
  }

  function remove(index: number): void {
    onChange(portions.filter((_, at) => at !== index));
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.colors.textMuted }]}>Portions</Text>

      {portions.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
          Aucune portion. Une portion permet de saisir « 2 tranches » plutôt
          qu’un poids.
        </Text>
      ) : null}

      {portions.map((portion, index) => (
        <View key={`${portion.name}-${index}`} style={styles.row}>
          <Text style={[styles.name, { color: theme.colors.text }]}>{portion.name}</Text>

          <TextInput
            value={portion.quantity === 0 ? '' : String(portion.quantity).replace('.', ',')}
            onChangeText={(text) => setQuantity(index, text)}
            placeholder="0"
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel={`Quantité pour une ${portion.name}`}
            // Filled and borderless, like every other field on this screen:
            // the system draws no rectangle around a text field, and two
            // idioms on one page read as two pages.
            style={[
              styles.input,
              { color: theme.colors.text, backgroundColor: theme.colors.background },
            ]}
          />
          <Text style={[styles.unit, { color: theme.colors.textMuted }]}>{baseUnit}</Text>

          <Pressable
            onPress={() => remove(index)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer la portion ${portion.name}`}
          >
            <SymbolView name="minus.circle" size={20} tintColor={theme.colors.danger} />
          </Pressable>
        </View>
      ))}

      {free.length === 0 ? null : (
        <Pressable onPress={add} accessibilityRole="button" style={styles.add}>
          <SymbolView name="plus.circle" size={18} tintColor={theme.colors.accent} />
          <Text style={[styles.addLabel, { color: theme.colors.accent }]}>
            Ajouter une portion
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** "une tranche = 25 g", for the summary line of a saved food. */
export function describePortion(name: string, quantity: number, baseUnit: string): string {
  return `une ${name} = ${formatQuantity(quantity, baseUnit)}`;
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { fontSize: 13 },
  empty: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 16 },
  input: {
    width: 84,
    fontSize: 17,
    textAlign: 'right',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  unit: { fontSize: 15, width: 24 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addLabel: { fontSize: 16 },
});
