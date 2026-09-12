import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatKcal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import type { FoodId } from '@/core/db/schema';
import { useAddEntries } from '../data/day-queries';
import { useFavoriteFoods, useFoods, useRecentFoods } from '../data/food-queries';
import type { FoodListItem } from '../data/food-reads';
import { searchFoods } from '../domain/food-search';
import { pendingEntryKcal, type PendingEntry } from '../domain/pending-entry';
import { FoodRow } from '../components/food-row';
import { PendingEntryRow } from '../components/pending-entry-row';
import { SearchField } from '../components/search-field';
import { FreeEntryScreen } from './free-entry-screen';
import { QuantityScreen } from './quantity-screen';

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
  }

  function collect(entry: PendingEntry): void {
    setBasket((current) => [...current, entry]);
    backToList();
  }

  const step = showBasket
    ? 'basket'
    : freeEntry && mealPosition !== null
      ? 'free'
      : chosen !== null
        ? 'quantity'
        : 'list';

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
        step === 'list' ? (
          basket.length === 0 ? undefined : (
            <GlassButton
              symbol="list.bullet"
              label={String(basket.length)}
              onPress={() => setShowBasket(true)}
              accessibilityLabel={`Voir les ${basket.length} lignes à ajouter`}
            />
          )
        ) : (
          <GlassButton symbol="chevron.left" label="Aliments" onPress={backToList} />
        )
      }
      right={<CancelAction />}
    >
      {step === 'free' && mealPosition !== null ? (
        <FreeEntryScreen
          date={date}
          mealPosition={mealPosition}
          entryId={null}
          onCollect={(entry) =>
            collect({ kind: 'free', name: entry.name.trim(), macros: entry.macros })
          }
        />
      ) : step === 'quantity' && chosen !== null ? (
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
      ) : step === 'basket' ? (
        <Basket
          entries={basket}
          onRemove={(index) =>
            setBasket((current) => current.filter((_, at) => at !== index))
          }
        />
      ) : (
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
}: {
  entries: readonly PendingEntry[];
  onRemove: (index: number) => void;
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
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
            )}
            <PendingEntryRow entry={entry} onRemove={() => onRemove(index)} />
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
                <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
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
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 18 },
  empty: { fontSize: 15, lineHeight: 21 },
  confirmBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  confirm: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  confirmLabel: { fontSize: 17, fontWeight: '600' },
});
