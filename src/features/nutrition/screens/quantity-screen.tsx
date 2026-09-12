import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatKcal, formatMacro, formatQuantity, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodId, JournalEntryId } from '@/core/db/schema';
import { useEntry, useUpdateFoodEntryQuantity } from '../data/day-queries';
import { useFood, useQuantityPrefill } from '../data/food-queries';
import type { FoodPortionView, FoodView } from '../data/food-reads';
import { totalOf, type Macros } from '../domain/macros';
import {
  baseQuantity,
  choiceOf,
  portionQuantity,
  type QuantityChoice,
} from '../domain/portions';
import { useDismiss } from '@/core/ui/overlay-panel';
import { formatPortionCount } from '../components/portion-text';

/**
 * How much of this food (specs 8.4, D16).
 *
 * > The quantity screen opens pre-filled with the last quantity consumed for
 * > this food, THE VALUE SELECTED and the numeric keyboard already up. A
 * > habitual food is then logged in two taps, without the keyboard.
 *
 * That sentence is the entire specification of this screen, and everything
 * here serves it: the field is focused and its contents selected on mount, so
 * the habitual gesture is type-over rather than clear-then-type, and the two
 * taps are "the food" and "Ajouter".
 *
 * The pre-filled value is not computed here. The whole four-step chain lives
 * in domain/quantity-prefill.ts and is composed by the read layer, so this
 * screen carries no rule of its own (D9) — including the one that matters: a
 * portion redefined since the last entry falls back to base units rather than
 * silently re-scaling what was eaten.
 *
 * ON EDITING: the food is NOT re-read for its macros. The entry is a closed
 * capsule (D5/R1), and correcting "60 g, not 50" must not adopt macros edited
 * since. The food is consulted for one thing only — which portions it offers
 * today, so a different one can be chosen.
 */

interface Common {
  /**
   * What to do once the write has landed. Omitted inside an overlay route,
   * where useDismiss folds the window away before leaving; supplied by the add
   * modal, which is a step swap rather than a navigation.
   */
  onDone?: () => void;
}

type Props =
  | (Common & {
      /**
       * Choosing a quantity for a food about to be added. It WRITES NOTHING:
       * the add screen collects lines and commits the lot in one transaction
       * when the meal is confirmed (specs 8.4).
       */
      mode: 'collect';
      foodId: FoodId;
      onCollect: (quantity: QuantityChoice, food: FoodView) => void;
    })
  | (Common & { mode: 'edit'; entryId: JournalEntryId });

export function QuantityScreen(props: Props) {
  return props.mode === 'collect' ? (
    <CollectQuantity {...props} />
  ) : (
    <EditQuantity {...props} />
  );
}

/** The caller's own ending, or the panel's — whichever this is inside. */
function useEnding(onDone?: () => void): () => void {
  const dismiss = useDismiss();
  return onDone ?? dismiss;
}

function CollectQuantity({
  foodId,
  onCollect,
}: Common & { foodId: FoodId; onCollect: (q: QuantityChoice, food: FoodView) => void }) {
  const prefill = useQuantityPrefill(foodId);
  const loaded = prefill.data ?? null;

  return (
    <QuantityForm
      title={loaded?.food.name ?? ''}
      subtitle={loaded?.food.brand ?? null}
      baseUnit={loaded?.food.baseUnit ?? 'g'}
      reference={loaded?.food.reference ?? null}
      portions={loaded?.food.portions ?? []}
      initial={loaded?.quantity ?? null}
      action="Ajouter"
      onSubmit={(quantity) => {
        if (loaded !== null) onCollect(quantity, loaded.food);
      }}
    />
  );
}

function EditQuantity({ entryId, onDone }: Common & { entryId: JournalEntryId }) {
  const entry = useEntry(entryId);
  const update = useUpdateFoodEntryQuantity();
  const done = useEnding(onDone);

  const loaded = entry.data ?? null;
  // Only for the portions it offers today. Its macros are deliberately unused:
  // the entry froze its own, and they are what this screen scales.
  const source = useFood(loaded?.sourceFoodId ?? null);

  return (
    <QuantityForm
      title={loaded?.name ?? ''}
      subtitle={loaded?.brand ?? null}
      baseUnit={loaded?.baseUnit ?? 'g'}
      reference={loaded?.reference ?? null}
      portions={source.data?.portions ?? []}
      initial={
        loaded === null || loaded.quantity === null
          ? null
          : choiceOf(
              loaded.quantity,
              loaded.portionName === null || loaded.portionQuantity === null
                ? null
                : { name: loaded.portionName, quantity: loaded.portionQuantity },
            )
      }
      action="Enregistrer"
      onSubmit={(quantity) => update.mutate({ entryId, quantity }, { onSuccess: done })}
    />
  );
}

function QuantityForm({
  title,
  subtitle,
  baseUnit,
  reference,
  portions,
  initial,
  action,
  onSubmit,
}: {
  title: string;
  subtitle: string | null;
  baseUnit: string;
  reference: Macros | null;
  portions: readonly FoodPortionView[];
  initial: QuantityChoice | null;
  action: string;
  onSubmit: (quantity: QuantityChoice) => void;
}) {
  const theme = useTheme();

  /** The portion in use, or null for base units. */
  const [portionName, setPortionName] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    // Filled once, when the pre-fill arrives. Reapplying it on every render
    // would overwrite what is being typed.
    if (loaded || initial === null) return;
    const value = show(initial.portion === null ? initial.baseQuantity : initial.portion.count);
    setPortionName(initial.portion?.name ?? null);
    setText(value);
    setLoaded(true);

    /**
     * FOCUS AND SELECT HERE, NOT WITH autoFocus. This is the whole of specs
     * 8.4's "the value selected", and autoFocus cannot deliver it.
     *
     * autoFocus fires at mount. At mount this field is EMPTY, because the
     * pre-fill comes from a query and arrives a tick later — so
     * selectTextOnFocus dutifully selects an empty string, and the value then
     * appears with the caret wherever iOS left it. The first device run showed
     * exactly that: pre-filled, not selected, which costs a tap to clear and
     * loses the "two taps without the keyboard" the slice is built around.
     *
     * One frame of delay because focus itself places the caret: a selection
     * set in the same tick is overwritten by it.
     */
    function focusAndSelect(): void {
      input.current?.focus();
      input.current?.setSelection(0, value.length);
    }

    const frame = requestAnimationFrame(focusAndSelect);

    /**
     * And once more after the window has finished opening.
     *
     * The first attempt is what serves the fast path, where this screen is a
     * step swapped into the add modal and nothing is animating. As an overlay
     * route it is different: the panel rises for a quarter of a second, and a
     * focus asked for while a presentation is still in flight is dropped —
     * silently, so the field ends up filled with no keyboard, which is the
     * whole lever of specs 8.4 gone.
     *
     * Guarded on isFocused so it cannot steal a selection back from someone
     * who has already started typing.
     */
    const retry = setTimeout(() => {
      if (input.current?.isFocused() !== true) focusAndSelect();
    }, 320);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
    };
  }, [initial, loaded]);

  const typed = parseDecimal(text);
  const chosen = portions.find((portion) => portion.name === portionName) ?? null;

  const choice: QuantityChoice | null =
    typed === null || typed <= 0
      ? null
      : chosen === null
        ? baseQuantity(typed)
        : portionQuantity(chosen, typed);

  const total =
    choice === null || reference === null ? null : totalOf(reference, choice.baseQuantity);

  /**
   * Switching unit keeps the AMOUNT, not the number.
   *
   * Tapping "tranche" while 50 g is showing must mean "the same 50 g, expressed
   * in slices" — 2 — rather than "50 slices". Anything else is a screen that
   * changes what you are about to eat when you look at it differently.
   */
  function switchTo(name: string | null): void {
    const current = choice?.baseQuantity ?? null;
    setPortionName(name);
    if (current === null) return;
    const next = portions.find((portion) => portion.name === name) ?? null;
    setText(show(next === null ? current : current / next.quantity));
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.identity}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle === null ? null : (
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          )}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              ...theme.shadow,
            },
          ]}
        >
          <View style={styles.amountRow}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              // No autoFocus: it fires before the pre-fill arrives. The effect
              // above focuses and selects once the value is actually there.
              // selectTextOnFocus stays, for every LATER tap on the field:
              // the habitual gesture is type-over, not clear-then-type.
              selectTextOnFocus
              accessibilityLabel="Quantité"
              style={[
                styles.amount,
                { color: theme.colors.text, borderColor: theme.colors.border },
              ]}
            />
            <Text style={[styles.unit, { color: theme.colors.textMuted }]}>
              {chosen === null
                ? baseUnit
                : `× ${formatQuantity(chosen.quantity, baseUnit)}`}
            </Text>
          </View>

          {portions.length === 0 ? null : (
            <View style={styles.segments}>
              <Segment
                label={baseUnit}
                selected={portionName === null}
                onPress={() => switchTo(null)}
              />
              {portions.map((portion) => (
                <Segment
                  key={portion.id}
                  label={portion.name}
                  selected={portionName === portion.name}
                  onPress={() => switchTo(portion.name)}
                />
              ))}
            </View>
          )}

          {choice !== null && chosen !== null ? (
            <Text style={[styles.equivalent, { color: theme.colors.textMuted }]}>
              {formatPortionCount(choice.portion?.count ?? 0, chosen.name)} ·{' '}
              {formatQuantity(choice.baseQuantity, baseUnit)}
            </Text>
          ) : null}
        </View>

        {total === null ? null : (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                ...theme.shadow,
              },
            ]}
          >
            <Text style={[styles.kcal, { color: theme.colors.text }]}>
              {formatKcal(total.kcal)} kcal
            </Text>
            <Text style={[styles.macros, { color: theme.colors.textMuted }]}>
              P {formatMacro(total.protein)} · G {formatMacro(total.carbs)} · L{' '}
              {formatMacro(total.fat)}
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => {
            if (choice !== null) onSubmit(choice);
          }}
          disabled={choice === null}
          accessibilityRole="button"
          style={[
            styles.save,
            { backgroundColor: choice === null ? theme.colors.border : theme.colors.accent },
          ]}
        >
          <Text
            style={[
              styles.saveLabel,
              { color: choice === null ? theme.colors.textFaint : theme.colors.onAccent },
            ]}
          >
            {action}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.segment,
        {
          backgroundColor: selected ? theme.colors.accent : 'transparent',
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={{ color: selected ? theme.colors.onAccent : theme.colors.text, fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The separator the field accepts and the user types, not the one JS prints. */
function show(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  identity: { gap: 3, paddingHorizontal: 2 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 15 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: {
    flex: 1,
    fontSize: 34,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  unit: { fontSize: 17 },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  equivalent: { fontSize: 13 },
  kcal: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macros: { fontSize: 14 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
});
