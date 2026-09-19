import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import { exercise } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import { Text } from '@/core/ui/text';
import { CardRow } from '@/core/ui/list-card';
import { VIRTUAL_LIST_PROPS } from '@/core/ui/virtual-list';
import { useTheme } from '@/core/theme';
import { SearchField } from '@/features/nutrition/components/search-field';
import { catalogMediaUri, offerableCatalog } from '../catalog/exercises';
import { ExerciseDrawing } from '../components/exercise-drawing';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { installCatalogExercises, installedCatalogNames } from '../data/catalog-writes';
import { useProgressionIncrement } from '../data/exercise-queries';
import {
  NO_FILTER,
  availableEquipment,
  availableMuscles,
  isFiltering,
  searchExercises,
  type ExerciseFilter,
} from '../domain/exercise-search';
import { equipmentLabel, muscleLabel } from '../domain/vocabulary';

/**
 * The exercises a library can still be offered (specs 10.1).
 *
 * ## WHAT IS ALREADY IN THE LIBRARY IS NOT SHOWN AT ALL
 *
 * It used to be listed and disabled, with "Déjà là" where the tick goes — so
 * the screen could be opened twice without the second visit looking like it
 * would duplicate everything. Requested changed (specs 14.36): they are
 * FILTERED OUT.
 *
 * The reason the old display existed went with the default catalogue. When a
 * library held what somebody had typed, "already there" was a handful of rows
 * and saying so was information. It now holds five hundred and fifty-two by
 * default, so listing them would make this screen mostly a list of things you
 * cannot do anything with — and the answer to "will this duplicate?" is better
 * given by not offering the duplicate at all.
 *
 * Nothing is lost that the library does not already show: an exercise you have
 * is on the Exercices tab, which is where you would look for it.
 *
 * ## THE LIST IS WINDOWED RATHER THAN CAPPED
 *
 * It used to draw the first forty and say how many more matched, because D16
 * refused a virtualised list. Requested changed for the same reason on both
 * screens: a cap makes you filter before you can browse. See
 * core/ui/virtual-list.ts for what each number does and what the amendment
 * covers.
 *
 * ## NOTHING IS TICKED, AND THAT REVERSES THE FIRST VERSION
 *
 * When the catalogue held thirty-three hand-named exercises, everything was
 * ticked and the button installed the lot: asking thirty-three questions
 * instead of one was the same wall in a different shape. At eight hundred and
 * seventy-six the same default would be absurd, so the screen is a SEARCH.
 */
export function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const increment = useProgressionIncrement();

  const already = useQuery<Set<string>>({
    queryKey: ['exercise', 'catalog', 'installed'],
    queryFn: () => installedCatalogNames(getAppDatabase()),
    meta: readsFrom(exercise),
  });
  const installed = useMemo(() => already.data ?? new Set<string>(), [already.data]);

  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);
  /** Ticked keys. Empty by default — see the note above. */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const install = useMutation({
    mutationFn: (keys: readonly string[]) =>
      Promise.resolve(installCatalogExercises(getAppDatabase(), keys, increment.data ?? 2.5)),
  });

  /**
   * The catalogue as the search understands it, minus what is already held.
   *
   * SearchableExercise wants an isFavorite, which a catalogue entry has no
   * business carrying — it is a flag about YOUR library, and nothing here is in
   * it. Zero for all, which the ranking then has nothing to do with: the
   * favourites-first rule is about a library, and this is not one.
   *
   * The subtraction happens here rather than in the render so that the filter
   * strips below offer the muscles and equipment of what CAN still be added.
   * A filter chip that returns nothing is a control that looks broken.
   */
  const offerable = useMemo(
    () => offerableCatalog(installed).map((entry) => ({ ...entry, isFavorite: 0 as const })),
    [installed],
  );
  const available = useMemo(
    () => ({ muscles: availableMuscles(offerable), equipment: availableEquipment(offerable) }),
    [offerable],
  );

  const shown = useMemo(() => searchExercises(offerable, term, filter), [offerable, term, filter]);
  const chosen = [...picked];
  const idle = term.trim() === '' && !isFiltering(filter);

  function toggle(key: string): void {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Ajouter des exercices' }} />
      <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
        <FlatList
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          {...VIRTUAL_LIST_PROPS}
          data={shown}
          keyExtractor={(entry) => entry.key}
          /*
            An ELEMENT, never an inline `() => <Header/>`. A function is a new
            component type on every render, so React remounts the subtree — and
            this subtree holds the search field, which would lose focus on every
            keystroke.
          */
          ListHeaderComponent={
            <View style={styles.headerChrome}>
              <Text style={[styles.intro, { color: theme.colors.textMuted }]}>
                {offerable.length === 0
                  ? 'Tout le catalogue est déjà dans votre bibliothèque.'
                  : `${offerable.length} exercices que vous n’avez pas encore. Les vôtres ne sont pas listés ici.`}
              </Text>

              <SearchField value={term} onChange={setTerm} />
              {/*
                Directly under the field it narrows, as in the library and the
                add window: read top down it says "look for this — among these".
              */}
              <ExerciseFilterStrips available={available} filter={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {/*
                Three different nothings, and they need different words. "Nothing
                matches" on a screen nobody has searched yet would read as a
                broken catalogue, and so would it on a library that already
                holds everything.
              */}
              {offerable.length === 0
                ? 'Rien à ajouter.'
                : idle
                  ? 'Cherchez un exercice, ou filtrez par muscle et matériel.'
                  : 'Aucun exercice ne correspond.'}
            </Text>
          }
          renderItem={({ item, index }) => {
            const ticked = picked.has(item.key);
            return (
              <CardRow first={index === 0} last={index === shown.length - 1}>
                <Pressable
                  onPress={() => toggle(item.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked }}
                  accessibilityLabel={item.name}
                  style={styles.row}
                >
                  <View style={styles.thumb}>
                    <ExerciseDrawing mediaUri={catalogMediaUri(item.key)} height={44} />
                  </View>
                  <View style={styles.texts}>
                    <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
                    <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
                      {[muscleLabel(item.primaryMuscle), equipmentLabel(item.equipment)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <SymbolView
                    name={ticked ? 'checkmark.circle.fill' : 'circle'}
                    tintColor={ticked ? theme.colors.accent : theme.colors.textFaint}
                    size={22}
                    fallback={
                      <Text style={{ color: theme.colors.accent }}>{ticked ? '☑' : '☐'}</Text>
                    }
                  />
                </Pressable>
              </CardRow>
            );
          }}
        />

        {/*
          PINNED, not a list footer.

          The button carries the count of what is TICKED, not of what is on
          screen — narrowing the search after ticking must not quietly drop what
          was already chosen, so the selection outlives the term and the
          filters. And in a windowed list of eight hundred rows, a footer would
          mean scrolling to the end of the catalogue to confirm three ticks.
        */}
        <View
          style={[
            styles.bar,
            { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border },
          ]}
        >
          <Pressable
            onPress={() => install.mutate(chosen, { onSuccess: () => router.back() })}
            disabled={chosen.length === 0 || install.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.lg,
                opacity: chosen.length === 0 || pressed || install.isPending ? 0.5 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.colors.onAccent, fontSize: 16, fontWeight: '600' }}>
              {chosen.length === 0
                ? 'Cochez des exercices'
                : chosen.length === 1
                  ? 'Ajouter 1 exercice'
                  : `Ajouter ${chosen.length} exercices`}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  // Spacing lives on the chrome rather than on the content container: a gap
  // there would also space the rows apart and break the card the CardRow edges
  // draw.
  headerChrome: { gap: 14, paddingBottom: 14 },
  intro: { fontSize: 14, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 56 },
  // A fixed width, so a photograph and a substitute leave the names on one column.
  thumb: { width: 62 },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24 },
  bar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primary: { paddingVertical: 14, alignItems: 'center' },
});
