import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { HeaderTextButton } from '@/core/ui/header-text-button';
import type { FoodId } from '@/core/db/schema';
import { useFavoriteFoods, useFoods, useRecentFoods } from '../data/food-queries';
import type { FoodListItem } from '../data/food-reads';
import { searchFoods } from '../domain/food-search';
import { FoodRow } from '../components/food-row';
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
 * BOTH INNER STEPS ARE STATE HERE, NOT SEPARATE MODALS — the quantity of a
 * chosen food, and free entry.
 *
 * D16 budgets 0,2 s from choosing a food to the quantity screen, and the exit
 * criterion of this slice is two taps. Swapping the content of a modal already
 * on screen costs a render; pushing a second modal costs a presentation
 * animation, and stacks two dismissals on the way out. The quantity screen
 * still exists as a route of its own — specs 3 asks for it, and the Journal
 * opens it when an already-logged food is tapped — but the fast path does not
 * travel through the router.
 *
 * Free entry works the same way, and used to not: it was a router.replace onto
 * its own modal, which meant the way back landed on the Journal rather than on
 * this list. One tap to reach it, one to leave it, and the whole "add
 * something" journey stays in one screen.
 *
 * WHAT IS DELIBERATELY ABSENT. Recipes (slice 6) and recent meals both belong
 * to 8.4a and neither is here: section 7 scopes this slice to the personal
 * food database. Open Food Facts results (8.4b) arrive in slice 4 and will
 * append a second section below "Mes aliments" — which is why the personal
 * results already sit under a heading rather than in a bare list.
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

  const foods = useFoods();
  const favorites = useFavoriteFoods();
  const recents = useRecentFoods();

  const searching = term.trim() !== '';
  const results = useMemo(
    () => (searching ? searchFoods(foods.data ?? [], term) : []),
    [foods.data, term, searching],
  );

  if (freeEntry && mealPosition !== null) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Saisie libre',
            headerLeft: () => (
              <HeaderTextButton
                symbol="chevron.left"
                label="Aliments"
                onPress={() => setFreeEntry(false)}
              />
            ),
          }}
        />
        <FreeEntryScreen date={date} mealPosition={mealPosition} entryId={null} />
      </>
    );
  }

  if (chosen !== null && mealPosition !== null) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Quantité',
            /**
             * BACK TO THE LIST, not out of the modal.
             *
             * The quantity step is state rather than a pushed route (D16: the
             * budget from choosing a food to this screen is 0,2 s), and state
             * gets no back button from the navigator. Without this, choosing
             * the wrong food means closing the modal and starting again —
             * which is three taps to undo one.
             */
            headerLeft: () => (
              <HeaderTextButton
                symbol="chevron.left"
                label="Aliments"
                onPress={() => setChosen(null)}
              />
            ),
          }}
        />
        <QuantityScreen
          mode="add"
          date={date}
          mealPosition={mealPosition}
          foodId={chosen}
          onDone={() => router.back()}
        />
      </>
    );
  }

  const empty =
    !searching &&
    (favorites.data?.length ?? 0) === 0 &&
    (recents.data?.length ?? 0) === 0 &&
    (foods.data?.length ?? 0) === 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ajouter',
          // A full-screen modal is the root of its own presentation: the stack
          // draws no back button and iOS offers no swipe-down. Without this
          // there is no way out of the screen except logging something.
          headerLeft: () => (
            <HeaderTextButton label="Fermer" onPress={() => router.back()} />
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
      >
        <SearchField value={term} onChange={setTerm} />

        {/*
          One tap, from the screen shown by default (specs 8.4d). It stays at
          the top rather than at the bottom of a list that grows: the fastest
          path must not move as the food database fills up.
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
          <SymbolView name="square.and.pencil" size={18} tintColor={theme.colors.accent} />
          <Text style={[styles.freeEntryLabel, { color: theme.colors.accent }]}>
            Saisie libre
          </Text>
        </Pressable>

        {empty ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Aucun aliment en bibliothèque. Utilisez la saisie libre, ou créez un
            aliment depuis l’icône de bibliothèque du Journal.
          </Text>
        ) : null}

        {searching ? (
          <Section title="Mes aliments" foods={results} onPick={setChosen} emptyText={
            `Aucun résultat pour « ${term.trim()} ».`
          } />
        ) : (
          <>
            <Section title="Favoris" foods={favorites.data ?? []} onPick={setChosen} />
            <Section title="Récents" foods={recents.data ?? []} onPick={setChosen} />
          </>
        )}
      </ScrollView>
    </>
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
  content: { padding: 16, gap: 18, paddingBottom: 56 },
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
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 18 },
  empty: { fontSize: 15, lineHeight: 21 },
});
