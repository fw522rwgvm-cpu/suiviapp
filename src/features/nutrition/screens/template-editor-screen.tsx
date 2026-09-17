import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacroWhole } from '@/core/format';
import type { DayTemplateId } from '@/core/db/schema';
import { useSettled } from '@/core/query/use-settled';
import { useTheme } from '@/core/theme';
import {
  FormInput,
  FormNavigation,
  FormRow,
  FormSection,
  useFormScroll,
} from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { useCreateTemplate, useTemplate, useUpdateTemplate } from '../data/planning-queries';
import { DEFAULT_MEAL_NAMES } from '../domain/day-plan';
import { MACRO_FIELDS } from '../components/macro-fields';
import { mealSymbol } from '../components/meal-symbol';
import { canUseKind, MEAL_KINDS } from '../domain/meal-kinds';
import {
  DEFAULT_NEW_MEAL_NAME,
  draftOfTemplate,
  draftTargetsTotal,
  emptyTemplateDraft,
  emptyTemplateMealDraft,
  isValidTemplateDraft,
  templateInputOf,
  validateTemplateDraft,
  type TemplateDraft,
  type TemplateMealDraft,
} from '../domain/template-draft';

/**
 * Creating or editing a day template (specs 8.1).
 *
 * > Each template meal carries its own macro targets. The template's targets
 * > are the sum of its meals', READ ONLY.
 *
 * So the total at the top is displayed and never entered, and it moves as the
 * per-meal figures are typed — which is the only way to aim at a daily number
 * while filling in meal ones. It is recomputed, never stored (D9).
 *
 * The draft holds text rather than numbers, for the reason macro-fields.ts
 * gives: a number round-tripped through a field eats the comma the moment it
 * is typed. The conversion happens once, in templateInputOf, on the way out.
 *
 * No calculation lives here (D9): the sum and the validation are
 * domain/template-draft.ts, and the write is one transactional function.
 */
export function TemplateEditorScreen({ templateId }: { templateId: DayTemplateId | null }) {
  const theme = useTheme();
  const router = useRouter();
  // The scroll view's half of the form: keeps the field being typed into out
  // from behind the keyboard. See useFormScroll.
  const form = useFormScroll();

  const existing = useTemplate(templateId);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const [draft, setDraft] = useState<TemplateDraft>(() =>
    emptyTemplateDraft(DEFAULT_MEAL_NAMES),
  );
  const [loaded, setLoaded] = useState(templateId === null);

  /**
   * Only once the bus has stopped flagging it — editing a template and
   * reopening it otherwise filled the form from before the edit, and saving
   * wrote that back. See core/query/use-settled.
   */
  const settled = useSettled(existing);

  useEffect(() => {
    // Loaded once, not on every change: after this the draft is the truth on
    // screen, and re-seeding it from the query would undo what is being typed
    // the moment the change bus refetched for any reason at all.
    if (loaded || settled === undefined || settled === null) return;
    setDraft(draftOfTemplate(settled));
    setLoaded(true);
  }, [settled, loaded]);

  const total = draftTargetsTotal(draft);
  const problems = validateTemplateDraft(draft);
  const valid = isValidTemplateDraft(draft);

  function editMeal(index: number, change: Partial<TemplateMealDraft>): void {
    setDraft((current) => ({
      ...current,
      meals: current.meals.map((meal, at) => (at === index ? { ...meal, ...change } : meal)),
    }));
  }

  /**
   * A snack, because it is the only kind a template can always take one more
   * of. Starting a new row on an empty name would offer a form that cannot be
   * saved until it has been touched.
   */
  function addMeal(): void {
    setDraft((current) => ({
      ...current,
      meals: [...current.meals, emptyTemplateMealDraft(DEFAULT_NEW_MEAL_NAME)],
    }));
  }

  function removeMeal(index: number): void {
    setDraft((current) => ({
      ...current,
      meals: current.meals.filter((_, at) => at !== index),
    }));
  }

  function save(): void {
    if (!valid) return;
    const input = templateInputOf(draft);
    const close = { onSuccess: () => router.back() };

    if (templateId === null) create.mutate(input, close);
    else update.mutate({ id: templateId, value: input }, close);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: templateId === null ? 'Nouveau modèle' : 'Modifier le modèle',
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!valid}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Enregistrer"
              accessibilityState={{ disabled: !valid }}
            >
              <Text
                style={[
                  styles.save,
                  { color: valid ? theme.colors.accent : theme.colors.textFaint },
                ]}
              >
                Enregistrer
              </Text>
            </Pressable>
          ),
        }}
      />

      {/*
        THE SAME SHAPE AS THE FOOD EDITOR, which is what was asked for by name
        (specs 14.25). Three things were missing and they are one problem:

        - no KeyboardAvoidingView, so the keyboard covered the foot of the form
          and the last rows could not be scrolled into view at all;
        - nothing moved the page when the chevrons moved the focus, so walking
          down the form typed into fields that were behind the keyboard;
        - a figure had to be cleared before it could be replaced.

        The first is this wrapper, the other two come from useFormScroll and
        from FormInput selecting a numeric field on focus.
      */}
      <FormNavigation anchor={form.anchor}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          {...form.scrollProps}
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <FormSection caption="Nom">
            <FormRow label="Modèle">
              <FormInput
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="Jour d’entraînement"
                autoCapitalize="sentences"
              />
            </FormRow>
          </FormSection>

          {/*
            Displayed, never entered (specs 8.1). It sits above the meals so
            the number being aimed at is visible while the parts are typed.
          */}
          <View
            style={[
              styles.total,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>
              Objectif de la journée
            </Text>
            <Text style={[styles.totalKcal, { color: theme.colors.text }]}>
              {formatKcal(total.kcal)} kcal
            </Text>
            <Text style={[styles.totalMacros, { color: theme.colors.textMuted }]}>
              {`${formatMacroWhole(total.protein)} g P · ${formatMacroWhole(total.carbs)} g G · ` +
                `${formatMacroWhole(total.fat)} g L`}
            </Text>
            <Text style={[styles.totalNote, { color: theme.colors.textFaint }]}>
              Somme des repas, jamais saisie.
            </Text>
          </View>

          {draft.meals.map((meal, index) => (
            <MealCard
              key={index}
              meal={meal}
              index={index}
              // Every kind the template does not already hold, plus this row's
              // own: a day may hold one breakfast, one lunch and one dinner.
              kinds={MEAL_KINDS.filter((kind) =>
                canUseKind(
                  draft.meals.map((entry) => entry.name.trim()),
                  index,
                  kind,
                ),
              )}
              partial={problems.some(
                (problem) => problem.code === 'target_partial' && problem.index === index,
              )}
              duplicated={problems.some(
                (problem) =>
                  problem.code === 'meal_name_duplicated' && problem.index === index,
              )}
              onChange={(change) => editMeal(index, change)}
              onRemove={() => removeMeal(index)}
            />
          ))}

          <Pressable
            onPress={addMeal}
            accessibilityRole="button"
            style={[
              styles.add,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <SymbolView name="plus" size={15} tintColor={theme.colors.accent} />
            <Text style={[styles.addLabel, { color: theme.colors.accent }]}>
              Ajouter un repas
            </Text>
          </Pressable>

          <Text style={[styles.note, { color: theme.colors.textFaint }]}>
            Un repas sans objectif est permis : laissez ses quatre champs vides. Les
            journées déjà enregistrées ne sont pas affectées par une modification.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      </FormNavigation>
    </>
  );
}

/**
 * One meal of the template: its name, then its four figures.
 *
 * A row each rather than four boxes abreast, which is the shape MACRO_FIELDS
 * already imposes everywhere these four are asked for — two spellings of one
 * question get answered as if they were two.
 */
function MealCard({
  meal,
  index,
  kinds,
  partial,
  duplicated,
  onChange,
  onRemove,
}: {
  meal: TemplateMealDraft;
  index: number;
  /** The kinds this row may take, this one's own included. */
  kinds: readonly string[];
  /** Some figures filled and some not: all four or none (specs 8.1). */
  partial: boolean;
  /** A singular kind used twice — only reachable on a template written before. */
  duplicated: boolean;
  onChange: (change: Partial<TemplateMealDraft>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();

  function chooseKind(): void {
    const options = [...kinds, 'Annuler'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Repas', options, cancelButtonIndex: options.length - 1 },
      (chosen) => {
        const name = kinds[chosen];
        if (name !== undefined) onChange({ name });
      },
    );
  }

  return (
    <View style={styles.meal}>
      <View style={styles.mealHead}>
        <Text style={[styles.mealCaption, { color: theme.colors.textFaint }]}>
          {`REPAS ${index + 1}`}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Retirer le repas ${index + 1}`}
        >
          <Text style={[styles.remove, { color: theme.colors.danger }]}>Retirer</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {/*
          A CHOICE, NOT A FIELD. A day's meals are copied from its template, so
          a template free to type any name would put any name on a day — and
          the closed list would hold everywhere except the place that decides
          what a day looks like.
        */}
        <FormRow label="Repas">
          <Pressable onPress={chooseKind} accessibilityRole="button" style={styles.kind}>
            <SymbolView
              name={mealSymbol(meal.name)}
              size={16}
              tintColor={theme.colors.textMuted}
            />
            <Text style={[styles.kindLabel, { color: theme.colors.text }]}>
              {meal.name === '' ? 'Choisir' : meal.name}
            </Text>
            <SymbolView
              name="chevron.up.chevron.down"
              size={11}
              tintColor={theme.colors.textFaint}
            />
          </Pressable>
        </FormRow>

        {MACRO_FIELDS.map((field) => (
          <View key={field.key}>
            <ListSeparator />
            <FormRow label={field.label}>
              <FormInput
                value={meal[field.key]}
                onChangeText={(text) => onChange({ [field.key]: text })}
                placeholder="—"
                keyboardType="decimal-pad"
              />
              <Text style={[styles.unit, { color: theme.colors.textMuted }]}>
                {field.unit}
              </Text>
            </FormRow>
          </View>
        ))}
      </View>

      {duplicated ? (
        <Text style={[styles.problem, { color: theme.colors.warning }]}>
          Une journée ne peut porter qu’un petit-déjeuner, un déjeuner et un dîner.
          Seules les collations peuvent se répéter.
        </Text>
      ) : null}

      {partial ? (
        <Text style={[styles.problem, { color: theme.colors.warning }]}>
          Les quatre objectifs vont ensemble : remplissez-les tous, ou aucun.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 64, gap: 18 },
  save: { fontSize: 17, fontWeight: '600' },
  total: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 3,
  },
  totalLabel: { fontSize: 13 },
  totalKcal: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalMacros: { fontSize: 14, fontVariant: ['tabular-nums'] },
  totalNote: { fontSize: 12, marginTop: 4 },
  meal: { gap: 7 },
  mealHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
  },
  mealCaption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  remove: { fontSize: 14 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindLabel: { fontSize: 17 },
  unit: { fontSize: 15 },
  problem: { fontSize: 12, lineHeight: 17, marginHorizontal: 16 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  addLabel: { fontSize: 17 },
  note: { fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
});
