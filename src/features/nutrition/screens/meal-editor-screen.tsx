import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { useAddMeal, useDay, useUpdateMeal } from '../data/day-queries';
import { MACRO_FIELDS } from '../components/macro-fields';
import { mealColor, mealSymbol } from '../components/meal-symbol';
import { canUseKind, isMealKind, MEAL_KINDS, type MealKind } from '../domain/meal-kinds';
import {
  emptyTemplateMealDraft,
  readDraftTargets,
  type TemplateMealDraft,
} from '../domain/template-draft';

/**
 * Creating a meal on a day, or changing one (specs 8.3).
 *
 * > Adding, renaming and deleting meals is free, without impact on the source
 * > template, with the targets recalculated.
 *
 * A modal rather than a pushed screen, by the rule the whole application
 * follows: browsing is a push, adding is a modal. Correcting a meal's goals is
 * done ON the day, which stays visible behind the panel.
 *
 * ## THE NAME IS A CHOICE BETWEEN FOUR, LAID OUT IN THE FORM
 *
 * Two controls were tried here before this one, and both were the wrong shape.
 * A UIPickerView costs a scroll to reach what could be a tap, and eats a
 * hundred and fifty points of a panel whose four target fields are the whole
 * point. An action sheet then asked a second question — Annuler — for a choice
 * with nothing to cancel: the value already has one, the sheet only changes it.
 *
 * So the options are rows, one per line, in the form itself, with a tick on the
 * one in force. That is the Settings idiom for a short exclusive choice, it
 * needs no dismissal, and the whole set is legible without touching anything —
 * which is what makes "only these four" visible rather than merely true.
 *
 * The list is short precisely because a day may hold only one breakfast, one
 * lunch and one dinner. Offering a kind the day already has and then refusing
 * it at the write would be asking a question whose answer is already known.
 *
 * THE SAME SCREEN EDITS AN EXISTING MEAL, kind included. It used to offer only
 * the targets, with the kind hidden behind a second entry in the long-press
 * menu — which made the user pick which half of an edit they wanted before
 * being shown either. One screen, one transaction, both halves.
 *
 * When editing, the meal's OWN kind is always among the choices: a meal is not
 * in conflict with itself, which is what canUseKind knows and this does not
 * have to.
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
  const updateMeal = useUpdateMeal();

  const meals = day.data?.meals ?? [];
  const existing = mealPosition === null
    ? undefined
    : meals.find((meal) => meal.position === mealPosition);

  /**
   * The kinds this meal may take, its own included when it already has one.
   *
   * One expression for both modes: creating asks about a meal that does not
   * exist yet, which is the position past the end.
   */
  const names = meals.map((meal) => meal.name);
  const index =
    mealPosition === null
      ? names.length
      : meals.findIndex((meal) => meal.position === mealPosition);
  const offered = MEAL_KINDS.filter((option) => canUseKind(names, index, option));
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
    mealPosition === null ? 'Nouveau repas' : 'Modifier le repas',
    mealPosition === null ? null : (existing?.label ?? null),
  );

  const targets = readDraftTargets(draft);
  // undefined is "partly filled", which is the one state that cannot be saved.
  const partial = targets === undefined;
  const canSave = !partial && kind !== null;

  function save(): void {
    if (!canSave || targets === undefined) return;

    if (mealPosition === null) {
      if (kind === null) return;
      addMeal.mutate({ date, name: kind, targets }, { onSuccess: dismiss });
      return;
    }

    if (kind === null) return;
    updateMeal.mutate({ date, mealPosition, name: kind, targets }, { onSuccess: dismiss });
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
        <FormSection caption="Repas">
          {offered.map((option, at) => (
            <View key={option}>
              {at === 0 ? null : <ListSeparator />}
              <Pressable
                onPress={() => setKind(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: kind === option }}
                style={styles.option}
              >
                <SymbolView
                  name={mealSymbol(option)}
                  size={17}
                  tintColor={mealColor(option, theme.colors)}
                />
                <Text style={[styles.optionLabel, { color: theme.colors.text }]}>
                  {option}
                </Text>
                {/*
                  A tick, and nothing where there is no tick: a row of empty
                  circles would draw four controls where there is one choice.
                */}
                {kind === option ? (
                  <SymbolView name="checkmark" size={15} tintColor={theme.colors.accent} />
                ) : null}
              </Pressable>
            </View>
          ))}
        </FormSection>

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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  optionLabel: { fontSize: 17, flex: 1 },
  unit: { fontSize: 15 },
  note: { fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
  save: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
});
