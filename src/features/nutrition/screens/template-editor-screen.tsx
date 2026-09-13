import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatKcal, formatMacro } from '@/core/format';
import type { DayTemplateId } from '@/core/db/schema';
import { useTheme } from '@/core/theme';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { ListSeparator } from '@/core/ui/list-separator';
import { useCreateTemplate, useTemplate, useUpdateTemplate } from '../data/planning-queries';
import { DEFAULT_MEAL_NAMES } from '../domain/day-plan';
import { MACRO_FIELDS } from '../components/macro-fields';
import {
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

  const existing = useTemplate(templateId);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const [draft, setDraft] = useState<TemplateDraft>(() =>
    emptyTemplateDraft(DEFAULT_MEAL_NAMES),
  );
  const [loaded, setLoaded] = useState(templateId === null);

  useEffect(() => {
    // Loaded once, not on every change: after this the draft is the truth on
    // screen, and re-seeding it from the query would undo what is being typed
    // the moment the change bus refetched for any reason at all.
    if (loaded || existing.data === undefined || existing.data === null) return;
    setDraft(draftOfTemplate(existing.data));
    setLoaded(true);
  }, [existing.data, loaded]);

  const total = draftTargetsTotal(draft);
  const problems = validateTemplateDraft(draft);
  const valid = isValidTemplateDraft(draft);

  function editMeal(index: number, change: Partial<TemplateMealDraft>): void {
    setDraft((current) => ({
      ...current,
      meals: current.meals.map((meal, at) => (at === index ? { ...meal, ...change } : meal)),
    }));
  }

  function addMeal(): void {
    setDraft((current) => ({
      ...current,
      meals: [...current.meals, emptyTemplateMealDraft()],
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

      <FormNavigation>
        <ScrollView
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
              {`${formatMacro(total.protein)} g P · ${formatMacro(total.carbs)} g G · ` +
                `${formatMacro(total.fat)} g L`}
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
              partial={problems.some(
                (problem) => problem.code === 'target_partial' && problem.index === index,
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
  partial,
  onChange,
  onRemove,
}: {
  meal: TemplateMealDraft;
  index: number;
  /** Some figures filled and some not: all four or none (specs 8.1). */
  partial: boolean;
  onChange: (change: Partial<TemplateMealDraft>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();

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
        <FormRow label="Nom">
          <FormInput
            value={meal.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="Déjeuner"
            autoCapitalize="sentences"
          />
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

      {partial ? (
        <Text style={[styles.problem, { color: theme.colors.warning }]}>
          Les quatre objectifs vont ensemble : remplissez-les tous, ou aucun.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
