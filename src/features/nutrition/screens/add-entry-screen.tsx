import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { SwipeBack } from '@/core/ui/swipe-back';
import type { FoodId } from '@/core/db/schema';
import { useAddEntries } from '../data/day-queries';
import {
  useFavoriteFoods,
  useFoodByBarcode,
  useFoods,
  useRecentFoods,
} from '../data/food-queries';
import type { FoodListItem } from '../data/food-reads';
import { searchFoods } from '../domain/food-search';
import {
  pendingEntryKcal,
  pendingEntryName,
  type PendingEntry,
} from '../domain/pending-entry';
import { FoodRow } from '../components/food-row';
import { ScanScreen } from '../off/scan-screen';
import { OffResultRow } from '../components/off-result-row';
import { OffNoticeBanner, type OffNotice } from '../components/off-notice';
import { dedupeRemote, libraryBarcodes } from '../off/off-dedupe';
import { useOffLookup, useOffSearch } from '../off/off-queries';
import type { OffOutcome } from '../off/off-client';
import type { LookupResult } from '../off/off-lookup';
import {
  isCompleteProduct,
  missingMacroLabels,
  type CompleteOffProduct,
  type OffProduct,
} from '../off/off-product';
import { draftFromProduct } from '../off/off-draft';
import { FoodEditorScreen } from './food-editor-screen';
import { PendingEntryRow } from '../components/pending-entry-row';
import { SwipeToDeleteRow } from '../components/swipe-to-delete-row';
import { SearchField } from '../components/search-field';
import { formatChoiceQuantity } from '../components/portion-text';
import { FreeEntryScreen } from './free-entry-screen';
import { QuantityScreen } from './quantity-screen';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * Adding to the journal (specs 8.4).
 *
 * > a) Quick access — the screen shown by default: foods, favourites first,
 * >    then recents.
 * > b) Search — personal results first.
 * > d) Free entry — accessible in a single tap.
 *
 * ## A MEAL IS ASSEMBLED, THEN COMMITTED
 *
 * Choosing a food or typing a free entry adds a line to a basket and comes
 * straight back here; nothing reaches the database until "Confirmer". That is
 * what makes a meal of four things four acts of choosing rather than four
 * round trips through the journal — and it is why the whole basket is written
 * in ONE transaction (see addEntries): the application can be killed at any
 * moment, and half a meal is worse than none, because none is visibly missing
 * and half is not.
 *
 * The basket is screen state, so closing the panel discards it. That is the
 * right default rather than an omission: an abandoned basket is an abandoned
 * intention, and keeping it would mean explaining, days later, why a meal
 * nobody confirmed is still waiting.
 *
 * ## Every step is state, not a route
 *
 * D16 budgets 0,2 s from choosing a food to the quantity screen, and the exit
 * criterion of the slice is two taps. Swapping the content of a panel already
 * on screen costs a render; pushing a route costs a presentation, and stacks a
 * dismissal on the way out. The quantity screen still exists as a route of its
 * own — specs 3 asks for it, and the Journal opens it when an already-logged
 * food is tapped — but the fast path never travels through the router.
 *
 * ## WHAT IS DELIBERATELY ABSENT
 *
 * Recipes (slice 6) and recent meals both belong to 8.4a and neither is here:
 * section 7 scopes this slice to the personal food database. Open Food Facts
 * results (8.4b) arrive in slice 4 and will append a second section below
 * "Mes aliments" — which is why the personal results already sit under a
 * heading rather than in a bare list.
 */
export function AddEntryScreen({
  date,
  mealPosition,
}: {
  date: LocalDate;
  mealPosition: number | null;
}) {
  const theme = useTheme();
  const router = useRouter();

  const [term, setTerm] = useState('');
  /**
   * The term a remote search was ASKED FOR, which is never the one being typed.
   *
   * Specs 8.4b and D11 forbid search-as-you-type outright: Open Food Facts
   * allows ten searches a minute per IP address and says so in as many words.
   * Two pieces of state rather than a debounce, because a debounce is a way of
   * searching as you type slowly and the prohibition is about intent, not
   * about frequency.
   */
  const [submitted, setSubmitted] = useState<string | null>(null);
  /**
   * The barcode of a remote result the user tapped, being looked up.
   *
   * A result row is not enough to build a food from: observed on 13/09/2026, a
   * search hit can carry only kilojoules where the product endpoint supplies
   * kcal. So choosing one costs a lookup — which is also the call D11 caches
   * durably, and the one the scan will share.
   */
  const [picked, setPicked] = useState<string | null>(null);
  /** True while the viewfinder is open. A step, like every other one here. */
  const [scanning, setScanning] = useState(false);
  const [chosen, setChosen] = useState<FoodId | null>(null);
  const [freeEntry, setFreeEntry] = useState(false);
  const [showBasket, setShowBasket] = useState(false);
  const [basket, setBasket] = useState<PendingEntry[]>([]);
  // Which line of the basket is being corrected, by position. An index rather
  // than the line itself: what is edited is the SLOT, and the line in it is
  // replaced. A pending line has no identity of its own -- nothing is written
  // until the meal is confirmed, so there is nothing yet for an id to name.
  const [amending, setAmending] = useState<number | null>(null);

  const foods = useFoods();
  const favorites = useFavoriteFoods();
  const recents = useRecentFoods();
  const remote = useOffSearch(submitted);
  /**
   * THE FIRST LINK OF THE SCAN CHAIN (specs 8.5): personal, then cache, then
   * Open Food Facts.
   *
   * A product scanned before has been copied into the library by the
   * confirmation that logged it, so the habitual case ends here — one indexed
   * lookup, no request, well inside the five seconds. The remote lookup below
   * only runs once this has answered nothing, which is what `enabled` on the
   * next line expresses.
   */
  const known = useFoodByBarcode(picked);
  const knownFood = known.data ?? null;
  const lookup = useOffLookup(knownFood === null && !known.isPending ? picked : null);

  const searching = term.trim() !== '';
  const results = useMemo(
    () => (searching ? searchFoods(foods.data ?? [], term) : []),
    [foods.data, term, searching],
  );

  /**
   * Remote results, minus everything the library already represents.
   *
   * The deduplication of specs 8.5 is by BARCODE and it HIDES rather than
   * merges: the personal row is already first, and it is the corrected one.
   * Re-offering the uncorrected remote version on every search would re-offer
   * exactly what the user replaced.
   */
  const remoteResults = useMemo(() => {
    const outcome = remote.data;
    if (outcome === undefined || outcome.status !== 'ok') return [];
    return dedupeRemote(outcome.value, libraryBarcodes(foods.data ?? []));
  }, [remote.data, foods.data]);

  /**
   * What to say about the network, if anything.
   *
   * A failure of EITHER remote call feeds it, because the banner belongs to
   * the window rather than to the search field: a scan is a lookup and can
   * fail without anything having been typed.
   */
  const notice = noticeFor(remote.data, lookup.data);

  function backToList(): void {
    setChosen(null);
    setPicked(null);
    setScanning(false);
    setFreeEntry(false);
    setShowBasket(false);
    setAmending(null);
  }

  /** Out of a correction, back to the list it was opened from. */
  function backToBasket(): void {
    setAmending(null);
  }

  function collect(entry: PendingEntry): void {
    setBasket((current) => [...current, entry]);
    backToList();
  }

  /**
   * A corrected line replaces the one in its slot, and the basket reappears.
   *
   * It is REBUILT rather than patched, from the same expression a fresh line
   * comes from: nothing here is written yet, so a corrected line has no reason
   * to differ from one just chosen. Freezing belongs to the entry, at the
   * moment of the write, and is not this screen's to imitate (D5/R1).
   */
  function amend(index: number, entry: PendingEntry): void {
    setBasket((current) => current.map((line, at) => (at === index ? entry : line)));
    setAmending(null);
  }

  // Undefined when nothing is being corrected -- and also if the line went
  // away underneath, which a swipe on the list behind can do.
  const editing = amending === null ? undefined : basket[amending];

  /**
   * The product a tapped remote row resolved to, once complete.
   *
   * Incomplete is NOT an error and not a dead end: specs 8.5 diverts it to a
   * pre-filled form. That detour arrives with the next step of this slice; for
   * now an incomplete product simply does not open the wheels, which is the
   * honest half of the behaviour rather than a wrong one.
   */
  const pickedProduct: CompleteOffProduct | null =
    lookup.data?.status === 'found' && isCompleteProduct(lookup.data.product)
      ? lookup.data.product
      : null;

  /**
   * A product found but INCOMPLETE, which specs 8.5 diverts out of the fast
   * path and into a pre-filled form.
   *
   * > The absence of a SINGLE ONE of the four takes you out of the fast path
   * > and switches to creating a personal food, pre-filled with everything
   * > Open Food Facts supplied. Only the missing fields are left to complete.
   * > This path assumedly leaves the 5-second target: the food is then copied
   * > into the personal database, so the cost is paid only once.
   *
   * The detour is a STEP OF THIS WINDOW, not a route, for the reason that
   * governs every other step here: pushing to the library would take the
   * window with it, and the basket with the window. It stays exactly where it
   * was — it is this screen's state, and a step does not touch it.
   */
  const incompleteProduct: OffProduct | null =
    lookup.data?.status === 'found' && !isCompleteProduct(lookup.data.product)
      ? lookup.data.product
      : /**
         * AN UNKNOWN BARCODE TAKES THE SAME DETOUR, which specs 8.5 asks for
         * in its own line:
         *
         * > Unknown barcode: offer to create a pre-filled personal food.
         *
         * Pre-filled with the only thing there is — the barcode itself — and
         * that is not nothing: it is what makes the food created here
         * deduplicate against Open Food Facts the day somebody adds the
         * product there. A form with an empty barcode would leave the shelf
         * unscannable for ever.
         */
        lookup.data?.status === 'notFound' && picked !== null
        ? {
            barcode: picked,
            name: null,
            brand: null,
            protein100: null,
            carbs100: null,
            fat100: null,
            kcal100: null,
          }
        : null;

  /**
   * A scanned product already in the library short-circuits everything.
   *
   * Adjusted during the render rather than in an effect: an effect runs after
   * its render has been painted, so the quantity step would flash the wrong
   * content first. The same reasoning the carousel already had to learn.
   */
  if (knownFood !== null && picked !== null && chosen === null) {
    setPicked(null);
    setChosen(knownFood.id);
  }

  const step =
    editing !== undefined
      ? 'amend'
      : showBasket
        ? 'basket'
        : scanning
          ? 'scan'
          : freeEntry && mealPosition !== null
          ? 'free'
          : chosen !== null
            ? 'quantity'
            : pickedProduct !== null
              ? 'offQuantity'
              : incompleteProduct !== null
                ? 'offDraft'
                : 'list';

  /**
   * The screen shown by default (specs 8.4a), built once and used twice:
   * on its own, and as what the back gesture reveals underneath a step.
   * Two renders of the same element rather than two branches that could
   * drift — and its queries are cached, so the second costs nothing.
   */
  const picker = (
    <View style={styles.fill}>

          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/*
              THE TWO FASTEST WAYS IN, ABOVE THE SEARCH FIELD.

              Both are one tap — specs 8.4d makes free entry a single tap, and
              specs 8.5 budgets the whole scan at five seconds — so neither can
              sit a level down. They are also the two that do not involve
              reading anything: scanning aims the phone, free entry types four
              figures, and searching is the one that asks you to think of a
              word first.

              Above the field rather than under it, so their position depends
              on nothing at all. Under it they were already immune to the
              library filling up; they were still the second thing on screen,
              and a keyboard opening under the field pushed the reach further.
            */}
            <View style={styles.entryPoints}>
              <Pressable
                onPress={() => setScanning(true)}
                accessibilityRole="button"
                accessibilityLabel="Scanner un code-barres"
                style={[
                  styles.freeEntry,
                  styles.entryPoint,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                  },
                  theme.shadow,
                ]}
              >
                <SymbolView
                  name="barcode.viewfinder"
                  size={18}
                  tintColor={theme.colors.accent}
                />
                <Text style={[styles.freeEntryLabel, { color: theme.colors.accent }]}>
                  Scanner
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setFreeEntry(true)}
                accessibilityRole="button"
                style={[
                  styles.freeEntry,
                  styles.entryPoint,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.lg,
                  },
                  theme.shadow,
                ]}
              >
                <SymbolView
                  name="square.and.pencil"
                  size={18}
                  tintColor={theme.colors.accent}
                />
                <Text style={[styles.freeEntryLabel, { color: theme.colors.accent }]}>
                  Saisie libre
                </Text>
              </Pressable>
            </View>

            <SearchField
              value={term}
              onChange={setTerm}
              /*
                Submitting the field IS the explicit trigger specs 8.4b asks
                for. The search key on the keyboard already says "rechercher",
                so the gesture exists without adding a control to the screen.
              */
              onSubmit={() => setSubmitted(term.trim() === '' ? null : term.trim())}
            />

            {/*
              Directly under the field, because that is what it explains: a
              remote list that is missing or old. It follows the field rather
              than heading the screen, so an offline phone does not announce
              itself before being asked anything.
            */}
            {notice === null ? null : <OffNoticeBanner notice={notice} now={Date.now()} />}

            {!searching &&
            (favorites.data?.length ?? 0) === 0 &&
            (recents.data?.length ?? 0) === 0 &&
            (foods.data?.length ?? 0) === 0 ? (
              <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
                Aucun aliment en bibliothèque. Utilisez la saisie libre, ou créez un
                aliment depuis l’icône de bibliothèque du Journal.
              </Text>
            ) : null}

            {searching ? (
              <>
                <Section
                  title="Mes aliments"
                  foods={results}
                  onPick={setChosen}
                  emptyText={`Aucun résultat pour « ${term.trim()} ».`}
                />

                {/*
                  BELOW the personal results, never folded into them: specs
                  8.4b puts personal results first and visually distinguished,
                  and D11 explains why they cannot share a rhythm — the local
                  list answers every keystroke, the remote one only on submit.
                */}
                <RemoteSection
                  term={term}
                  submitted={submitted}
                  products={remoteResults}
                  loading={remote.isFetching || lookup.isFetching}
                  onSubmit={() => setSubmitted(term.trim() === '' ? null : term.trim())}
                  onPick={(product) => setPicked(product.barcode)}
                />
              </>
            ) : (
              <>
                <Section title="Favoris" foods={favorites.data ?? []} onPick={setChosen} />
                <Section
                  title="Récents"
                  foods={recents.data ?? []}
                  onPick={setChosen}
                  /*
                    THE ONLY LIST THAT CAN REPEAT ITSELF. Every row here has a
                    last quantity by construction — recents are derived from
                    journal entries — so the lookup below never misses, and the
                    quantity it carries is the one readQuantityPrefill would
                    hand the quantity screen. One value, produced once, in the
                    read layer (D9): this screen does no arithmetic.
                  */
                  quickAdd={(recent) => ({
                    label: formatChoiceQuantity(recent.lastQuantity, recent.baseUnit),
                    onAdd: () =>
                      collect({
                        kind: 'food',
                        foodId: recent.id,
                        name: recent.name,
                        brand: recent.brand,
                        baseUnit: recent.baseUnit,
                        reference: recent.reference,
                        // The very value the row is showing, and the one the
                        // quantity screen would have opened on. Not recomputed
                        // here: this screen does no arithmetic (D9).
                        quantity: recent.lastQuantity,
                      }),
                  })}
                />
              </>
            )}
          </ScrollView>

          <Confirm date={date} mealPosition={mealPosition} basket={basket} />
    </View>
  );

  /**
   * The basket, built once and used twice for the same reason as the picker:
   * on its own, and as what a correction is laid over and reveals on the way
   * back. A correction returns HERE and not to the food list -- it was opened
   * from this list, and landing somewhere else would lose the place.
   */
  const basketList = (
    <Basket
      entries={basket}
      onRemove={(index) => setBasket((current) => current.filter((_, at) => at !== index))}
      onEdit={setAmending}
    />
  );

  return (
    <OverlayPanel
      onDismiss={() => router.back()}
      /*
        On the list, the leading action opens the basket and its label is how
        many lines are waiting. Inside a step it becomes the way back — both
        steps are STATE, so the navigator gives them no back button of their
        own, and without one choosing the wrong food would mean closing the
        panel and starting again.
      */
      left={
        /*
          One slot, two meanings, and they fade into each other rather than
          swapping between frames — the count and the way back are two states
          of the same control, and an instant substitution reads as a glitch.

          The identity is what the button MEANS, not what it says: the count
          changing from 2 to 3 must not cross-fade, or adding a line would
          blink the header every time.
        */
        step === 'list' && basket.length === 0 ? undefined : (
          <GlassButton
            // ONE button for both meanings, never remounted: what changes is
            // its contents, and they cross rather than swap. The glass itself
            // could not be faded -- see CrossFade for why.
            fadeKey={step === 'list' ? 'basket' : 'back'}
            symbol={step === 'list' ? 'list.bullet' : 'chevron.left'}
            label={step === 'list' ? String(basket.length) : undefined}
            onPress={
              step === 'list'
                ? () => setShowBasket(true)
                : step === 'amend'
                  ? backToBasket
                  : backToList
            }
            accessibilityLabel={
              step === 'list'
                ? `Voir les ${basket.length} lignes à ajouter`
                : step === 'amend'
                  ? 'Retour à la liste'
                  : 'Retour aux aliments'
            }
          />
        )
      }
      right={<CancelAction />}
    >
      {editing !== undefined && amending !== null ? (
        <SwipeBack key={step} onBack={backToBasket} behind={basketList}>
          {editing.kind === 'food' ? (
            <QuantityScreen
              mode="collect"
              foodId={editing.foodId}
              amending={editing.quantity}
              onCollect={(quantity, food) =>
                amend(amending, {
                  kind: 'food',
                  foodId: food.id,
                  name: food.name,
                  brand: food.brand,
                  baseUnit: food.baseUnit,
                  reference: food.reference,
                  quantity,
                })
              }
            />
          ) : editing.kind === 'off' ? (
            /*
              A remote line is corrected on its own quantity, exactly like a
              personal one. It never goes back to the network to do it: the
              product it carries is what is about to be written, and re-asking
              could answer differently a second later.
            */
            <QuantityScreen
              mode="collectOff"
              product={editing.product}
              amending={editing.quantity}
              onCollect={(quantity) =>
                amend(amending, { kind: 'off', product: editing.product, quantity })
              }
            />
          ) : (
            <FreeEntryScreen
              date={date}
              mealPosition={mealPosition}
              entryId={null}
              initial={{ name: editing.name, macros: editing.macros }}
              onCollect={(entry) =>
                amend(amending, {
                  kind: 'free',
                  name: entry.name.trim(),
                  macros: entry.macros,
                })
              }
            />
          )}
        </SwipeBack>
      ) : step === 'free' && mealPosition !== null ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <FreeEntryScreen
            date={date}
            mealPosition={mealPosition}
            entryId={null}
            onCollect={(entry) =>
              collect({ kind: 'free', name: entry.name.trim(), macros: entry.macros })
            }
          />
        </SwipeBack>
      ) : step === 'scan' ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <ScanScreen
            onScanned={(barcode) => {
              /*
                The viewfinder closes on the scan itself rather than on what
                the scan finds. What follows — library, cache, network, or the
                pre-filled form — takes a moment, and leaving a live camera
                running underneath it would be the phone still looking while
                the answer arrives.
              */
              setScanning(false);
              setPicked(barcode);
            }}
          />
        </SwipeBack>
      ) : step === 'offDraft' && incompleteProduct !== null ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <OffDraftStep
            product={incompleteProduct}
            onCreated={(foodId) => {
              /*
                Created, then chosen — two acts, in that order. The food now
                exists because the user filled a form in and pressed the
                button, which is the explicit save the copy rule allows; the
                line still has to be confirmed like any other. Clearing the
                pick is what moves the window on, since the lookup that
                produced it would otherwise re-open this same form.
              */
              setPicked(null);
              setChosen(foodId);
            }}
          />
        </SwipeBack>
      ) : step === 'offQuantity' && pickedProduct !== null ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <QuantityScreen
            mode="collectOff"
            product={pickedProduct}
            onCollect={(quantity) =>
              collect({ kind: 'off', product: pickedProduct, quantity })
            }
          />
        </SwipeBack>
      ) : step === 'quantity' && chosen !== null ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <QuantityScreen
            mode="collect"
            foodId={chosen}
            onCollect={(quantity, food) =>
              collect({
                kind: 'food',
                foodId: food.id,
                name: food.name,
                brand: food.brand,
                baseUnit: food.baseUnit,
                reference: food.reference,
                quantity,
              })
            }
          />
        </SwipeBack>
      ) : step === 'basket' ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          {basketList}
        </SwipeBack>
      ) : (
        picker
      )}
    </OverlayPanel>
  );
}

/** Inside the panel, so its dismissal folds the window away first. */
function CancelAction() {
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

/**
 * The one thing on this screen that writes.
 *
 * Sits OUTSIDE the scroll view, so it never scrolls away: a list that grows
 * must not be able to hide the way to commit it. Absent while the basket is
 * empty, because a button that does nothing is a button you learn to ignore.
 *
 * Inside the panel, so useDismiss folds the window away rather than cutting
 * it — and the write is awaited rather than raced. A mutation is not cancelled
 * by unmounting, so closing first would probably work, and "probably" is the
 * wrong standard for the gesture this slice exists to make reliable.
 */
function Confirm({
  date,
  mealPosition,
  basket,
}: {
  date: LocalDate;
  mealPosition: number | null;
  basket: readonly PendingEntry[];
}) {
  const theme = useTheme();
  const dismiss = useDismiss();
  const addEntries = useAddEntries();

  if (basket.length === 0 || mealPosition === null) return null;

  const kcal = basket.reduce((total, entry) => total + pendingEntryKcal(entry), 0);

  return (
    <View style={styles.confirmBar}>
      <Pressable
        onPress={() =>
          addEntries.mutate(
            {
              date,
              mealPosition,
              entries: basket.map((entry) => {
                if (entry.kind === 'free') {
                  return { kind: 'free' as const, name: entry.name, macros: entry.macros };
                }
                if (entry.kind === 'off') {
                  /*
                    THE COPY OF SPECS 8.5 HAPPENS FROM HERE, and only from
                    here: the product travels to the write layer, which copies
                    it into the library in the same transaction as the entry.
                    Nothing was written while it sat in the basket.
                  */
                  return {
                    kind: 'off' as const,
                    product: entry.product,
                    quantity: entry.quantity,
                  };
                }
                return {
                  kind: 'food' as const,
                  foodId: entry.foodId,
                  quantity: entry.quantity,
                };
              }),
            },
            { onSuccess: dismiss },
          )
        }
        disabled={addEntries.isPending}
        accessibilityRole="button"
        style={[styles.confirm, { backgroundColor: theme.colors.accent }]}
      >
        <Text style={[styles.confirmLabel, { color: theme.colors.onAccent }]}>
          Confirmer · {basket.length} · {formatKcal(kcal)} kcal
        </Text>
      </Pressable>
    </View>
  );
}

function Basket({
  entries,
  onRemove,
  onEdit,
}: {
  entries: readonly PendingEntry[];
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
}) {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Rien à ajouter pour l’instant.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
          theme.shadow,
        ]}
      >
        {entries.map((entry, index) => (
          <View key={`${entry.kind}-${index}-${pendingEntryName(entry)}`}>
            {index === 0 ? null : (
              <ListSeparator />
            )}
            {/*
              Swiped LEFT, the same way the Journal deletes an entry and the
              same way Files deletes a file. One gesture for "take this away",
              wherever it is — and it cannot be confused with the back gesture,
              which travels the other way and only from the edge.
            */}
            <SwipeToDeleteRow actionLabel="Retirer" onDelete={() => onRemove(index)}>
              {/*
                Touching a line reopens the choice that made it -- a quantity,
                or four figures. A line waiting to be written is still a
                decision being taken, and taking it back should not mean
                removing it and starting over.

                The press reaches this only while the row is at rest: an open
                row takes the touch itself and closes, exactly as a row does
                in Files.
              */}
              <Pressable
                onPress={() => onEdit(index)}
                accessibilityRole="button"
                accessibilityLabel={`Modifier ${pendingEntryName(entry)}`}
              >
                <PendingEntryRow entry={entry} />
              </Pressable>
            </SwipeToDeleteRow>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Generic over the row type, so a list that knows more about its rows can say
 * so without the section having to.
 *
 * Recents carry a last quantity; favourites and search results do not. Without
 * the parameter, `quickAdd` would receive a plain FoodListItem and have to find
 * its own row back by id — a lookup per row, for an object already in hand.
 */
function Section<T extends FoodListItem>({
  title,
  foods,
  onPick,
  emptyText,
  quickAdd,
}: {
  title: string;
  foods: readonly T[];
  onPick: (foodId: FoodId) => void;
  emptyText?: string;
  /**
   * How a row repeats itself in one tap, when it can (specs 8.4a).
   *
   * Passed only by Recents, which is the only list whose rows have a "last
   * time": a favourite never logged has nothing to repeat, and a search result
   * is not yet a habit. Absent, the section renders exactly as before.
   */
  quickAdd?: (food: T) => { label: string; onAdd: () => void };
}) {
  const theme = useTheme();

  if (foods.length === 0 && emptyText === undefined) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{title}</Text>

      {foods.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{emptyText}</Text>
      ) : (
        <View
          style={[
            styles.list,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          {foods.map((food, index) => {
            // Asked once per row: it builds a closure, and asking twice would
            // make two of them for one question.
            const repeat = quickAdd?.(food);

            return (
              <View key={food.id}>
                {index === 0 ? null : <ListSeparator />}
                {/*
                  One tap to choose, and — in Recents — one tap to repeat. The
                  row itself still opens the quantity screen, so changing the
                  amount costs exactly what it always did.
                */}
                <FoodRow
                  food={food}
                  onPress={() => onPick(food.id)}
                  quantity={repeat?.label}
                  onQuickAdd={repeat?.onAdd}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * Which notice, if any, the window should carry.
 *
 * Reads BOTH remote calls, because the banner belongs to the window rather
 * than to the search field: a scan is a lookup and can fail without anything
 * having been typed.
 *
 * A lookup that FOUND something still reports its degradation — the figures
 * came from a cache because the network could not be reached — which is
 * exactly the "silent fallback to local with a discreet banner" of D11.
 */
function noticeFor(
  search: OffOutcome<OffProduct[]> | undefined,
  lookup: LookupResult | undefined,
): OffNotice | null {
  if (lookup !== undefined) {
    if (lookup.status === 'unavailable') {
      return lookup.reason === 'throttled'
        ? { kind: 'throttled', retryAtMs: lookup.retryAtMs ?? Date.now() }
        : { kind: lookup.reason };
    }
    if (lookup.status === 'found' && lookup.degraded !== null) {
      // Shown even though there IS an answer: a figure from a five-week-old
      // cache is worth having and worth labelling.
      return lookup.degraded === 'throttled'
        ? { kind: 'throttled', retryAtMs: Date.now() }
        : { kind: lookup.degraded };
    }
  }

  if (search !== undefined && search.status !== 'ok') {
    switch (search.status) {
      case 'offline':
        return { kind: 'offline' };
      case 'badResponse':
        return { kind: 'badResponse' };
      case 'throttled':
        /*
          THE DISTINCTION D11 DRAWS, arriving intact at the one place it is
          visible. Only a refusal from the SERVER gets the loud message; our
          own preventive window is discreet, because nobody did anything wrong
          and there is nothing for them to decide.
        */
        return search.source === 'server'
          ? { kind: 'throttled', retryAtMs: search.retryAtMs }
          : null;
      case 'notFound':
        return null;
    }
  }

  return null;
}

/**
 * The pre-filled form of specs 8.5, as a step of the add window.
 *
 * It says WHY it appeared before showing the form. A screen that simply
 * replaced the wheels with a form would read as a bug — the user tapped a
 * product and got a questionnaire — where one line turns it into an
 * explanation: this product does not publish everything, so it is worth
 * thirty seconds once.
 */
function OffDraftStep({
  product,
  onCreated,
}: {
  product: OffProduct;
  onCreated: (foodId: FoodId) => void;
}) {
  const theme = useTheme();
  const missing = missingMacroLabels(product);
  usePanelHeading(product.name ?? 'Nouvel aliment', 'À compléter');
  // The barcode is shown rather than hidden: it is the one thing that IS
  // known, and seeing it is how a wrong scan gets noticed before a food is
  // created under it.

  return (
    <View style={styles.fill}>
      <Text style={[styles.detour, { color: theme.colors.textMuted }]}>
        {missing.length === 4 && product.name === null
          ? // Nothing came back at all: an unknown barcode rather than an
            // incomplete product. Saying "Open Food Facts does not give" here
            // would be describing a product that does not exist.
            'Ce code-barres est inconnu d’Open Food Facts. Créez l’aliment : il sera ' +
            'retrouvé au prochain scan.'
          : missing.length === 0
            ? 'Ce produit n’a pas de nom sur Open Food Facts. Complétez-le pour l’ajouter.'
            : `Open Food Facts ne donne pas ${listFrench(missing)} pour ce produit. Complétez${
                missing.length === 1 ? '-la' : '-les'
              } pour l’ajouter.`}
      </Text>

      <FoodEditorScreen
        foodId={null}
        presentation="panel"
        initial={draftFromProduct(product)}
        onSaved={onCreated}
      />
    </View>
  );
}

/** "les protéines et les calories" rather than a comma-separated list. */
function listFrench(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/**
 * The Open Food Facts half of the unified search (specs 8.4b).
 *
 * It exists as a section even before anything is asked for, and that is the
 * point: the invitation is what makes the trigger explicit. A screen that
 * searched by itself would be faster to use and would breach the one rule Open
 * Food Facts states outright.
 */
function RemoteSection({
  term,
  submitted,
  products,
  loading,
  onSubmit,
  onPick,
}: {
  term: string;
  submitted: string | null;
  products: readonly OffProduct[];
  loading: boolean;
  onSubmit: () => void;
  onPick: (product: OffProduct) => void;
}) {
  const theme = useTheme();
  const asked = submitted !== null && submitted === term.trim();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
        Open Food Facts
      </Text>

      {!asked ? (
        /*
          The explicit trigger, as a row rather than a button in a corner: it
          sits exactly where the results will appear, so the thing tapped and
          the thing that changes are the same place.
        */
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          style={[
            styles.freeEntry,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          <SymbolView name="magnifyingglass" size={16} tintColor={theme.colors.accent} />
          <Text style={[styles.freeEntryLabel, { color: theme.colors.accent }]}>
            Chercher « {term.trim()} » en ligne
          </Text>
        </Pressable>
      ) : loading ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>Recherche…</Text>
      ) : products.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Aucun produit trouvé.
        </Text>
      ) : (
        <View
          style={[
            styles.list,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          {products.map((product, index) => (
            <View key={product.barcode}>
              {index === 0 ? null : <ListSeparator />}
              <OffResultRow product={product} onPress={() => onPick(product)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 18 },
  freeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  freeEntryLabel: { fontSize: 17, fontWeight: '600' },
  entryPoints: { flexDirection: 'row', gap: 10 },
  entryPoint: { flex: 1 },
  section: { gap: 9 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { fontSize: 15, lineHeight: 21 },
  detour: { fontSize: 15, lineHeight: 21, paddingHorizontal: 16, paddingBottom: 4 },
  confirmBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  confirm: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  confirmLabel: { fontSize: 17, fontWeight: '600' },
});
