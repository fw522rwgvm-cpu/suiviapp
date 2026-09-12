import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { SwipeBack } from '@/core/ui/swipe-back';
import type { FoodId } from '@/core/db/schema';
import { useAddEntries } from '../data/day-queries';
import { useFavoriteFoods, useFoods, useRecentFoods } from '../data/food-queries';
import type { FoodListItem } from '../data/food-reads';
import { searchFoods } from '../domain/food-search';
import { pendingEntryKcal, type PendingEntry } from '../domain/pending-entry';
import { FoodRow } from '../components/food-row';
import { PendingEntryRow } from '../components/pending-entry-row';
import { SwipeToDeleteRow } from '../components/swipe-to-delete-row';
import { SearchField } from '../components/search-field';
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

  const searching = term.trim() !== '';
  const results = useMemo(
    () => (searching ? searchFoods(foods.data ?? [], term) : []),
    [foods.data, term, searching],
  );

  function backToList(): void {
    setChosen(null);
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

  const step =
    editing !== undefined
      ? 'amend'
      : showBasket
        ? 'basket'
        : freeEntry && mealPosition !== null
          ? 'free'
          : chosen !== null
            ? 'quantity'
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
            <SearchField value={term} onChange={setTerm} />

            {/*
              One tap, from the screen shown by default (specs 8.4d). It stays
              at the top rather than at the bottom of a list that grows: the
              fastest path must not move as the food database fills up.
            */}
            <Pressable
              onPress={() => setFreeEntry(true)}
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
              <SymbolView
                name="square.and.pencil"
                size={18}
                tintColor={theme.colors.accent}
              />
              <Text style={[styles.freeEntryLabel, { color: theme.colors.accent }]}>
                Saisie libre
              </Text>
            </Pressable>

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
              <Section
                title="Mes aliments"
                foods={results}
                onPick={setChosen}
                emptyText={`Aucun résultat pour « ${term.trim()} ».`}
              />
            ) : (
              <>
                <Section title="Favoris" foods={favorites.data ?? []} onPick={setChosen} />
                <Section title="Récents" foods={recents.data ?? []} onPick={setChosen} />
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
              entries: basket.map((entry) =>
                entry.kind === 'free'
                  ? { kind: 'free' as const, name: entry.name, macros: entry.macros }
                  : {
                      kind: 'food' as const,
                      foodId: entry.foodId,
                      quantity: entry.quantity,
                    },
              ),
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
          <View key={`${entry.kind}-${index}-${entry.name}`}>
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
                accessibilityLabel={`Modifier ${entry.name}`}
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

function Section({
  title,
  foods,
  onPick,
  emptyText,
}: {
  title: string;
  foods: readonly FoodListItem[];
  onPick: (foodId: FoodId) => void;
  emptyText?: string;
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
          {foods.map((food, index) => (
            <View key={food.id}>
              {index === 0 ? null : (
                <ListSeparator />
              )}
              {/* One tap. The next one is "Ajouter" (specs 8.4, D16). */}
              <FoodRow food={food} onPress={() => onPick(food.id)} />
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
  section: { gap: 9 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { fontSize: 15, lineHeight: 21 },
  confirmBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  confirm: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  confirmLabel: { fontSize: 17, fontWeight: '600' },
});
