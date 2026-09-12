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
import { toCanonical } from '../domain/food-macros';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { MACRO_FIELDS, MacroFieldRow, type MacroKey } from '../components/macro-fields';
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
 * THE REFERENCE QUANTITY IS NO LONGER A FIELD. It was one, so that macros
 * could be typed "per 30 g" for a food whose label says so; the form now
 * offers 100 g or 100 ml and nothing else. What that costs is real and worth
 * stating: such a label has to be converted by hand before it can be entered.
 *
 * The column and the conversion both stay. display_ref_qty still exists, the
 * domain still converts through it on the way in, and it simply always carries
 * 100 — so the conversion is the identity, nothing needs migrating, and the
 * field can come back as a field. A food ENTERED against another reference is
 * brought back to 100 as it is loaded, or saving would read its figures as if
 * they had always been for 100.
 *
 * Nothing else in the application ever multiplies by it (D9).
 *
 * Holds no rule of its own: validateFoodDraft says what is wrong, and the
 * 10% kcal check (specs 5.1) is shown beside the field rather than gating the
 * button, because a non-blocking warning that blocks is not a warning.
 */
/** The only reference the form can express, since the toggle offers two units
 *  and no figure. The canonical form of the whole application (D9). */
const REFERENCE = 100;

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

    // A FOOD ENTERED AGAINST ANOTHER REFERENCE IS BROUGHT BACK TO 100 HERE.
    // The form can no longer express "per 30 g", so a draft still carrying 30
    // would have its figures read as being for 100 the moment it was saved --
    // silently multiplying them by more than three. Converting on the way in
    // keeps what was eaten true and makes the change invisible.
    setDraft(
      value.refQty === REFERENCE
        ? value
        : { ...value, refQty: REFERENCE, macros: toCanonical(value.macros, value.refQty) },
    );
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

      <FormNavigation>
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
            THE REFERENCE IS A CHOICE OF TWO, NOT A FIGURE TO TYPE.

            It was a free field, so that macros could be entered "per 30 g" the
            way a label sometimes states them. That was asked to go, and what
            is lost is worth writing down: a label stating its figures for
            anything other than 100 now has to be converted by hand.

            What is NOT lost is the column behind it. display_ref_qty stays in
            the schema and the domain still converts through it — it simply
            always carries 100 now, so the conversion is the identity. Nothing
            has to be migrated, and the free field can come back as a field.

            Watertight, as ever: no conversion, no density (specs 5.1).
            Choosing ml converts nothing; it says what these figures count.
          */}
          <FormSection caption="Macros">
            <FormRow label="Valeur pour">
              <UnitToggle
                unit={draft.baseUnit}
                prefix="100"
                onChange={(baseUnit) => setDraft((current) => ({ ...current, baseUnit }))}
              />
            </FormRow>

            {MACRO_FIELDS.map((field) => (
              <MacroFieldRow
                key={field.key}
                field={field}
                value={show(draft.macros[field.key])}
                onChange={setMacro}
              />
            ))}

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
      </FormNavigation>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  // Beside the figure it counts, in the row's own trailing group.
  warning: { fontSize: 13, lineHeight: 18 },
  problems: { gap: 4 },
  problem: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
