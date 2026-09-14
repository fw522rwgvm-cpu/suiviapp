import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacro, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { RecipeId } from '@/core/db/schema';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useRecipeOccurrencePrefill } from '../data/recipe-queries';
import type { RecipeView } from '../data/recipe-reads';
import {
  adjustLine,
  occurrenceLines,
  occurrenceTotal,
  rescaleLines,
  usableLines,
  type OccurrenceLine,
} from '../domain/recipe-occurrence';
import { describeYield } from '../components/recipe-text';

export interface CollectedOccurrence {
  recipeId: RecipeId;
  name: string;
  yieldType: RecipeView['yield']['type'];
  consumed: number;
  lines: OccurrenceLine[];
}

/**
 * Logging a recipe: how much, and what exactly — on ONE screen (specs 8.6).
 *
 * > 1. Quantité consommée, en portions ou en poids
 * > 2. Écran d'ajustement des ingrédients, éditable pour cette occurrence
 * >    uniquement
 * > 3. La recette enregistrée n'est jamais modifiée
 *
 * ## THE TWO STEPS WERE TWO, AND THE OBJECTION TO MERGING THEM IS GONE
 *
 * They were separate screens because the two edits do not commute: adjusting a
 * line and then changing the quantity would have to re-derive from the recipe,
 * silently discarding the adjustment.
 *
 * Merged on request, and the objection dies rather than being accepted:
 * changing the quantity now SCALES the lines instead of re-deriving them. An
 * adjustment is kept as a ratio — halve the cream at two portions, move to
 * four, and it is still half — and on the ordinary path, where nothing has
 * been adjusted yet, scaling and re-deriving are arithmetically identical (see
 * rescaleLines).
 *
 * What that buys is the thing the split cost: the lines re-scale under the
 * finger as the quantity is typed, which is the clearest possible statement of
 * what the quantity does.
 *
 * ## THE QUANTITY EXISTS BEFORE THE LINES DO, AND THAT IS STRUCTURAL
 *
 * Slice 4 paid for this on the device: the quantity wheels mounted on a
 * default and an effect moved them when the query answered, and AN EFFECT RUNS
 * AFTER ITS RENDER HAS BEEN PAINTED — so they visibly turned as they opened.
 * No arrangement of effects can fix it; the value has to be there first.
 *
 * So the screen is split in two components, and only the BODY waits. It
 * initialises its state from props, in the initialiser, never in an effect.
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
  onCollect: (occurrence: CollectedOccurrence) => void;
}) {
  const prefill = useRecipeOccurrencePrefill(recipeId);
  const data = prefill.data ?? null;

  if (data === null) {
    return (
      <View style={styles.loading}>
        <LoadingDots />
      </View>
    );
  }

  return (
    <OccurrenceBody
      recipe={data.recipe}
      initialConsumed={data.consumed}
      onCollect={onCollect}
    />
  );
}

/**
 * The form, mounted only once its opening quantity is known.
 *
 * Everything below initialises from props in a state initialiser. Nothing here
 * reads a query, so nothing here can arrive late.
 */
function OccurrenceBody({
  recipe,
  initialConsumed,
  onCollect,
}: {
  recipe: RecipeView;
  /** The last amount logged, or a default. Never null, never zero. */
  initialConsumed: number;
  onCollect: (occurrence: CollectedOccurrence) => void;
}) {
  const theme = useTheme();

  /**
   * The quantity as TYPED, before it is a number.
   *
   * Held as text because a field being cleared to retype it passes through the
   * empty string, and turning that into 0 would make consumedFraction throw on
   * a keystroke. The number is parsed where it is used.
   */
  const [typed, setTyped] = useState(() => show(initialConsumed));
  /** What the lines were last derived or scaled at. Never zero. */
  const [scaledAt, setScaledAt] = useState(initialConsumed);
  const [lines, setLines] = useState<OccurrenceLine[]>(() =>
    occurrenceLines(recipe, initialConsumed),
  );

  const consumed = parseDecimal(typed) ?? 0;
  const usable = usableLines(lines);
  const total = occurrenceTotal(lines);
  const canAdd = consumed > 0 && usable.length > 0;

  /**
   * The lines follow the quantity, at the blur rather than at each keystroke.
   *
   * Applying it live would rescale on "1", then "13", then "137" — three
   * passes over the list, two of them at amounts nobody meant, on a form whose
   * figures are being read while they move. The same ruling slice 4 made for
   * the quantity wheels, and for the same reason.
   */
  function applyQuantity(): void {
    if (consumed <= 0 || consumed === scaledAt) return;

    // Scaled when there is something to scale from, re-derived otherwise —
    // rescaleLines says why the two agree whenever nothing has been adjusted.
    const scaled = rescaleLines(lines, scaledAt, consumed);
    setLines(scaled ?? occurrenceLines(recipe, consumed));
    setScaledAt(consumed);
  }

  const portions = recipe.yield.type === 'portions';

  return (
    <FormNavigation>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <FormSection caption={recipe.name}>
          <FormRow label={portions ? 'Portions' : 'Quantité'}>
            <FormInput
              value={typed}
              onChangeText={setTyped}
              onBlur={applyQuantity}
              onSubmitEditing={applyQuantity}
              placeholder={portions ? '1' : '100'}
              keyboardType="decimal-pad"
              /*
                autoFocus + selectTextOnFocus WORK HERE, where slice 3 found
                they did not: the value comes from a state initialiser and
                exists BEFORE the field, so this is the case where the pair
                behaves — focusing a field that is already filled.
              */
              autoFocus
              selectTextOnFocus
              accessibilityLabel="Quantité consommée"
            />
            <Text style={[styles.unit, { color: theme.colors.textMuted }]}>
              {portions ? '' : 'g'}
            </Text>
          </FormRow>

          {/*
            What the whole recipe makes, beside what is being taken out of it —
            so "2" is read as a fraction of something rather than as a bare
            number.
          */}
          <FormRow label="La recette fait">
            <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
              {describeYield(recipe.yield)}
            </Text>
          </FormRow>
        </FormSection>

        <FormSection caption="Pour cette fois seulement">
          {lines.map((line, index) => (
            // The identity is the position: these are a snapshot of the recipe
            // taken a moment ago, and they have no identifiers because nothing
            // may start referencing them.
            <FormRow key={index} label={line.name}>
              <FormInput
                value={line.quantity === 0 ? '' : show(roundForEditing(line.quantity))}
                onChangeText={(text) =>
                  setLines((current) => adjustLine(current, index, parseDecimal(text) ?? 0))
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

        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          Mettre une quantité à zéro retire l’ingrédient de cette fois. La
          recette enregistrée ne change pas.
        </Text>

        <FormSection caption="Ce bloc">
          <FormRow label="Calories">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatKcal(total.kcal)} kcal
            </Text>
          </FormRow>
          <FormRow label="P · G · L">
            <Text style={[styles.figure, { color: theme.colors.textMuted }]}>
              {formatMacro(total.protein)} · {formatMacro(total.carbs)} ·{' '}
              {formatMacro(total.fat)}
            </Text>
          </FormRow>
        </FormSection>

        <Pressable
          onPress={() =>
            onCollect({
              recipeId: recipe.id,
              name: recipe.name,
              yieldType: recipe.yield.type,
              consumed,
              lines: usable,
            })
          }
          disabled={!canAdd}
          accessibilityRole="button"
          style={[
            styles.primary,
            {
              backgroundColor: canAdd ? theme.colors.accent : theme.colors.border,
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
}

/** A number, written the way the fields accept it back. */
function show(value: number): string {
  return String(value).replace('.', ',');
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
