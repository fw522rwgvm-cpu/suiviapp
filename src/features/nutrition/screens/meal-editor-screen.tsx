import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useAddMeal, useDay, useUpdateMealTargets } from '../data/day-queries';
import { MACRO_FIELDS } from '../components/macro-fields';
import { availableKinds, canUseKind, isMealKind, type MealKind } from '../domain/meal-kinds';
import {
  emptyTemplateMealDraft,
  readDraftTargets,
  type TemplateMealDraft,
} from '../domain/template-draft';

/**
 * Creating a meal on a day, or changing the targets of one (specs 8.3).
 *
 * > Adding, renaming and deleting meals is free, without impact on the source
 * > template, with the targets recalculated.
 *
 * A modal rather than a pushed screen, by the rule the whole application
 * follows: browsing is a push, adding is a modal. Correcting a meal's goals is
 * done ON the day, which stays visible behind the panel.
 *
 * ## THE NAME IS A CHOICE BETWEEN FOUR, ON A REAL UIPickerView
 *
 * `Picker` on iOS IS a UIPickerView — the same native control the quantity
 * screen turns, already in section 5 and already in the installed binary, so
 * it costs no rebuild. It sits inline and shows every choice at once, which an
 * action sheet does not: a sheet is a decision you take and dismiss, a picker
 * is a value the form holds and you can change your mind about while the four
 * target fields are still in front of you.
 *
 * The list is short precisely because a day may hold only one breakfast, one
 * lunch and one dinner. Offering a kind the day already has and then refusing
 * it at the write would be asking a question whose answer is already known.
 *
 * Editing an EXISTING meal does not offer the kind at all. Changing what a
 * meal is, once it holds entries, is a different act from setting its goals,
 * and the journal already has it under a long press.
 *
 * ## THE FOUR TARGETS GO TOGETHER OR NOT AT ALL
 *
 * Four empty fields mean no goal, which is legitimate — specs 8.1 gives
 * targets to meals, it does not require them — and the meal then keeps its
 * icon and loses its ring. Three figures out of four is refused: a partial set
 * would be a target nobody could read.
 */
export function MealEditorScreen({
  date,
  mealPosition,
}: {
  date: LocalDate;
  /** Null to create. A position to edit the targets of an existing meal. */
  mealPosition: number | null;
}) {
  const theme = useTheme();
  const dismiss = useDismiss();

  const day = useDay(date);
  const addMeal = useAddMeal();
  const updateTargets = useUpdateMealTargets();

  const meals = day.data?.meals ?? [];
  const existing = mealPosition === null
    ? undefined
    : meals.find((meal) => meal.position === mealPosition);

  const offered = availableKinds(meals.map((meal) => meal.name));
  const [kind, setKind] = useState<MealKind | null>(null);
  const [draft, setDraft] = useState<TemplateMealDraft>(() => emptyTemplateMealDraft());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Seeded once. After this the fields are the truth on screen, and
    // re-seeding them from the query would undo what is being typed the moment
    // the change bus refetched for any reason at all.
    if (loaded) return;

    if (mealPosition === null) {
      if (offered.length === 0) return;
      setKind(offered[0] ?? null);
      setLoaded(true);
      return;
    }

    if (existing === undefined) return;
    setKind(isMealKind(existing.name) ? existing.name : null);
    setDraft({
      name: existing.name,
      protein: fieldOf(existing.targets?.protein),
      carbs: fieldOf(existing.targets?.carbs),
      fat: fieldOf(existing.targets?.fat),
      kcal: fieldOf(existing.targets?.kcal),
    });
    setLoaded(true);
  }, [existing, loaded, mealPosition, offered]);

  usePanelHeading(
    mealPosition === null ? 'Nouveau repas' : 'Objectifs du repas',
    mealPosition === null ? null : (existing?.label ?? null),
  );

  const targets = readDraftTargets(draft);
  // undefined is "partly filled", which is the one state that cannot be saved.
  const partial = targets === undefined;
  const canSave = !partial && (mealPosition !== null || kind !== null);

  function save(): void {
    if (!canSave || targets === undefined) return;

    if (mealPosition === null) {
      if (kind === null) return;
      addMeal.mutate({ date, name: kind, targets }, { onSuccess: dismiss });
      return;
    }

    updateTargets.mutate({ date, mealPosition, targets }, { onSuccess: dismiss });
  }

  if (mealPosition === null && offered.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          Cette journée a déjà un petit-déjeuner, un déjeuner et un dîner. Seules les
          collations peuvent être ajoutées plusieurs fois, et il n’en reste aucune à
          proposer.
        </Text>
      </View>
    );
  }

  return (
    <FormNavigation>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {mealPosition === null ? (
          <FormSection caption="Repas">
            {/*
              The row gives up its side padding: a UIPickerView CUTS a label
              that does not fit rather than shrinking it, and the row's own
              insets are what would make it cut. The same reason the quantity
              wheels are flush.
            */}
            <FormRow flush>
              <Picker
                selectedValue={kind ?? offered[0]}
                onValueChange={(value) => setKind(value)}
                itemStyle={{ color: theme.colors.text, fontSize: 20 }}
                style={styles.picker}
              >
                {offered.map((option) => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </FormRow>

          </FormSection>
        ) : null}

        <FormSection caption="Objectifs du repas">
          {MACRO_FIELDS.map((field) => (
            <FormRow key={field.key} label={field.label}>
              <FormInput
                value={draft[field.key]}
                onChangeText={(text) =>
                  setDraft((current) => ({ ...current, [field.key]: text }))
                }
                placeholder="—"
                keyboardType="decimal-pad"
              />
              <Text style={[styles.unit, { color: theme.colors.textMuted }]}>{field.unit}</Text>
            </FormRow>
          ))}
        </FormSection>

        <Text style={[styles.note, { color: theme.colors.textFaint }]}>
          {partial
            ? 'Les quatre objectifs vont ensemble : remplissez-les tous, ou aucun.'
            : 'Laissez les quatre champs vides pour un repas sans objectif. Modifier ce repas ne change pas le modèle dont la journée vient.'}
        </Text>

        {/*
          The same painted button free entry uses, not a glass one: it sits in
          the flow of a form rather than on the panel's chrome, and glass costs
          contrast on a control whose state has to be obvious.
        */}
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          style={[
            styles.save,
            { backgroundColor: canSave ? theme.colors.accent : theme.colors.border },
          ]}
        >
          <Text
            style={[
              styles.saveLabel,
              { color: canSave ? theme.colors.onAccent : theme.colors.textFaint },
            ]}
          >
            {mealPosition === null ? 'Ajouter le repas' : 'Enregistrer'}
          </Text>
        </Pressable>
      </ScrollView>
    </FormNavigation>
  );
}

/** Empty fields for a meal with no goal — zero is a target, absence is not. */
function fieldOf(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  // A single column, so it needs far less height than the quantity's three.
  picker: { flex: 1, height: 150 },
  unit: { fontSize: 15 },
  note: { fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
  save: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
});
