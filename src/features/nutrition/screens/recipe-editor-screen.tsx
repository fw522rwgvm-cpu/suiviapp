import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacro, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodId, RecipeId } from '@/core/db/schema';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeBack } from '@/core/ui/swipe-back';
import { useFoods } from '../data/food-queries';
import {
  useCreateRecipe,
  useDeleteRecipe,
  useRecipeDraft,
  useSetRecipeFavorite,
  useUpdateRecipe,
} from '../data/recipe-queries';
import { searchFoods } from '../domain/food-search';
import {
  emptyRecipeDraft,
  isValidRecipeDraft,
  validateRecipeDraft,
  type IngredientDraft,
  type RecipeDraft,
} from '../domain/recipe-draft';
import { macrosPerYieldUnit, recipeTotal } from '../domain/recipe-macros';
import { ZERO_MACROS, type Macros } from '../domain/macros';
import { FoodRow } from '../components/food-row';
import { IngredientEditor } from '../components/ingredient-editor';
import { recipeProblemText } from '../components/recipe-problem-text';
import { SearchField } from '../components/search-field';
import { StepEditor, TagEditor } from '../components/step-editor';
import { describeYieldUnit } from '../components/recipe-text';
import { YieldToggle } from '../components/yield-toggle';

/**
 * Creating and correcting a recipe (specs 8.6).
 *
 * > Nom, tags, étapes, durée, ingrédients. Macros calculées depuis les
 * > ingrédients.
 *
 * Holds no rule of its own: validateRecipeDraft says what is wrong, and the
 * total is computed by the domain from the ingredients on screen. No
 * calculation in a component (D9).
 *
 * ## PICKING A FOOD IS A STEP, NOT A ROUTE
 *
 * The same arbitration the add window made for its quantity step: D16 budgets
 * tenths of a second between choosing and seeing, and swapping the content of
 * a screen already mounted costs one render where pushing a route costs an
 * animation and a dismissal on the way back. SwipeBack gives it the back
 * gesture a pushed route would have come with.
 *
 * The picker searches the SAME cached list the library searches, through the
 * same pure function — so there is no second definition of what "matching"
 * means (specs 8.4b, D16).
 */
export function RecipeEditorScreen({ recipeId }: { recipeId: RecipeId | null }) {
  const theme = useTheme();
  const router = useRouter();

  const [draft, setDraft] = useState<RecipeDraft>(() => emptyRecipeDraft());
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [term, setTerm] = useState('');

  const stored = useRecipeDraft(recipeId);
  const foods = useFoods();
  const create = useCreateRecipe();
  const update = useUpdateRecipe();
  const remove = useDeleteRecipe();
  const favorite = useSetRecipeFavorite();

  useEffect(() => {
    // Filled once, when the recipe arrives. Reapplying it on every render
    // would overwrite what is being typed.
    const value = stored.data;
    if (loaded || recipeId === null || value === null || value === undefined) return;
    setDraft(value);
    setLoaded(true);
  }, [stored.data, loaded, recipeId]);

  /**
   * THE FAVOURITE IS NOT PART OF THE FORM, once the recipe exists — the rule
   * the food editor already follows, for the same two reasons: the star acts
   * immediately everywhere else, and a copy seeded into local state shows the
   * cached answer rather than the true one.
   */
  const starred = recipeId === null ? draft.isFavorite : (stored.data?.isFavorite ?? false);

  function toggleStar(): void {
    if (recipeId === null) {
      setDraft((current) => ({ ...current, isFavorite: !current.isFavorite }));
      return;
    }
    favorite.mutate({ recipeId, isFavorite: !starred });
  }

  /**
   * The reference macros of each ingredient, looked up in the cached food list
   * or taken from the frozen capsule.
   *
   * The editor is the one place the ingredient lines are not yet rows, so the
   * live-or-frozen rule cannot come from recipe-reads. It is stated here once
   * and handed down, rather than each row asking.
   */
  const references = useMemo<(Macros | null)[]>(() => {
    const byId = new Map((foods.data ?? []).map((food) => [food.id, food.reference]));
    return draft.ingredients.map((ingredient) =>
      ingredient.foodId === null
        ? (ingredient.frozen?.reference ?? null)
        : (byId.get(ingredient.foodId) ?? ingredient.frozen?.reference ?? null),
    );
  }, [draft.ingredients, foods.data]);

  /** The whole recipe, from what is on screen. Derived, never stored (D9). */
  const total = useMemo(
    () =>
      recipeTotal(
        draft.ingredients.flatMap((ingredient, index) => {
          const reference = references[index];
          if (reference === null || reference === undefined) return [];
          return [
            {
              name: ingredient.name,
              frozen: ingredient.frozen !== null,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              reference,
              total: {
                protein: (reference.protein * ingredient.quantity) / 100,
                carbs: (reference.carbs * ingredient.quantity) / 100,
                fat: (reference.fat * ingredient.quantity) / 100,
                kcal: (reference.kcal * ingredient.quantity) / 100,
              },
            },
          ];
        }),
      ),
    [draft.ingredients, references],
  );

  // Guarded, because the yield can legitimately be zero WHILE BEING TYPED —
  // the field is empty for a keystroke — and macrosPerYieldUnit throws on it.
  const perUnit =
    draft.yieldValue > 0
      ? macrosPerYieldUnit(total, { type: draft.yieldType, value: draft.yieldValue })
      : ZERO_MACROS;

  const problems = validateRecipeDraft(draft);
  const canSave = isValidRecipeDraft(draft);

  function close(): void {
    router.back();
  }

  function save(): void {
    if (!canSave) return;
    if (recipeId === null) {
      create.mutate(draft, { onSuccess: close });
    } else {
      update.mutate({ recipeId, draft }, { onSuccess: close });
    }
  }

  function confirmDelete(): void {
    if (recipeId === null) return;
    // Never blocked (specs 5.3). Unlike a food, a recipe needs no freeze: a
    // grouped block in the journal carries its macros on its children, each of
    // which froze a food's reference when it was logged.
    Alert.alert(`Supprimer « ${draft.name} » ?`, 'Les entrées déjà enregistrées au journal ne changent pas.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => remove.mutate(recipeId, { onSuccess: close }),
      },
    ]);
  }

  function addIngredient(foodId: FoodId, name: string, unit: 'g' | 'ml'): void {
    const line: IngredientDraft = {
      id: null,
      foodId,
      name,
      // A hundred base units, the canonical quantity of the whole schema. The
      // row opens on it and it is retyped in place; guessing anything cleverer
      // would be a second pre-fill chain with nothing behind it.
      quantity: 100,
      unit,
      frozen: null,
    };
    setDraft((current) => ({ ...current, ingredients: [...current.ingredients, line] }));
    setPicking(false);
    setTerm('');
  }

  const picker = (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <SearchField value={term} onChange={setTerm} />

      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
          theme.shadow,
        ]}
      >
        {searchFoods(foods.data ?? [], term).map((food, index) => (
          <View key={food.id}>
            {index === 0 ? null : <ListSeparator />}
            <FoodRow
              food={food}
              kcal={`${formatKcal(food.reference.kcal)} kcal`}
              onPress={() => addIngredient(food.id, food.name, food.baseUnit)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const form = (
    <FormNavigation>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <FormSection>
          <FormRow label="Nom">
            <FormInput
              value={draft.name}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder="Curry de pois chiches"
              autoFocus={recipeId === null}
              accessibilityLabel="Nom de la recette"
            />
          </FormRow>

          <FormRow label="Préparation">
            <FormInput
              value={draft.prepMinutes === null ? '' : String(draft.prepMinutes)}
              onChangeText={(text) =>
                setDraft((current) => ({ ...current, prepMinutes: parseDecimal(text) }))
              }
              placeholder="—"
              keyboardType="number-pad"
              selectTextOnFocus
              accessibilityLabel="Temps de préparation en minutes"
            />
            <Text style={[styles.unit, { color: theme.colors.textMuted }]}>min</Text>
          </FormRow>
        </FormSection>

        <FormSection caption="Rendement">
          <FormRow>
            <YieldToggle
              yieldType={draft.yieldType}
              onChange={(yieldType) => setDraft((current) => ({ ...current, yieldType }))}
            />
          </FormRow>

          <FormRow label={draft.yieldType === 'portions' ? 'Portions' : 'Poids fini'}>
            <FormInput
              value={draft.yieldValue === 0 ? '' : String(draft.yieldValue).replace('.', ',')}
              onChangeText={(text) =>
                setDraft((current) => ({ ...current, yieldValue: parseDecimal(text) ?? 0 }))
              }
              placeholder="4"
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel={
                draft.yieldType === 'portions' ? 'Nombre de portions' : 'Poids fini en grammes'
              }
            />
            {draft.yieldType === 'weight' ? (
              // Always grams. A recipe mixes both base units by nature, so
              // there is no unit its yield could be derived in — a finished
              // dish is weighed.
              <Text style={[styles.unit, { color: theme.colors.textMuted }]}>g</Text>
            ) : null}
          </FormRow>
        </FormSection>

        <IngredientEditor
          ingredients={draft.ingredients}
          references={references}
          onChange={(ingredients) => setDraft((current) => ({ ...current, ingredients }))}
          onAdd={() => setPicking(true)}
        />

        {/*
          The computed figures, right under the ingredients that produce them.
          Specs 8.6: "macros toujours calculées". Nothing here is stored, and
          the caption says what the numbers are stated against — the same
          denominator the library row shows.
        */}
        <FormSection caption={`Macros ${describeYieldUnit({ type: draft.yieldType, value: draft.yieldValue })}`}>
          <FormRow label="Calories">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatKcal(perUnit.kcal)} kcal
            </Text>
          </FormRow>
          <FormRow label="Protéines">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatMacro(perUnit.protein)} g
            </Text>
          </FormRow>
          <FormRow label="Glucides">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatMacro(perUnit.carbs)} g
            </Text>
          </FormRow>
          <FormRow label="Lipides">
            <Text style={[styles.figure, { color: theme.colors.text }]}>
              {formatMacro(perUnit.fat)} g
            </Text>
          </FormRow>
        </FormSection>

        <StepEditor
          steps={draft.steps}
          onChange={(steps) => setDraft((current) => ({ ...current, steps }))}
        />

        <TagEditor
          tags={draft.tags}
          onChange={(tags) => setDraft((current) => ({ ...current, tags }))}
        />

        {problems.length === 0 ? null : (
          <View style={styles.problems}>
            {problems.map((problem, index) => (
              <Text
                key={`${problem.code}-${index}`}
                style={[styles.problem, { color: theme.colors.danger }]}
              >
                {recipeProblemText(problem, draft)}
              </Text>
            ))}
          </View>
        )}

        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          style={[
            styles.save,
            {
              backgroundColor: canSave ? theme.colors.accent : theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <Text style={styles.saveLabel}>
            {recipeId === null ? 'Créer' : 'Enregistrer'}
          </Text>
        </Pressable>

        {recipeId === null ? null : (
          <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.delete}>
            <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>Supprimer</Text>
          </Pressable>
        )}
      </ScrollView>
    </FormNavigation>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: recipeId === null ? 'Nouvelle recette' : 'Modifier la recette',
          headerRight: () => (
            // A bare Pressable with its symbol: NEVER a GlassButton in a native
            // header, where UIKit already puts its own material behind what it
            // is given — glass in glass, which reads as a button in a button.
            <Pressable
              onPress={toggleStar}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={starred ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <SymbolView
                name={starred ? 'star.fill' : 'star'}
                size={19}
                tintColor={starred ? theme.colors.accent : theme.colors.textMuted}
              />
            </Pressable>
          ),
        }}
      />

      {picking ? (
        // Keyed on the step, so the layer that arrives is never an instance
        // whose shared value survived from the one that left — the defect
        // SwipeBack's own note records.
        <SwipeBack key="picker" onBack={() => setPicking(false)} behind={form}>
          {picker}
        </SwipeBack>
      ) : (
        form
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  unit: { fontSize: 15, width: 28 },
  figure: { fontSize: 16, fontVariant: ['tabular-nums'] },
  problems: { gap: 6 },
  problem: { fontSize: 14, lineHeight: 19 },
  save: { paddingVertical: 14, alignItems: 'center' },
  // White on the filled accent, the single compromise applied everywhere.
  saveLabel: { fontSize: 17, fontWeight: '600', color: '#ffffff' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
