import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacro, formatQuantity, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { RecipeId } from '@/core/db/schema';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { LoadingDots } from '@/core/ui/loading-dots';
import { SwipeBack } from '@/core/ui/swipe-back';
import { useRecipe } from '../data/recipe-queries';
import type { RecipeView } from '../data/recipe-reads';
import {
  adjustLine,
  occurrenceLines,
  occurrenceTotal,
  usableLines,
  type OccurrenceLine,
} from '../domain/recipe-occurrence';
import { describeYield } from '../components/recipe-text';

/**
 * Logging a recipe: how much, then what exactly (specs 8.6).
 *
 * > 1. Quantité consommée, en portions ou en poids
 * > 2. Écran d'ajustement des ingrédients, éditable pour cette occurrence
 * >    uniquement
 * > 3. La recette enregistrée n'est jamais modifiée
 *
 * ## THE TWO STEPS STAY TWO, AND THE ORDER IS NOT COSMETIC
 *
 * One screen would be fewer taps, and the temptation is real: the lines
 * rescaling as the quantity is typed is the clearest possible statement of
 * what the quantity does. It is refused because the two edits are not
 * commutative. Adjusting a line and THEN changing the quantity would have to
 * rescale from the recipe again, silently discarding the adjustment — and the
 * user would have no way to see that it had gone.
 *
 * Settling the quantity first removes the case: going back to step one is an
 * explicit act, and re-deriving the lines is then what the user just asked
 * for. Specs 8.6 lists them in this order, and this is why.
 *
 * ## NOTHING IS WRITTEN HERE
 *
 * The occurrence lands in the basket and the basket is written at "Confirmer",
 * in one transaction (specs 8.4 v2.3). So a recipe scaled, adjusted and then
 * abandoned leaves nothing behind — the same guarantee that keeps ensureOffFood
 * private.
 */
export function RecipeOccurrenceScreen({
  recipeId,
  onCollect,
}: {
  recipeId: RecipeId;
  onCollect: (occurrence: {
    recipeId: RecipeId;
    name: string;
    yieldType: RecipeView['yield']['type'];
    consumed: number;
    lines: OccurrenceLine[];
  }) => void;
}) {
  const theme = useTheme();
  const recipe = useRecipe(recipeId);

  /**
   * The quantity as typed, before it is a number.
   *
   * Held as TEXT rather than a number, because a field being cleared to retype
   * it passes through the empty string — and turning that into 0 would make
   * consumedFraction throw on a keystroke. The number is parsed where it is
   * used and the step refuses to advance until it is positive.
   */
  const [typed, setTyped] = useState('');
  const [lines, setLines] = useState<OccurrenceLine[] | null>(null);

  const view = recipe.data ?? null;
  const consumed = parseDecimal(typed) ?? 0;
  const canAdvance = view !== null && consumed > 0;

  function toAdjustment(): void {
    if (view === null || consumed <= 0) return;
    setLines(occurrenceLines(view, consumed));
  }

  const total = useMemo(() => (lines === null ? null : occurrenceTotal(lines)), [lines]);

  if (view === null) {
    return (
      <View style={styles.loading}>
        <LoadingDots />
      </View>
    );
  }

  const quantityStep = (
    <FormNavigation>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <FormSection caption={view.name}>
          <FormRow label={view.yield.type === 'portions' ? 'Portions' : 'Quantité'}>
            <FormInput
              value={typed}
              onChangeText={setTyped}
              placeholder={view.yield.type === 'portions' ? '1' : '250'}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              accessibilityLabel="Quantité consommée"
            />
            {view.yield.type === 'weight' ? (
              <Text style={[styles.unit, { color: theme.colors.textMuted }]}>g</Text>
            ) : null}
          </FormRow>

          {/*
            What the whole recipe makes, stated beside what is being taken out
            of it — so "2" is read as a fraction of something rather than as a
            bare number.
          */}
          <FormRow label="La recette fait">
            <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
              {describeYield(view.yield)}
            </Text>
          </FormRow>
        </FormSection>

        <Pressable
          onPress={toAdjustment}
          disabled={!canAdvance}
          accessibilityRole="button"
          style={[
            styles.primary,
            {
              backgroundColor: canAdvance ? theme.colors.accent : theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <Text style={[styles.primaryLabel, { color: theme.colors.onAccent }]}>
            Ajuster les ingrédients
          </Text>
        </Pressable>
      </ScrollView>
    </FormNavigation>
  );

  if (lines === null) return quantityStep;

  const usable = usableLines(lines);

  const adjustmentStep = (
    <FormNavigation>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <FormSection caption="Pour cette fois seulement">
          {lines.map((line, index) => (
            // The identity is the position: these are a snapshot of the recipe
            // taken a moment ago, and they have no identifiers because nothing
            // may start referencing them.
            <FormRow key={index} label={line.name}>
              <FormInput
                value={
                  line.quantity === 0 ? '' : String(roundForEditing(line.quantity)).replace('.', ',')
                }
                onChangeText={(text) =>
                  setLines((current) =>
                    current === null
                      ? current
                      : adjustLine(current, index, parseDecimal(text) ?? 0),
                  )
                }
                placeholder="0"
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel={`Quantité de ${line.name} pour cette fois`}
              />
              <Text style={[styles.unit, { color: theme.colors.textMuted }]}>
                {line.baseUnit}
              </Text>
            </FormRow>
          ))}
        </FormSection>

        {/*
          A line set to zero leaves rather than being refused: taking an
          ingredient out for one occasion is exactly what this screen is for,
          and asking the user to delete the row instead would be a second way
          to say the same thing.
        */}
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          Mettre une quantité à zéro retire l’ingrédient de cette fois. La
          recette enregistrée ne change pas.
        </Text>

        <FormSection caption="Ce bloc">
          <FormRow label="Calories">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatKcal(total?.kcal ?? 0)} kcal
            </Text>
          </FormRow>
          <FormRow label="P · G · L">
            <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
              {formatMacro(total?.protein ?? 0)} · {formatMacro(total?.carbs ?? 0)} ·{' '}
              {formatMacro(total?.fat ?? 0)}
            </Text>
          </FormRow>
        </FormSection>

        <Pressable
          onPress={() =>
            onCollect({
              recipeId,
              name: view.name,
              yieldType: view.yield.type,
              consumed,
              lines: usable,
            })
          }
          disabled={usable.length === 0}
          accessibilityRole="button"
          style={[
            styles.primary,
            {
              backgroundColor:
                usable.length === 0 ? theme.colors.border : theme.colors.accent,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <SymbolView name="plus" size={16} tintColor={theme.colors.onAccent} />
          <Text style={[styles.primaryLabel, { color: theme.colors.onAccent }]}>
            Ajouter au panier
          </Text>
        </Pressable>
      </ScrollView>
    </FormNavigation>
  );

  return (
    // Keyed on the step, so the layer that arrives is never an instance whose
    // shared value survived the one that left — the defect SwipeBack records.
    <SwipeBack key="adjust" onBack={() => setLines(null)} behind={quantityStep}>
      {adjustmentStep}
    </SwipeBack>
  );
}

/**
 * A scaled quantity, at a precision anyone would type.
 *
 * Half of 187,5 g is 93,75 g, and a field opening on four decimals invites a
 * correction nobody wanted to make. Rounded for the FIELD only: what the user
 * does not touch keeps the exact figure, because the rounding happens on the
 * way to the string and never back into the line.
 */
function roundForEditing(value: number): number {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  loading: { paddingVertical: 48, alignItems: 'center' },
  unit: { fontSize: 15, width: 24 },
  figure: { fontSize: 16, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, lineHeight: 18 },
  primary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
});
