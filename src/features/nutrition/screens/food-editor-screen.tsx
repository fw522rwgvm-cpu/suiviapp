import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodId } from '@/core/db/schema';
import {
  useCreateFood,
  useDeleteFood,
  useFoodByBarcode,
  useFoodDraft,
  useRecipesUsingFood,
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
import { IMPOSSIBLE_KCAL_PER_100, isImpossibleEnergy } from '../off/off-product';
import { toCanonical } from '../domain/food-macros';
import { useSettled } from '@/core/query/use-settled';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { MACRO_FIELDS, MacroFieldRow, type MacroKey } from '../components/macro-fields';
import { UnitToggle } from '../components/unit-toggle';
import { PortionEditor } from '../components/portion-editor';
import { foodProblemText } from '../components/food-problem-text';
import { describeRecipeUses } from '../components/recipe-text';

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

/**
 * The four fields, written from a draft.
 *
 * Used twice: to start the form, and when a stored food arrives. Never on every
 * render — that is what would overwrite a half-typed comma.
 */
function macroTextOf(draft: FoodDraft): Record<MacroKey, string> {
  return {
    protein: show(draft.macros.protein),
    carbs: show(draft.macros.carbs),
    fat: show(draft.macros.fat),
    kcal: show(draft.macros.kcal),
  };
}

export function FoodEditorScreen({
  foodId,
  initial,
  presentation = 'stack',
  onSaved,
}: {
  foodId: FoodId | null;
  /**
   * A pre-filled draft, for the detour of specs 8.5: an Open Food Facts
   * product missing one of the four macros. Ignored when `foodId` is set,
   * where the stored food is the source of truth.
   */
  initial?: FoodDraft;
  /**
   * Where this screen is being shown.
   *
   * 'stack' is the library: a native header carries the title and the star,
   * and leaving means router.back(). 'panel' is a STEP INSIDE THE ADD WINDOW,
   * where there is no native header to configure and going back is the
   * window's own affair — the same distinction the quantity screen makes
   * between a route and a state.
   */
  presentation?: 'stack' | 'panel';
  /** Called instead of navigating back, with the id that was just written. */
  onSaved?: (foodId: FoodId) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const [draft, setDraft] = useState<FoodDraft>(() => initial ?? emptyFoodDraft());
  /**
   * THE FOUR MACROS ARE HELD AS TEXT, and the draft keeps the parsed numbers.
   *
   * Binding the field straight to draft.macros — String() out, parseDecimal in
   * — ate the decimal separator and MOVED THE DIGITS: typing "1,2" left "1" on
   * screen after the comma, then "12". One point two grams became twelve.
   * Plausible, wrong, invisible.
   *
   * macro-fields.tsx said so in as many words and named which caller was at
   * fault: "the editor as numbers on a draft, free entry as the strings that
   * were typed — and the string is the one that can be shared". This is the
   * editor being brought into line, rather than the shared row being changed
   * for it.
   *
   * The two are written together in setMacro, so they cannot drift.
   */
  const [macroText, setMacroText] = useState<Record<MacroKey, string>>(() =>
    macroTextOf(initial ?? emptyFoodDraft()),
  );
  const [loaded, setLoaded] = useState(false);

  const stored = useFoodDraft(foodId);
  /**
   * The value the form freezes on, and only once the bus has stopped flagging it.
   *
   * Reported from use: editing a food and reopening it showed the figures from
   * BEFORE the edit, and only a second visit was right. Saving navigates back
   * inside onSuccess, so this screen is unmounted before the bus invalidates
   * sixty milliseconds later — React Query then serves the cached, stale value
   * first on reopening, and the effect below froze on it.
   *
   * Not merely a display fault: a form opened on a stale value and saved writes
   * it back over the current one. See core/query/use-settled.
   */
  const settled = useSettled(stored);
  const create = useCreateFood();
  const update = useUpdateFood();
  const remove = useDeleteFood();
  // Read ahead of the confirmation: an Alert cannot wait for a query.
  const recipeUses = useRecipesUsingFood(foodId);
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
    const value = settled;
    if (loaded || foodId === null || value === null || value === undefined) return;

    // A FOOD ENTERED AGAINST ANOTHER REFERENCE IS BROUGHT BACK TO 100 HERE.
    // The form can no longer express "per 30 g", so a draft still carrying 30
    // would have its figures read as being for 100 the moment it was saved --
    // silently multiplying them by more than three. Converting on the way in
    // keeps what was eaten true and makes the change invisible.
    const arriving =
      value.refQty === REFERENCE
        ? value
        : { ...value, refQty: REFERENCE, macros: toCanonical(value.macros, value.refQty) };

    setDraft(arriving);
    // The fields follow the draft they were just given — this is the one moment
    // the numbers change without anyone typing.
    setMacroText(macroTextOf(arriving));
    setLoaded(true);
  }, [settled, loaded, foodId]);

  const problems = validateFoodDraft(draft);

  /**
   * Whether another food already claims this barcode.
   *
   * Not a FoodProblem, and deliberately: validateFoodDraft is pure and knows
   * no database, while uniqueness is a fact about the whole library. It joins
   * the kcal discrepancy and the impossible-energy mark, which are also
   * computed outside the validator and shown beside their field.
   *
   * Unlike those two it DOES gate the save. Specs 8.5 requires unreliable
   * values to be marked and never refused; two foods claiming one product is
   * not an unreliable value, it is a question a scan could not answer.
   */
  const typedBarcode = (draft.barcode ?? '').trim();
  const holder = useFoodByBarcode(typedBarcode === '' ? null : typedBarcode);
  const clash =
    holder.data !== null && holder.data !== undefined && holder.data.id !== foodId
      ? holder.data
      : null;

  const valid = isValidFoodDraft(draft) && clash === null;
  const theoretical = theoreticalKcal(draft.macros);
  const warn = hasKcalWarning(draft.macros);
  /**
   * Physically impossible energy (specs 8.5), which slice 3 left out of scope
   * because it is written for THIS journey.
   *
   * > values that are physically impossible (beyond 900 kcal per 100 g) marked
   * > before validation
   *
   * It follows exactly the path the 10% discrepancy already took: computed in
   * the domain, shown beside the field, and never gating the button. Making it
   * a FoodProblem would block a save, and specs 8.5 requires Open Food Facts
   * values to be "marked and editable, never refused" — the same refusal that
   * kept a CHECK off the macro columns in slice 3.
   *
   * Read against what is TYPED rather than the canonical form. They are the
   * same number now that the reference is always 100, and stating it against
   * what is on screen is what makes the message checkable.
   */
  const impossible = isImpossibleEnergy(draft.macros.kcal);

  // Navigation waits for the write rather than racing it, as the free-entry
  // screen does: the write is synchronous, but "probably fine" is the wrong
  // standard for the gesture this slice exists to make reliable.
  const close = { onSuccess: () => router.back() };

  function save(): void {
    if (!valid) return;
    if (foodId === null) {
      /*
        THE ID IS HANDED BACK RATHER THAN DISCARDED when a caller asked for it.
        The detour of specs 8.5 continues into the quantity step for the food
        just created, and it cannot look the food up by name afterwards — two
        foods may share one. Creating and then logging are two acts here, and
        they are separated on purpose: what was saved is the user's explicit
        act, what follows is theirs to confirm.
      */
      create.mutate(draft, {
        onSuccess: (newId) => (onSaved === undefined ? router.back() : onSaved(newId)),
      });
    } else {
      update.mutate({ foodId, draft }, onSaved === undefined ? close : { onSuccess: () => onSaved(foodId) });
    }
  }

  function confirmDelete(): void {
    if (foodId === null) return;
    // Never blocked (specs 5.3), and nothing is lost but the food itself: past
    // entries froze everything they need. The confirmation is here because a
    // tap is easy to make by accident, not because the application hesitates.
    Alert.alert(
      `Supprimer « ${draft.name} » ?`,
      [
        'Les entrées déjà enregistrées au journal ne changent pas.',
        describeRecipeUses(recipeUses.data),
      ]
        .filter((line): line is string => line !== null)
        .join('\n\n'),
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
    // Verbatim on screen, parsed in the draft. "1," is a legal state of typing
    // "1,2" and has to survive; it simply reads as 1 for anyone who asks.
    setMacroText((current) => ({ ...current, [key]: text }));
    setDraft((current) => ({
      ...current,
      macros: { ...current.macros, [key]: parseDecimal(text) ?? 0 },
    }));
  }

  return (
    <>
      {/*
        Configured only in a stack. Inside the add window there is no native
        header to configure: the window carries its own heading, and rendering
        a Stack.Screen from a step would reach for whatever stack is behind
        the window rather than under it.
      */}
      {presentation === 'stack' ? (
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
      ) : null}

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

            {/*
              THE BARCODE, TYPED BY HAND — which is what makes a food of one's
              own answer a scan.

              Specs 6.1 has given a food an optional barcode since the start,
              and slice 4 carried it from Open Food Facts into the copy. What
              was missing was the other direction: a food created here could
              never be found by pointing the camera at the shelf, however many
              times it was scanned.

              'numbers-and-punctuation' rather than a number pad: a barcode is
              digits in practice and "whatever the scanner read" by rule (see
              food-draft), so the keyboard leans on the digits while leaving the
              letters one tap away. It is also a standard keyboard, so it has a
              return key — no accessory bar needed, unlike a true number pad.
            */}
            <FormRow label="Code-barres">
              <FormInput
                value={draft.barcode ?? ''}
                onChangeText={(barcode) => setDraft((current) => ({ ...current, barcode }))}
                placeholder="Facultatif"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FormRow>

            {/*
              SAID HERE, BEFORE SAVING, rather than caught afterwards.

              requireFreeBarcode already refuses a second food for one barcode,
              and it THROWS — "a SQLite error naming a constraint, thrown from
              inside a basket transaction that then rolls a whole meal back".
              That is the right backstop and the wrong first line of defence.
              This reads the index the moment the field changes and names the
              food actually holding the code.
            */}
            {clash === null ? null : (
              <FormRow>
                <Text style={[styles.warning, { color: theme.colors.danger }]}>
                  Ce code-barres est déjà celui de « {clash.name} ». Un produit ne peut
                  désigner qu’un seul aliment, sinon un scan n’aurait pas de réponse.
                </Text>
              </FormRow>
            )}
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
                value={macroText[field.key]}
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

            {/*
              Marked, never refused (specs 8.5). Shown alongside the 10% check
              rather than instead of it: they answer different questions — one
              says the four figures disagree with each other, this one says the
              energy is not achievable by any food at all.
            */}
            {impossible ? (
              <FormRow>
                <Text style={[styles.warning, { color: theme.colors.warning }]}>
                  Au-delà de {IMPOSSIBLE_KCAL_PER_100} kcal pour 100 {draft.baseUnit},
                  cette valeur est physiquement impossible. Elle est conservée telle
                  quelle ; vérifiez l’étiquette.
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
