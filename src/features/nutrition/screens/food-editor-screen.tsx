import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodId } from '@/core/db/schema';
import {
  useCreateFood,
  useDeleteFood,
  useFoodDraft,
  useSetFoodFavorite,
  useUpdateFood,
} from '../data/food-queries';
import {
  emptyFoodDraft,
  isValidFoodDraft,
  validateFoodDraft,
  type FoodDraft,
} from '../domain/food-draft';
import { hasKcalWarning, theoreticalKcal } from '../domain/macros';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { MacroFields, type MacroKey } from '../components/macro-fields';
import { UnitToggle } from '../components/unit-toggle';
import { PortionEditor } from '../components/portion-editor';
import { foodProblemText } from '../components/food-problem-text';

/**
 * Creating and editing a food (specs 8.5).
 *
 * The same screen does both, because editing a food is editing the same
 * fields — specs 5.3 puts no time limit on it, and past journal entries are
 * untouched either way, having frozen their own reference (D5/R1).
 *
 * THE REFERENCE QUANTITY IS A FIELD HERE AND NOWHERE ELSE. Macros are typed
 * against it — "per 30 g" for a food whose label says so — and the domain
 * converts once, to the canonical form for 100 base units, on the way to the
 * database. Nothing else in the application ever multiplies by it (D9).
 *
 * Holds no rule of its own: validateFoodDraft says what is wrong, and the
 * 10% kcal check (specs 5.1) is shown beside the field rather than gating the
 * button, because a non-blocking warning that blocks is not a warning.
 */
/** A stored number, written the way the fields accept it back. */
function show(value: number): string {
  return value === 0 ? '' : String(value).replace('.', ',');
}

export function FoodEditorScreen({ foodId }: { foodId: FoodId | null }) {
  const theme = useTheme();
  const router = useRouter();

  const [draft, setDraft] = useState<FoodDraft>(emptyFoodDraft);
  const [loaded, setLoaded] = useState(false);

  const stored = useFoodDraft(foodId);
  const create = useCreateFood();
  const update = useUpdateFood();
  const remove = useDeleteFood();
  const favorite = useSetFoodFavorite();

  /**
   * THE FAVOURITE IS NOT PART OF THE FORM, once the food exists.
   *
   * It was, and it was wrong twice over. It acted only on save, so a flag
   * everywhere else flipped by one tap needed a form filled in and submitted
   * here. And it was seeded into local state the first time the query
   * answered, so a food marked from the library list opened showing the OLD
   * star -- the cached answer -- and only told the truth on a second visit,
   * once the background refetch had landed in a cache nobody was reading.
   *
   * Read straight from the query and written straight to the row, it cannot
   * lag: there is no copy left to go stale.
   *
   * A food being CREATED is the exception, and has to be: there is no row yet
   * to flip, so its star is a wish the draft carries until creation writes it.
   */
  const starred =
    foodId === null ? draft.isFavorite : (stored.data?.isFavorite ?? false);

  function toggleStar(): void {
    if (foodId === null) {
      setDraft((current) => ({ ...current, isFavorite: !current.isFavorite }));
      return;
    }
    favorite.mutate({ foodId, isFavorite: !starred });
  }


  useEffect(() => {
    // Filled once, when the food arrives. Reapplying it on every render would
    // overwrite what is being typed.
    const value = stored.data;
    if (loaded || foodId === null || value === null || value === undefined) return;
    setDraft(value);
    setLoaded(true);
  }, [stored.data, loaded, foodId]);

  const problems = validateFoodDraft(draft);
  const valid = isValidFoodDraft(draft);
  const theoretical = theoreticalKcal(draft.macros);
  const warn = hasKcalWarning(draft.macros);

  // Navigation waits for the write rather than racing it, as the free-entry
  // screen does: the write is synchronous, but "probably fine" is the wrong
  // standard for the gesture this slice exists to make reliable.
  const close = { onSuccess: () => router.back() };

  function save(): void {
    if (!valid) return;
    if (foodId === null) {
      create.mutate(draft, close);
    } else {
      update.mutate({ foodId, draft }, close);
    }
  }

  function confirmDelete(): void {
    if (foodId === null) return;
    // Never blocked (specs 5.3), and nothing is lost but the food itself: past
    // entries froze everything they need. The confirmation is here because a
    // tap is easy to make by accident, not because the application hesitates.
    Alert.alert(
      `Supprimer « ${draft.name} » ?`,
      'Les entrées déjà enregistrées au journal ne changent pas.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => remove.mutate(foodId, close),
        },
      ],
    );
  }

  function setMacro(key: MacroKey, text: string): void {
    setDraft((current) => ({
      ...current,
      macros: { ...current.macros, [key]: parseDecimal(text) ?? 0 },
    }));
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: foodId === null ? 'Nouvel aliment' : 'Modifier l’aliment',
          // The same control as the one in the library list, in the same
          // material: one gesture for one meaning, wherever a food is looked
          // at. It acts at once — nothing here waits for "Enregistrer".
          // A BARE PRESSABLE, NOT A GLASS BUTTON. On iOS 26 the native header
          // already puts its own material behind whatever it is given, so a
          // glass button here is glass inside glass -- which is exactly what
          // it looked like. The chrome belongs to the system; what goes in it
          // is configured, not painted. The list's star IS a glass button
          // because a list row is content, and content gets no material free.
          headerRight: () => (
            <Pressable
              onPress={toggleStar}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ selected: starred }}
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

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <FormSection caption="Aliment">
            <FormRow label="Nom">
              <FormInput
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="Pain de mie"
                autoFocus={foodId === null}
              />
            </FormRow>

            <FormRow label="Marque">
              <FormInput
                value={draft.brand ?? ''}
                onChangeText={(brand) => setDraft((current) => ({ ...current, brand }))}
                placeholder="Facultatif"
              />
            </FormRow>
          </FormSection>

          {/*
            THE QUANTITY AND ITS UNIT ARE ONE ANSWER: "per 30 g" is what a
            label says, and it was once asked as two questions in two cards.
            The unit is not a property of the food that lives elsewhere -- it
            is what the number beside it means.

            Watertight all the same: no conversion, no density (specs 5.1).
            Tapping ml converts nothing; it says what these figures count.
          */}
          <FormSection caption="Macros pour cette quantité">
            <FormRow label="Pour">
              <View style={styles.quantityRow}>
                <FormInput
                  value={draft.refQty === 0 ? '' : String(draft.refQty).replace('.', ',')}
                  onChangeText={(text) =>
                    setDraft((current) => ({ ...current, refQty: parseDecimal(text) ?? 0 }))
                  }
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel="Quantité de référence"
                />
                <UnitToggle
                  unit={draft.baseUnit}
                  onChange={(baseUnit) => setDraft((current) => ({ ...current, baseUnit }))}
                />
              </View>
            </FormRow>

            <FormRow>
              <MacroFields
                values={{
                  protein: show(draft.macros.protein),
                  carbs: show(draft.macros.carbs),
                  fat: show(draft.macros.fat),
                  kcal: show(draft.macros.kcal),
                }}
                onChange={setMacro}
              />
            </FormRow>

            {warn ? (
              <FormRow>
                <Text style={[styles.warning, { color: theme.colors.warning }]}>
                  Les macros saisies donnent {formatKcal(theoretical)} kcal, soit plus
                  de 10 % d’écart. La valeur saisie est conservée telle quelle.
                </Text>
              </FormRow>
            ) : null}
          </FormSection>

          <PortionEditor
            portions={draft.portions}
            baseUnit={draft.baseUnit}
            onChange={(portions) => setDraft((current) => ({ ...current, portions }))}
          />

          {problems.length === 0 ? null : (
            <View style={styles.problems}>
              {problems.map((problem, index) => (
                <Text
                  key={`${problem.code}-${index}`}
                  style={[styles.problem, { color: theme.colors.danger }]}
                >
                  {foodProblemText(problem, draft)}
                </Text>
              ))}
            </View>
          )}

          <Pressable
            onPress={save}
            disabled={!valid}
            accessibilityRole="button"
            style={[
              styles.save,
              { backgroundColor: valid ? theme.colors.accent : theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.saveLabel,
                { color: valid ? theme.colors.onAccent : theme.colors.textFaint },
              ]}
            >
              {foodId === null ? 'Créer' : 'Enregistrer'}
            </Text>
          </Pressable>

          {foodId === null ? null : (
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.delete}>
              <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>
                Supprimer
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  // The number takes the room; the unit takes what it needs.
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warning: { fontSize: 13, lineHeight: 18 },
  problems: { gap: 4 },
  problem: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
