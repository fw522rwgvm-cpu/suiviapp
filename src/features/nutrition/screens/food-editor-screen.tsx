import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { BaseUnit, FoodId } from '@/core/db/schema';
import {
  useCreateFood,
  useDeleteFood,
  useFoodDraft,
  useUpdateFood,
} from '../data/food-queries';
import {
  emptyFoodDraft,
  isValidFoodDraft,
  validateFoodDraft,
  type FoodDraft,
} from '../domain/food-draft';
import { hasKcalWarning, theoreticalKcal } from '../domain/macros';
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
export function FoodEditorScreen({ foodId }: { foodId: FoodId | null }) {
  const theme = useTheme();
  const router = useRouter();

  const stored = useFoodDraft(foodId);
  const create = useCreateFood();
  const update = useUpdateFood();
  const remove = useDeleteFood();

  const [draft, setDraft] = useState<FoodDraft>(emptyFoodDraft);
  const [loaded, setLoaded] = useState(false);

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

  function setMacro(key: 'protein' | 'carbs' | 'fat' | 'kcal', text: string): void {
    setDraft((current) => ({
      ...current,
      macros: { ...current.macros, [key]: parseDecimal(text) ?? 0 },
    }));
  }

  return (
    <>
      <Stack.Screen
        options={{ title: foodId === null ? 'Nouvel aliment' : 'Modifier l’aliment' }}
      />

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={[styles.card, cardStyle(theme)]}>
            <Labelled label="Nom">
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
                placeholder="Pain de mie"
                placeholderTextColor={theme.colors.textFaint}
                autoFocus={foodId === null}
                style={inputStyle(theme)}
              />
            </Labelled>

            <Labelled label="Marque (facultatif)">
              <TextInput
                value={draft.brand ?? ''}
                onChangeText={(brand) => setDraft((current) => ({ ...current, brand }))}
                placeholder="Sans marque"
                placeholderTextColor={theme.colors.textFaint}
                style={inputStyle(theme)}
              />
            </Labelled>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Unité</Text>
              {/*
                Watertight: no conversion, no density (specs 5.1). Changing it
                does not convert anything — it says what the numbers mean.
              */}
              <View style={styles.segments}>
                {(['g', 'ml'] as BaseUnit[]).map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => setDraft((current) => ({ ...current, baseUnit: unit }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.baseUnit === unit }}
                    style={[
                      styles.segment,
                      {
                        backgroundColor:
                          draft.baseUnit === unit ? theme.colors.accent : 'transparent',
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          draft.baseUnit === unit ? theme.colors.onAccent : theme.colors.text,
                        fontSize: 16,
                      }}
                    >
                      {unit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.favoriteRow}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Favori</Text>
              <Switch
                value={draft.isFavorite}
                onValueChange={(isFavorite) =>
                  setDraft((current) => ({ ...current, isFavorite }))
                }
              />
            </View>
          </View>

          <View style={[styles.card, cardStyle(theme)]}>
            <Labelled label={`Macros pour cette quantité (${draft.baseUnit})`}>
              <TextInput
                value={draft.refQty === 0 ? '' : String(draft.refQty).replace('.', ',')}
                onChangeText={(text) =>
                  setDraft((current) => ({ ...current, refQty: parseDecimal(text) ?? 0 }))
                }
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={inputStyle(theme)}
              />
            </Labelled>

            <Labelled label="Protéines (g)">
              <MacroInput
                value={draft.macros.protein}
                onChange={(text) => setMacro('protein', text)}
              />
            </Labelled>
            <Labelled label="Glucides (g)">
              <MacroInput
                value={draft.macros.carbs}
                onChange={(text) => setMacro('carbs', text)}
              />
            </Labelled>
            <Labelled label="Lipides (g)">
              <MacroInput value={draft.macros.fat} onChange={(text) => setMacro('fat', text)} />
            </Labelled>
            <Labelled label="Calories">
              <MacroInput
                value={draft.macros.kcal}
                onChange={(text) => setMacro('kcal', text)}
              />
            </Labelled>

            {warn ? (
              <Text style={[styles.warning, { color: theme.colors.warning }]}>
                Les macros saisies donnent {formatKcal(theoretical)} kcal, soit plus
                de 10 % d’écart. La valeur saisie est conservée telle quelle.
              </Text>
            ) : null}
          </View>

          <View style={[styles.card, cardStyle(theme)]}>
            <PortionEditor
              portions={draft.portions}
              baseUnit={draft.baseUnit}
              onChange={(portions) => setDraft((current) => ({ ...current, portions }))}
            />
          </View>

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

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

function MacroInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (text: string) => void;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value === 0 ? '' : String(value).replace('.', ',')}
      onChangeText={onChange}
      placeholder="0"
      placeholderTextColor={theme.colors.textFaint}
      keyboardType="decimal-pad"
      selectTextOnFocus
      style={inputStyle(theme)}
    />
  );
}

function cardStyle(theme: ReturnType<typeof useTheme>) {
  return { backgroundColor: theme.colors.surface, borderColor: theme.colors.border };
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return [styles.input, { color: theme.colors.text, borderColor: theme.colors.border }];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: {
    fontSize: 17,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  segments: { flexDirection: 'row', gap: 8 },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  favoriteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  warning: { fontSize: 13, lineHeight: 18 },
  problems: { gap: 4 },
  problem: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
