import { useId, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/core/ui/text';
import { formatQuantity, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import type { FoodId, JournalEntryId } from '@/core/db/schema';
import { useEntry, useUpdateFoodEntryQuantity } from '../data/day-queries';
import { useFood, useQuantityPrefill } from '../data/food-queries';
import type { FoodPortionView, FoodView } from '../data/food-reads';
import { totalOf, type Macros } from '../domain/macros';
import { macrosOf, type CompleteOffProduct } from '../off/off-product';
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
  wheelFor,
  wheelWithAmount,
  type WheelChoice,
  type WheelUnit,
} from '../domain/wheel-choice';
import { LoadingDots } from '@/core/ui/loading-dots';

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
  | (Common & {
      /**
       * A quantity for an Open Food Facts product that is NOT in the library.
       *
       * IT MAKES NO QUERY AT ALL, and cannot: there is no id to query with.
       * Everything the form needs travels on the product — which is also what
       * makes this the fastest of the three modes, with nothing to wait for
       * between the tap and the wheels.
       *
       * No portions either. A product that has never been saved has no named
       * portions, and inventing one would be inventing data. They become
       * available the moment it is copied, which is at "Confirmer".
       *
       * And no pre-fill: a product never eaten has no last quantity. The chain
       * of specs 8.4 ends at 100, which is exactly where the wheels open.
       */
      mode: 'collectOff';
      product: CompleteOffProduct;
      amending?: QuantityChoice;
      onCollect: (quantity: QuantityChoice) => void;
    })
  | (Common & { mode: 'edit'; entryId: JournalEntryId });

export function QuantityScreen(props: Props) {
  switch (props.mode) {
    case 'collect':
      return <CollectQuantity {...props} />;
    case 'collectOff':
      return <CollectOffQuantity {...props} />;
    case 'edit':
      return <EditQuantity {...props} />;
  }
}

/**
 * The same form, fed straight from a remote product.
 *
 * Grams, always: Open Food Facts publishes per 100 g for everything it holds,
 * liquids included, and reading that as millilitres would apply a density of 1
 * where specs 5.1 allows none. A user who wants millilitres corrects the food
 * once it has been copied, which is the free correctability of specs 8.5.
 */
function CollectOffQuantity({
  product,
  amending,
  onCollect,
}: Common & {
  product: CompleteOffProduct;
  amending?: QuantityChoice;
  onCollect: (quantity: QuantityChoice) => void;
}) {
  return (
    <QuantityForm
      title={product.name}
      subtitle={product.brand}
      baseUnit="g"
      reference={macrosOf(product)}
      portions={[]}
      /*
        NEVER null here, and that matters now that null means "not loaded yet".
        A remote product has nothing to wait for — everything travels on the
        product — so the fourth step of the pre-fill chain is stated outright
        rather than arrived at: 100, which is where a food never logged ends up
        anyway (specs 8.4).
      */
      initial={amending ?? baseQuantity(100)}
      action={amending === undefined ? 'Ajouter' : 'Enregistrer'}
      onSubmit={onCollect}
    />
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
      /*
        NULL UNTIL THE FOOD HAS ANSWERED, even when `amending` means the
        quantity is already in hand. The two used to be independent, so a
        correction rendered its wheels immediately against an empty portion
        list and landed on grams — see the note on this prop.
      */
      portions={loaded === null ? null : loaded.food.portions}
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
      /*
        Null while the food is still being read, and EMPTY when there is none
        to read — a free entry has no source, and a food deleted since answers
        with null. Both of those are real answers and must not hold the wheels;
        only the wait must.
      */
      portions={
        loaded === null || loaded.sourceFoodId === null
          ? []
          : source.data === undefined
            ? null
            : (source.data?.portions ?? [])
      }
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
  /**
   * The portions the food offers TODAY, or null while they are still being
   * read.
   *
   * ## NULL MEANS "NOT YET", NEVER "NONE" — AND HERE IT WAS THE BUG
   *
   * An empty list is a real answer: a food with no named portions, an Open
   * Food Facts product, a food deleted since. wheelFor resolves the entry's
   * portion name against this list and falls back to base units when it is not
   * there, which is right for a portion that was renamed or dropped.
   *
   * It is exactly wrong while the list is merely LATE. The two inputs of this
   * screen come from two queries, and for a journal entry the second cannot
   * even start until the first has answered — the food is found through the
   * entry. So an entry logged as "2 tranches" reliably mounted its wheels on
   * an empty list, resolved to nothing, and opened on grams.
   *
   * Waiting for both is the same rule the quantity already followed, applied
   * to the second input. The cost is one tick of the loading dots where a
   * correction used to be instant — instant and on the wrong unit.
   */
  portions: readonly FoodPortionView[] | null;
  /**
   * The quantity to open on, or null while it is still being read.
   *
   * NULL MEANS "NOT YET", never "none": a screen with nothing to wait for
   * passes the value it starts on. Conflating the two would hold the wheels
   * back for ever on the one path that has no query.
   */
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
   * ONE ScrollView IN BOTH STATES, and the wheels mounted only once there is a
   * quantity to mount them on.
   *
   * The wheels used to appear straight away, standing on a default of 100, and
   * an effect moved them once the query answered. An effect runs AFTER its
   * render has been painted, so that is a frame of wrong value followed by a
   * visible spin — every single time the screen opened.
   *
   * Holding the body back until `initial` AND `portions` are known makes the
   * wheels' first frame their right one. Both, because the unit wheel is as
   * much a part of that frame as the number — see the note on `portions`.
   *
   * And the scroll view stays the same element in both states on purpose:
   * swapping a View for a ScrollView is what made the Journal's day page jump,
   * because UIKit recomputes a fresh scroll view's content inset from nothing.
   */
  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {initial === null || portions === null ? (
        <LoadingDots />
      ) : (
        <QuantityBody
          baseUnit={baseUnit}
          reference={reference}
          portions={portions}
          initial={initial}
          action={action}
          onSubmit={onSubmit}
        />
      )}
    </ScrollView>
  );
}

/**
 * The wheels and what they are worth.
 *
 * Mounted only with a quantity in hand, so its state is right from the first
 * frame and no effect has to correct it afterwards.
 */
function QuantityBody({
  baseUnit,
  reference,
  portions,
  initial,
  action,
  onSubmit,
}: {
  baseUnit: string;
  reference: Macros | null;
  portions: readonly FoodPortionView[];
  initial: QuantityChoice;
  action: string;
  onSubmit: (quantity: QuantityChoice) => void;
}) {
  const theme = useTheme();

  /**
   * WHAT THE WHEELS ARE ON, and the only state this screen keeps.
   *
   * A whole number, a fraction of one, and which unit — the three answers the
   * three wheels give. Everything else is derived from them (D9): what it
   * comes to in base units, and what that is worth.
   *
   * Computed at mount from the quantity handed in, never in an effect.
   */
  const [wheel, setWheel] = useState<WheelChoice>(() => wheelFor(initial, portions));
  /**
   * Whether the quantity row has become a field.
   *
   * A state rather than a permanent input, because the wheels are the ordinary
   * way to answer and the keyboard is the exception: a text box sitting there
   * always would invite the slower gesture on the screen whose whole budget is
   * two taps (D16).
   */
  const [editing, setEditing] = useState(false);

  /**
   * What it can be counted in: the base unit first, then this food's portions.
   * Each carries what one of it weighs, which is what lets the wheels convert
   * when the unit changes.
   */
  const units: WheelUnit[] = [
    { label: baseUnit, size: null },
    ...portions.map((portion) => ({ label: portion.name, size: portion.quantity })),
  ];

  const amount = amountOf(wheel);
  const chosen = wheel.unit === 0 ? null : (portions[wheel.unit - 1] ?? null);

  const choice: QuantityChoice | null =
    amount <= 0 ? null : chosen === null ? baseQuantity(amount) : portionQuantity(chosen, amount);

  const total =
    choice === null || reference === null ? null : totalOf(reference, choice.baseQuantity);

  return (
    <>
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
          {/*
            THE ROW IS THE FIELD, once it is touched.

            Slice 3 took the keyboard off this screen so a quantity could be a
            fraction of a portion, and wrote the price down: "typing 137 g means
            turning a wheel". This is that reservation being spent. The wheels
            stay the way a quantity is CHOSEN; the keyboard is how an exact one
            is STATED, which is a different act and deserved a different gesture
            rather than a second control sitting there permanently.

            What is typed is the number, in whatever the wheels are counting —
            grams here, slices on a food that has them. The unit stays beside
            it so that is never in doubt.
          */}
          {editing ? (
            <TypedAmount
              initialText={typedFrom(amount)}
              unit={chosen === null ? baseUnit : chosen.name}
              onDone={(text) => {
                setEditing(false);
                const value = parseDecimal(text);
                // A blank, a stray character or a nothing leaves the wheels
                // where they were: the field is a shortcut, not a way to reach
                // a state the wheels cannot hold.
                if (value === null || value <= 0) return;
                setWheel((current) => wheelWithAmount(current, value));
              }}
            />
          ) : (
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel="Saisir la quantité au clavier"
              hitSlop={8}
            >
              <Text style={[styles.amount, { color: theme.colors.text }]}>
                {choice === null
                  ? '—'
                  : chosen === null
                    ? formatQuantity(choice.baseQuantity, baseUnit)
                    : `${formatPortionCount(
                        choice.portion?.count ?? 0,
                        chosen.name,
                      )} (${formatQuantity(choice.baseQuantity, baseUnit)})`}
              </Text>
            </Pressable>
          )}
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
    </>
  );
}

/**
 * The number as the field should open on it.
 *
 * French decimal separator, and no trailing ",0": what is offered for retyping
 * has to look like what someone would have typed.
 */
function typedFrom(amount: number): string {
  const rounded = Math.round(amount * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}

/**
 * The quantity row while it is being typed into.
 *
 * ## WHY IT IS ITS OWN COMPONENT
 *
 * So that the text being typed is state that is born WITH the field and dies
 * with it. Kept on the screen instead, it would need clearing every time the
 * row opened and closed, and the bug that produces — a field opening on the
 * previous edit — is invisible until someone edits twice.
 *
 * ## autoFocus AND selectTextOnFocus WORK HERE, WHERE THEY DID NOT ELSEWHERE
 *
 * Slice 3 found that the pair selects nothing when the value arrives from a
 * query: autoFocus fires at mount, the field is still empty then, and a
 * selection lands on an empty string. Here the value is in hand before the
 * field exists — it comes from the wheels, which are local state — so this is
 * the case the pair was built for: FOCUSING A FIELD THAT IS ALREADY FILLED.
 * Typing therefore replaces, which is the whole point of offering the current
 * value at all.
 *
 * ## THE VALUE IS APPLIED ON THE WAY OUT, NOT ON EVERY KEYSTROKE
 *
 * Applying as it is typed would spin the wheels through 1, then 13, then 137.
 * They are a native picker and they animate; a number pad is not a place to
 * watch that happen. Blur is the moment the answer is finished, and the bar
 * above the keyboard is how it is reached without hunting for somewhere
 * harmless to tap.
 */
function TypedAmount({
  initialText,
  unit,
  onDone,
}: {
  initialText: string;
  unit: string;
  onDone: (text: string) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(initialText);
  // Punctuation-free: it crosses to a native view as a plain string, and useId
  // spells its own with colons.
  const accessoryId = `qty${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={styles.typedRow}>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => onDone(text)}
        autoFocus
        selectTextOnFocus
        // French keyboards put the comma on this pad; parseDecimal takes both.
        keyboardType="decimal-pad"
        inputAccessoryViewID={accessoryId}
        style={[styles.typedInput, { color: theme.colors.text }]}
      />
      <Text style={[styles.amount, { color: theme.colors.textMuted }]}>{unit}</Text>

      {/*
        AFTER the field: the native view binds itself on entering the window by
        looking for an input carrying its id, so the field has to be there
        first. One field, so no chevrons — they would be two dead controls.
      */}
      <InputAccessoryView nativeID={accessoryId}>
        <View
          style={[
            styles.accessory,
            { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
          ]}
        >
          <Pressable
            onPress={() => Keyboard.dismiss()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Valider la quantité"
          >
            <Text style={[styles.done, { color: theme.colors.accent }]}>OK</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  amount: { fontSize: 17 },
  typedRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  // Right-aligned like the text it replaces, so the row does not shift as it
  // becomes a field.
  typedInput: { fontSize: 17, minWidth: 64, textAlign: 'right', padding: 0 },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  done: { fontSize: 17, fontWeight: '600' },
  equivalent: { fontSize: 13 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
});
