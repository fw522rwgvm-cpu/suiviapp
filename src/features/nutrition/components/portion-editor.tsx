import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatQuantity, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { DecimalInput } from '@/core/ui/decimal-input';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
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

  function setQuantity(index: number, value: number | null): void {
    onChange(
      portions.map((portion, at) =>
        at === index ? { ...portion, quantity: value ?? 0 } : portion,
      ),
    );
  }

  function remove(index: number): void {
    onChange(portions.filter((_, at) => at !== index));
  }

  return (
    <FormSection caption="Portions">
      {portions.length === 0 ? (
        <FormRow>
          <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
            Aucune portion. Une portion permet de saisir « 2 tranches » plutôt
            qu’un poids.
          </Text>
        </FormRow>
      ) : null}

      {portions.map((portion, index) => (
        // One portion, one row: its name on the left as the question, what it
        // weighs on the right as the answer — the shape of every other row in
        // the application's forms.
        <FormRow key={`${portion.name}-${index}`} label={portion.name}>
          {/*
            A DecimalInput, not a FormInput bound to a number. Rendering
            String(quantity) and parsing every keystroke ate the separator and
            moved the digits — "1,2" became 12. See core/ui/decimal-input.
          */}
          <DecimalInput
            value={portion.quantity === 0 ? null : portion.quantity}
            onChangeValue={(value) => setQuantity(index, value)}
            placeholder="0"
            selectTextOnFocus
            accessibilityLabel={`Quantité pour une ${portion.name}`}
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
        </FormRow>
      ))}

      {free.length === 0 ? null : (
        // The last row of the group, the way a grouped form offers one more of
        // something. It leaves when there is no name left to give.
        <FormRow>
          <Pressable onPress={add} accessibilityRole="button" style={styles.add}>
            <SymbolView name="plus.circle" size={18} tintColor={theme.colors.accent} />
            <Text style={[styles.addLabel, { color: theme.colors.accent }]}>
              Ajouter une portion
            </Text>
          </Pressable>
        </FormRow>
      )}
    </FormSection>
  );
}

/** "une tranche = 25 g", for the summary line of a saved food. */
export function describePortion(name: string, quantity: number, baseUnit: string): string {
  return `une ${name} = ${formatQuantity(quantity, baseUnit)}`;
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18 },
  unit: { fontSize: 15, width: 24 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addLabel: { fontSize: 16 },
});
