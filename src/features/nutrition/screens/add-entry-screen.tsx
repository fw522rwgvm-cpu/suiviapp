import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import type { LocalDate } from '@/core/date';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { SwipeBack } from '@/core/ui/swipe-back';
import type { FoodId, RecipeId } from '@/core/db/schema';
import { Segmented } from '@/core/ui/segmented';
import { useAddEntries } from '../data/day-queries';
import {
  useFavoriteFoods,
  useFoodByBarcode,
  useFoods,
  useRecentFoods,
} from '../data/food-queries';
import type { FoodListItem, QuickAddFood } from '../data/food-reads';
import { searchFoods } from '../domain/food-search';
import { totalOf } from '../domain/macros';
import {
  pendingEntryKcal,
  pendingEntryName,
  type PendingEntry,
} from '../domain/pending-entry';
import { FoodRow } from '../components/food-row';
import { ScanScreen } from '../off/scan-screen';
import { OffResultRow } from '../components/off-result-row';
import { OffNoticeBanner, type OffNotice } from '../components/off-notice';
import { RecentMealsSection } from '../components/recent-meals-section';
import { RecipesSection } from '../components/recipes-section';
import { readMealLines } from '../data/meal-lines';
import { getAppDatabase } from '@/core/db/app-database';
import { occurrenceLines } from '../domain/recipe-occurrence';
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
import { formatChoiceWithBase } from '../components/portion-text';
import { FreeEntryScreen } from './free-entry-screen';
import { QuantityScreen } from './quantity-screen';
import { RecipeOccurrenceScreen } from './recipe-occurrence-screen';
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
 * ## THE THREE LISTS OF 8.4a ARE ALL HERE NOW, AND ONLY ONE AT A TIME
 *
 * Foods arrived in slice 3, Open Food Facts results in slice 4, recent meals
 * in slice 5, recipes in slice 6 — and stacking all four made the screen a
 * scroll: the recipes sat below a meals list below two food lists, on the one
 * screen D16 budgets in taps rather than in milliseconds.
 *
 * A segmented filter under the search field now selects which, always exactly
 * one, foods by default.
 *
 * The field does not govern all three. Foods and recipes both swap QUICK
 * ACCESS for THE WHOLE LIBRARY once a term is typed — the thing you type the
 * name of is usually the thing quick access does not hold. The meals have NO
 * library behind them: a recent meal is a past meal, so the field is inert
 * there rather than filtering ten rows already on screen, which would be a way
 * of hiding some of them rather than a search.
 *
 * And the remote search belongs to the foods alone: submitting under another
 * filter does nothing at all, because a request against the quota of D11 that
 * nobody will see is the one gesture here that costs something off the phone.
 */
/**
 * The three lists of specs 8.4a, and which one is on screen.
 *
 * Their order is 8.4a's own — foods, then meals, then recipes — with the
 * recipes brought next to the foods because the two behave identically under
 * the search field and the meals do not.
 *
 * Declared as data with the type derived from it, the shape PORTION_NAMES set
 * in slice 3, so the control and the state cannot disagree about what exists.
 */
const LIST_FILTERS = [
  { value: 'foods', label: 'Aliments' },
  { value: 'recipes', label: 'Recettes' },
  { value: 'meals', label: 'Repas' },
] as const;

type ListFilter = (typeof LIST_FILTERS)[number]['value'];

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
  const [chosenRecipe, setChosenRecipe] = useState<RecipeId | null>(null);
  /**
   * Which of the three lists the screen is showing (demande explicite).
   *
   * ALWAYS EXACTLY ONE, never none, and 'foods' by default: specs 8.4a orders
   * the three as foods, meals, recipes, and the foods are what the fifteen
   * second target of section 4 is measured on.
   *
   * Before it, all three were stacked and the recipes sat below a meals list
   * below two food lists — a scroll on the screen D16 budgets in taps.
   */
  const [listFilter, setListFilter] = useState<ListFilter>('foods');
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

  /**
   * How any personal row repeats itself in one tap (specs 8.4a).
   *
   * THE SAME FUNCTION FOR THE THREE LISTS, so favourites, recents and search
   * results cannot drift into three slightly different offers. What differs
   * between them is only which foods they hold — and, for a food never eaten,
   * what the pre-fill chain falls back to. The row never claims the quantity
   * was eaten before; it states what the button will add, which is true at
   * every step of the chain.
   *
   * No arithmetic here: prefillQuantity produced the quantity in the read
   * layer, and totalOf turns it into calories (D9).
   */
  function repeatable(item: QuickAddFood) {
    return {
      label: formatChoiceWithBase(item.lastQuantity, item.baseUnit),
      kcal: `${formatKcal(totalOf(item.reference, item.lastQuantity.baseQuantity).kcal)} kcal`,
      onAdd: () =>
        collect({
          kind: 'food',
          foodId: item.id,
          name: item.name,
          brand: item.brand,
          baseUnit: item.baseUnit,
          reference: item.reference,
          // The very value the row is showing, and the one the quantity screen
          // would have opened on. Produced once, in the read layer.
          quantity: item.lastQuantity,
        }),
    };
  }

  function backToList(): void {
    setChosen(null);
    setChosenRecipe(null);
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
    collectMany([entry]);
  }

  /**
   * Several lines at once, for a past meal expanded into its own.
   *
   * One state update rather than one per line: React would batch them anyway,
   * and a loop over `collect` would make the basket's length depend on how the
   * updates happened to be grouped.
   */
  function collectMany(entries: readonly PendingEntry[]): void {
    if (entries.length === 0) return;
    setBasket((current) => [...current, ...entries]);
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
          : chosenRecipe !== null
            ? 'recipe'
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
          {/*
            THE HEAD DOES NOT SCROLL, and the lists below it do.

            Everything here is a way IN: two one-tap entry points and the field
            that filters what follows. Scrolling a list of foods must never take
            them off screen — reaching the scanner would then cost a scroll back
            up, on a journey specs 8.5 budgets at five seconds, in a shop,
            one-handed.

            It also settles what the search field is. Above a scrolling region
            it reads as a filter on that region, which is what it is; inside it,
            it read as the first item of a list that happened to have a text box
            in it.
          */}
          <View style={styles.head}>
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
              // Inert under the meals, which have no library to look through.
              // The term survives in state, so coming back restores it.
              disabled={listFilter === 'meals'}
              placeholder={
                listFilter === 'meals'
                  ? 'Les repas récents ne se cherchent pas'
                  : listFilter === 'recipes'
                    ? 'Rechercher une recette'
                    : 'Rechercher un aliment'
              }
              /*
                Submitting the field IS the explicit trigger specs 8.4b asks
                for. The search key on the keyboard already says "rechercher",
                so the gesture exists without adding a control to the screen.

                GUARDED BY THE FILTER since it gained one: a remote search is
                the one gesture on this screen that costs something outside the
                phone, and firing it while the recipes are on screen would
                spend a request against the quota of D11 that nobody would ever
                see. The trigger is silent rather than disabled — the keyboard
                key cannot be taken away, and a search for a recipe is a
                perfectly sensible thing to submit.
              */
              onSubmit={() =>
                setSubmitted(
                  listFilter !== 'foods' || term.trim() === '' ? null : term.trim(),
                )
              }
            />

            {/*
              WHICH LIST, directly under the field it narrows (demande
              explicite). Always exactly one, never none, foods by default.

              Under the field rather than above it because it governs what the
              field searches: read top down it says "look for this — among
              these". Above, it would have separated the two entry points from
              the field they are already deliberately placed over.
            */}
            <Segmented
              options={LIST_FILTERS}
              value={listFilter}
              onChange={(next) => {
                setListFilter(next);
                // A remote result belongs to the foods list and to no other.
                // Leaving it behind would make it reappear on the way back,
                // answering a term that may since have been retyped.
                if (next !== 'foods') setSubmitted(null);
              }}
              grow
            />

            {/*
              THE BANNER BELONGS TO THE FOODS, so it only appears with them.

              It explains a remote list that is missing or old, and the remote
              list is the foods' alone: under the recipes or the meals it would
              be a sentence about something not on screen. It sits under the
              filter rather than under the field for the same reason it used to
              sit under the field — it heads what it explains.
            */}
            {listFilter === 'foods' && notice !== null ? (
              <OffNoticeBanner notice={notice} now={Date.now()} />
            ) : null}
          </View>

          {/*
            Only the lists scroll — including the empty state, which is about
            what the lists hold rather than about how to fill them.

            ONE LIST AT A TIME since the filter arrived. The three were stacked
            before, and the recipes sat below a meals list below two food
            lists: a scroll, on the screen D16 budgets in taps rather than in
            milliseconds.
          */}
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.lists}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {listFilter === 'foods' ? (
              searching ? (
                <>
                  <Section
                    title="Mes aliments"
                    foods={results}
                    onPick={setChosen}
                    emptyText={`Aucun résultat pour « ${term.trim()} ».`}
                    quickAdd={repeatable}
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
              ) : (favorites.data?.length ?? 0) === 0 &&
                (recents.data?.length ?? 0) === 0 &&
                (foods.data?.length ?? 0) === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
                  Aucun aliment en bibliothèque. Utilisez la saisie libre, ou créez un
                  aliment depuis l’icône de bibliothèque du Journal.
                </Text>
              ) : (
                <>
                  <Section
                    title="Favoris"
                    foods={favorites.data ?? []}
                    onPick={setChosen}
                    quickAdd={repeatable}
                  />
                  <Section
                    title="Récents"
                    foods={recents.data ?? []}
                    onPick={setChosen}
                    quickAdd={repeatable}
                  />
                </>
              )
            ) : null}

            {/*
              Unlike a recent meal, a recipe fills the basket — see the note in
              the component for why that is the reading of 8.4a rather than an
              exception to 8.4. The term switches it between quick access and
              the whole library, exactly as it does for the foods.
            */}
            {listFilter === 'recipes' ? (
              <RecipesSection
                onPick={setChosenRecipe}
                /*
                  The row's own quantity, staged without opening anything — and
                  the lines are scaled from the ingredients the list item
                  already carries, so the figure the row showed is the figure
                  that lands (specs 8.4a v2.4).
                */
                onQuickAdd={(recipe) =>
                  collect({
                    kind: 'recipe',
                    recipeId: recipe.id,
                    name: recipe.name,
                    yieldType: recipe.yield.type,
                    consumed: recipe.lastQuantity,
                    lines: occurrenceLines(recipe, recipe.lastQuantity),
                  })
                }
                term={term}
              />
            ) : null}

            {/*
              IT FILLS THE BASKET NOW, like everything else on this screen. It
              used to write and close, which made it the one line that could
              not be combined with a food, corrected before it landed, or
              removed without having been written — see the note in the
              component.

              NOTHING TO SEARCH: the field above is inert here. A recent meal
              is a PAST meal, so there is no library behind it to look through,
              and filtering ten rows already on screen is not a search — it is
              a way of hiding some of them.
            */}
            {listFilter === 'meals' ? (
              <RecentMealsSection
                mealPosition={mealPosition}
                /*
                  EXPANDED HERE, into one line per top-level entry. A meal that
                  lands as four lines can have one of them removed or corrected
                  before anything is written; as a single line it was all or
                  nothing, which is the very thing the basket exists to avoid.
                */
                onPick={(meal) => collectMany(readMealLines(getAppDatabase(), meal.mealId))}
              />
            ) : null}
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
          ) : editing.kind === 'recipe' ? (
            /*
              A RECIPE LINE IS CORRECTED BY REDOING THE OCCASION, from its
              quantity down. Specs 8.4 v2.3 says touching a basket line reopens
              the choice that made it, and for a recipe that choice is the two
              steps of specs 8.6 — not a single figure.

              The previous adjustment is deliberately NOT carried back in:
              step one re-derives the lines from the recipe, which is the whole
              reason the two steps are two (see RecipeOccurrenceScreen). A
              correction starts from the recipe, as it did the first time.
            */
            <RecipeOccurrenceScreen
              recipeId={editing.recipeId}
              onCollect={(occurrence) => amend(amending, { kind: 'recipe', ...occurrence })}
            />
          ) : editing.kind === 'free' ? (
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
          ) : (
            /*
              A replayed line, whose row hands over no press — so this branch
              is unreachable. Rendering nothing rather than falling through to
              the free-entry form, which would have read `macros` off a line
              that has none.
            */
            null
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
      ) : step === 'recipe' && chosenRecipe !== null ? (
        <SwipeBack key={step} onBack={backToList} behind={picker}>
          <RecipeOccurrenceScreen
            recipeId={chosenRecipe}
            onCollect={(occurrence) => collect({ kind: 'recipe', ...occurrence })}
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
                if (entry.kind === 'replay') {
                  /*
                    Verbatim. Every column was settled when the meal was
                    expanded, and the user has seen them since — reading a food
                    again here could write something they were not shown.
                  */
                  return entry;
                }
                if (entry.kind === 'recipe') {
                  /*
                    A COPY, NOT A TRANSLATION. The basket already holds the
                    adjusted lines — specs 8.6 has them edited before anything
                    is written, and re-deriving them here would discard exactly
                    that edit.
                  */
                  return {
                    kind: 'recipe' as const,
                    recipeId: entry.recipeId,
                    name: entry.name,
                    yieldType: entry.yieldType,
                    consumed: entry.consumed,
                    lines: entry.lines,
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
            {/*
              Touching a line reopens the choice that made it -- a quantity, or
              four figures. A line waiting to be written is still a decision
              being taken, and taking it back should not mean removing it and
              starting over.

              The press is handed to the row rather than wrapped around the
              content: a Pressable here could not tell a tap from the release
              of a swipe, and uncovering "Retirer" opened this very screen.
            */}
            <SwipeToDeleteRow
              actionLabel="Retirer"
              onDelete={() => onRemove(index)}
              /*
                A MEAL LINE IS NOT CORRECTABLE, and that is not an omission.
                Specs 8.4 v2.3 says touching a line reopens the choice that
                made it — for a meal that choice was "this meal", which has no
                middle ground to reopen: it is the meal or it is not. It is
                taken back the way it was refused, by a swipe, and picked
                again if a different one was meant.
              */
              /*
                A REPLAYED LINE IS NOT CORRECTABLE, and that is not an
                omission. Specs 8.4 v2.3 says touching a line reopens the
                choice that made it — this one was not chosen, it was lifted
                whole from a past meal, and there is no screen behind it to
                reopen. It is taken back the way it was refused, by a swipe.
              */
              onPress={entry.kind === 'replay' ? undefined : () => onEdit(index)}
              accessibilityLabel={
                entry.kind === 'replay'
                  ? pendingEntryName(entry)
                  : `Modifier ${pendingEntryName(entry)}`
              }
            >
              <PendingEntryRow entry={entry} />
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
  quickAdd?: (food: T) => { label: string; kcal: string; onAdd: () => void };
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
                  kcal={repeat?.kcal}
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
  // Same gutter as the lists, so the field and the rows line up; its own
  // vertical rhythm, because it is a head rather than a first item.
  head: { paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  lists: { paddingHorizontal: 16, paddingBottom: 32, gap: 18 },
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
