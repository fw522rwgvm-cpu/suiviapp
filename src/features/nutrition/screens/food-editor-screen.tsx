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

  function setMacro(key: 'protein' | 'carbs' | 'fat' | 'kcal', text: string): void {
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
          </View>

          <View style={[styles.card, cardStyle(theme)]}>
            {/*
              THE QUANTITY AND ITS UNIT ARE ONE FIELD, because they are one
              answer: "per 30 g" is what a label says, and it was being asked
              as two questions in two cards. The unit is not a property of the
              food that happens to live elsewhere -- it is what the number
              beside it means.

              Watertight all the same: no conversion, no density (specs 5.1).
              Tapping ml does not convert anything; it says what these figures
              are counted in.
            */}
            <Labelled label="Macros pour cette quantité">
              <View style={styles.quantityRow}>
                <TextInput
                  value={draft.refQty === 0 ? '' : String(draft.refQty).replace('.', ',')}
                  onChangeText={(text) =>
                    setDraft((current) => ({ ...current, refQty: parseDecimal(text) ?? 0 }))
                  }
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel="Quantité de référence"
                  style={[inputStyle(theme), styles.quantityInput]}
                />

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
                            draft.baseUnit === unit
                              ? theme.colors.onAccent
                              : theme.colors.text,
                          fontSize: 16,
                        }}
                      >
                        {unit}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Labelled>

            {/*
              The four side by side, in the order they are read everywhere
              else. Stacked, they made a column of four identical boxes that
              had to be labelled to be told apart and scrolled to be checked;
              in a row, the whole answer is one glance and one tab away.

              No coloured dots here, unlike the block that DISPLAYS them: a
              colour tells four figures apart at a glance, and glancing is not
              what one does at a form. Here the label is read, then typed into.
            */}
            <View style={styles.macroRow}>
              <MacroField
                label="Protéines (g)"
                value={draft.macros.protein}
                onChange={(text) => setMacro('protein', text)}
              />
              <MacroField
                label="Glucides (g)"
                value={draft.macros.carbs}
                onChange={(text) => setMacro('carbs', text)}
              />
              <MacroField
                label="Lipides (g)"
                value={draft.macros.fat}
                onChange={(text) => setMacro('fat', text)}
              />
              <MacroField
                label="Calories"
                value={draft.macros.kcal}
                onChange={(text) => setMacro('kcal', text)}
              />
            </View>

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

/** One of the four columns: its name above, the box to type in below. */
function MacroField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (text: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.macroField}>
      <Text
        style={[styles.macroLabel, { color: theme.colors.textMuted }]}
        numberOfLines={1}
        // Four names in a row on a narrow screen: shrinking one is better than
        // cutting it, since what is cut is the unit at the end.
        adjustsFontSizeToFit
      >
        {label}
      </Text>
      <MacroInput value={value} onChange={onChange} />
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
      // Narrower and centred: a quarter of a card is not much room, and a
      // figure hugging the left edge of its box reads as the box being wrong
      // rather than the figure being short.
      style={[inputStyle(theme), styles.macroInput]}
    />
  );
}

function cardStyle(theme: ReturnType<typeof useTheme>) {
  return [
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
    },
    theme.shadow,
  ];
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return [styles.input, { color: theme.colors.text, borderColor: theme.colors.border }];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  // The number takes the room; the unit takes what it needs.
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quantityInput: { flex: 1 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroField: { flex: 1, gap: 6 },
  macroLabel: { fontSize: 11 },
  macroInput: { paddingHorizontal: 8, textAlign: 'center' },
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
  warning: { fontSize: 13, lineHeight: 18 },
  problems: { gap: 4 },
  problem: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
