import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { DecimalInput } from '@/core/ui/decimal-input';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import type { IngredientDraft } from '../domain/recipe-draft';
import { scaleMacros } from '../domain/recipe-macros';
import type { Macros } from '../domain/macros';

/**
 * The ingredient list inside the recipe editor (specs 8.6).
 *
 * > Liste d'ingrédients : référence à un Aliment + quantité + unité.
 *
 * ## THE QUANTITY IS ALWAYS IN BASE UNITS, AND THE ROW SAYS SO
 *
 * Never a count of portions. Slice 3 settled it for the journal and the reason
 * carries here unchanged: a recipe's macros are the same clause-free SUM, and
 * a quantity meaning "2 slices" would make that sum wrong in a PLAUSIBLE way.
 * The unit follows the food and is never chosen — which is also the rule no
 * CHECK can carry, since SQLite cannot see across to the food's base_unit.
 *
 * A frozen line — its food deleted (D5/R3) — is editable in quantity like any
 * other and carries a quiet mark. It is NOT re-linkable here: picking a food
 * again is adding a new ingredient, and pretending otherwise would let a
 * capsule be silently replaced by a different food's values.
 */
export function IngredientEditor({
  ingredients,
  onChange,
  onAdd,
  /** Reference macros per 100 base units, keyed by draft index. */
  references,
}: {
  ingredients: IngredientDraft[];
  onChange: (ingredients: IngredientDraft[]) => void;
  onAdd: () => void;
  references: readonly (Macros | null)[];
}) {
  const theme = useTheme();

  function setQuantity(index: number, value: number | null): void {
    onChange(
      ingredients.map((ingredient, at) =>
        at === index ? { ...ingredient, quantity: value ?? 0 } : ingredient,
      ),
    );
  }

  function remove(index: number): void {
    onChange(ingredients.filter((_, at) => at !== index));
  }

  return (
    <FormSection caption="Ingrédients">
      {ingredients.length === 0 ? (
        <FormRow>
          <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
            Aucun ingrédient. Les macros de la recette se calculent depuis eux,
            donc une recette sans ingrédient ne peut pas être enregistrée.
          </Text>
        </FormRow>
      ) : null}

      {ingredients.map((ingredient, index) => {
        const reference = references[index] ?? null;
        const kcal =
          reference === null
            ? null
            : scaleMacros(reference, ingredient.quantity / 100).kcal;

        return (
          // The identity is the position, as in PortionEditor: these are rows
          // of a form written out in order, and the list is rebuilt whole on
          // every change.
          <FormRow key={index} label={ingredient.name}>
            {ingredient.frozen === null ? null : (
              <SymbolView
                name="link.badge.plus"
                size={14}
                tintColor={theme.colors.textFaint}
                accessibilityLabel="Aliment supprimé, valeurs figées"
              />
            )}

            {/*
              A DecimalInput: bound to a number through String() this field ate
              the separator, so "1,2" became 12 (core/ui/decimal-input).
            */}
            <DecimalInput
              value={ingredient.quantity === 0 ? null : ingredient.quantity}
              onChangeValue={(value) => setQuantity(index, value)}
              placeholder="0"
              selectTextOnFocus
              accessibilityLabel={`Quantité de ${ingredient.name}`}
            />
            <Text style={[styles.unit, { color: theme.colors.textMuted }]}>
              {ingredient.unit}
            </Text>

            {/*
              What this line contributes, not what the food is worth for 100.
              The same rule the basket follows: before a decision, the figure
              worth showing is the one about to be committed.
            */}
            <Text style={[styles.kcal, { color: theme.colors.textFaint }]}>
              {kcal === null ? '—' : `${formatKcal(kcal)} kcal`}
            </Text>

            <Pressable
              onPress={() => remove(index)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${ingredient.name}`}
            >
              <SymbolView name="minus.circle" size={20} tintColor={theme.colors.danger} />
            </Pressable>
          </FormRow>
        );
      })}

      <FormRow>
        <Pressable onPress={onAdd} accessibilityRole="button" style={styles.add}>
          <SymbolView name="plus.circle" size={18} tintColor={theme.colors.accent} />
          <Text style={[styles.addLabel, { color: theme.colors.accent }]}>
            Ajouter un ingrédient
          </Text>
        </Pressable>
      </FormRow>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18 },
  unit: { fontSize: 15, width: 22 },
  kcal: { fontSize: 12, minWidth: 58, textAlign: 'right' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addLabel: { fontSize: 16 },
});
