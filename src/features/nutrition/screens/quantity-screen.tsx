import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { formatQuantity } from '@/core/format';
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
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { FormRow, FormSection } from '@/core/ui/form-section';
import { MacroRow } from '../components/macro-row';
import { formatPortionCount } from '../components/portion-text';
import { QuantityWheel } from '../components/quantity-wheel';
import {
  amountOf,
  nearestFraction,
  type WheelChoice,
  type WheelUnit,
} from '../domain/wheel-choice';

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
      /**
       * A line ALREADY IN THE BASKET being corrected: its own quantity, in
       * place of the pre-fill. The pre-fill answers "how much of this do you
       * usually have"; a line being corrected has already answered it, and
       * proposing the habit again would discard what was just chosen.
       */
      amending?: QuantityChoice;
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
  amending,
  onCollect,
}: Common & {
  foodId: FoodId;
  amending?: QuantityChoice;
  onCollect: (q: QuantityChoice, food: FoodView) => void;
}) {
  const prefill = useQuantityPrefill(foodId);
  const loaded = prefill.data ?? null;
  const correcting = amending !== undefined;

  return (
    <QuantityForm
      title={loaded?.food.name ?? ''}
      subtitle={loaded?.food.brand ?? null}
      baseUnit={loaded?.food.baseUnit ?? 'g'}
      reference={loaded?.food.reference ?? null}
      portions={loaded?.food.portions ?? []}
      // A correction shows what was chosen, and it is there from the first
      // frame rather than a query away: the basket carries it.
      initial={amending ?? loaded?.quantity ?? null}
      // The button says which of the two this is. "Ajouter" on a line already
      // in the basket would read as a second helping.
      action={correcting ? 'Enregistrer' : 'Ajouter'}
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

  // Named at the top of the window, on the line the actions are on, rather
  // than as the first thing in the scroll. What is being weighed should not be
  // something you can scroll away from while you weigh it.
  usePanelHeading(title, subtitle);

  /**
   * WHAT THE WHEELS ARE ON, and the only state this screen keeps.
   *
   * A whole number, a fraction of one, and which unit — the three answers the
   * three wheels give. Everything else is derived from them (D9): what it
   * comes to in base units, and what that is worth.
   *
   * A hundred to start with, which is also where the pre-fill chain ends when
   * a food has never been logged (specs 8.4).
   */
  const [wheel, setWheel] = useState<WheelChoice>({ whole: 100, fraction: 0, unit: 0 });
  const [loaded, setLoaded] = useState(false);

  /**
   * What it can be counted in: the base unit first, then this food's portions.
   * Each carries what one of it weighs, which is what lets the wheels convert
   * when the unit changes.
   */
  const units: WheelUnit[] = [
    { label: baseUnit, size: null },
    ...portions.map((portion) => ({ label: portion.name, size: portion.quantity })),
  ];

  useEffect(() => {
    // Set once, when the pre-fill arrives. Reapplying it on every render would
    // spin the wheels out from under the finger.
    if (loaded || initial === null) return;

    const amount = initial.portion === null ? initial.baseQuantity : initial.portion.count;
    const named = initial.portion?.name ?? null;
    const found = portions.findIndex((portion) => portion.name === named);
    // Its portion may have been renamed or dropped since; base units are the
    // honest fallback, as they are everywhere else in this chain.
    const unit = named === null || found < 0 ? 0 : found + 1;

    // The NEAREST face the wheel has, not the exact remainder: these are
    // wheels, and 0,37 of a slice is not one of their faces. A quantity in
    // base units lands on the dash, whole numbers being what it deals in.
    const whole = Math.floor(amount);

    setWheel({ whole, fraction: nearestFraction(amount - whole), unit });
    setLoaded(true);
  }, [initial, loaded, portions]);

  const amount = amountOf(wheel);
  const chosen = wheel.unit === 0 ? null : (portions[wheel.unit - 1] ?? null);

  const choice: QuantityChoice | null =
    amount <= 0 ? null : chosen === null ? baseQuantity(amount) : portionQuantity(chosen, amount);

  const total =
    choice === null || reference === null ? null : totalOf(reference, choice.baseQuantity);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/*
        WHAT IT IS WORTH COMES FIRST, and the wheels under it.

        This screen asks "how much", but the reason anyone answers is the
        figures — so they are put where the eye lands, and they move under the
        finger as the wheels turn. The question goes underneath, where the
        hand already is.
      */}
      {total === null ? null : (
        <FormSection>
          <FormRow>
            <MacroRow total={total} />
          </FormRow>
        </FormSection>
      )}

      <FormSection caption="Quantité">
        {/*
          The answer in words, above the wheels that make it — and beside it,
          in brackets, what a portion comes to.

          That figure has to be there: it is what is STORED and what every
          total is made of, and "2 tranches" says nothing about how much food
          that is unless the slice is already known. It is bracketed rather
          than given a row of its own, because it is the same answer said
          again, not a second one. In base units it is left out entirely: the
          brackets would repeat the words in front of them.
        */}
        <FormRow label="Quantité">
          <Text style={[styles.amount, { color: theme.colors.text }]}>
            {choice === null
              ? '—'
              : chosen === null
                ? formatQuantity(choice.baseQuantity, baseUnit)
                : `${formatPortionCount(choice.portion?.count ?? 0, chosen.name)} (${formatQuantity(
                    choice.baseQuantity,
                    baseUnit,
                  )})`}
          </Text>
        </FormRow>

        {/*
          Flush with the card's edges: a picker CUTS its labels rather than
          shrinking them, so every point the row would have kept for itself is
          a point of a portion's name.
        */}
        <FormRow flush>
          <QuantityWheel units={units} choice={wheel} onChange={setWheel} />
        </FormRow>
      </FormSection>

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
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  amount: { fontSize: 17 },
  equivalent: { fontSize: 13 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
});
