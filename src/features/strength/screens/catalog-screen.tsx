import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import { exercise } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { SearchField } from '@/features/nutrition/components/search-field';
import { EXERCISE_CATALOG, catalogMediaUri } from '../catalog/exercises';
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
 * The exercises a library can be offered (specs 10.1).
 *
 * ## NOTHING IS TICKED, AND THAT REVERSES THE FIRST VERSION
 *
 * When the catalogue held thirty-three hand-named exercises, everything was
 * ticked and the button installed the lot: asking thirty-three questions
 * instead of one was the same wall in a different shape.
 *
 * It holds five hundred and twenty now, and the same default would be absurd —
 * a library of five hundred exercises is not a library, it is the wger database
 * with a copy on your phone. So the screen is a SEARCH: find what you actually
 * do, tick it, add it. The reason the catalogue exists is unchanged — nobody
 * should type "Développé couché" and its muscles by hand — but at this size the
 * offer has to be "which ones", not "all of them".
 *
 * ## THE RESULTS ARE CAPPED, AND THE CAP IS VISIBLE
 *
 * Five hundred rows in a ScrollView is five hundred images decoded for a page
 * nobody reads to the end. D16 refuses a specialised list library — a few
 * hundred rows at most, standard views — so the answer is not virtualisation,
 * it is showing fewer: the first forty, with a line saying how many more match.
 * Narrowing is one tap away in the filters directly above.
 *
 * ## ALREADY-INSTALLED ENTRIES ARE SHOWN AS SUCH, BEFORE THE BUTTON
 *
 * Saying "31 installés, 2 ignorés" afterwards is a report. Saying it in advance
 * is a choice, and it is the only way the screen can be opened twice without
 * the second visit looking like it will duplicate everything.
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
   * The catalogue as the search understands it.
   *
   * SearchableExercise wants an isFavorite, which a catalogue entry has no
   * business carrying — it is a flag about YOUR library, and nothing here is in
   * it yet. Zero for all, which the ranking then has nothing to do with: the
   * favourites-first rule is about a library, and this is not one.
   */
  const searchable = useMemo(
    () => EXERCISE_CATALOG.map((entry) => ({ ...entry, isFavorite: 0 as const })),
    [],
  );
  const available = useMemo(
    () => ({ muscles: availableMuscles(searchable), equipment: availableEquipment(searchable) }),
    [searchable],
  );

  const matched = useMemo(
    () => searchExercises(searchable, term, filter),
    [searchable, term, filter],
  );
  const shown = matched.slice(0, MAX_SHOWN);
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
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.intro, { color: theme.colors.textMuted }]}>
          {EXERCISE_CATALOG.length} exercices prêts à l’emploi. Cherchez ceux que
          vous faites et cochez-les ; ceux que vous avez déjà ne sont pas dupliqués.
        </Text>

        <SearchField value={term} onChange={setTerm} />
        {/*
          Directly under the field it narrows, as in the library and the add
          window: read top down it says "look for this — among these".
        */}
        <ExerciseFilterStrips available={available} filter={filter} onChange={setFilter} />

        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            {/*
              Two different nothings, and they need different words — the rule
              emptyListMessage settled for the library. "Nothing matches" on a
              screen nobody has searched yet would read as a broken catalogue.
            */}
            {idle
              ? 'Cherchez un exercice, ou filtrez par muscle et matériel.'
              : 'Aucun exercice ne correspond.'}
          </Text>
        ) : (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
              },
              theme.shadow,
            ]}
          >
            {shown.map((entry, index) => {
              const here = installed.has(entry.key);
              const ticked = picked.has(entry.key);
              return (
                <View key={entry.key}>
                  {index === 0 ? null : <ListSeparator />}
                  <Pressable
                    onPress={() => {
                      if (!here) toggle(entry.key);
                    }}
                    disabled={here}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ticked, disabled: here }}
                    accessibilityLabel={entry.name}
                    style={styles.row}
                  >
                    <View style={styles.thumb}>
                      <ExerciseDrawing mediaUri={catalogMediaUri(entry.key)} height={44} />
                    </View>
                    <View style={styles.texts}>
                      <Text style={[styles.name, { color: theme.colors.text }]}>{entry.name}</Text>
                      <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
                        {[muscleLabel(entry.primaryMuscle), equipmentLabel(entry.equipment)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {here ? (
                      <Text style={[styles.present, { color: theme.colors.textFaint }]}>
                        Déjà là
                      </Text>
                    ) : (
                      <SymbolView
                        name={ticked ? 'checkmark.circle.fill' : 'circle'}
                        tintColor={ticked ? theme.colors.accent : theme.colors.textFaint}
                        size={22}
                        fallback={
                          <Text style={{ color: theme.colors.accent }}>{ticked ? '☑' : '☐'}</Text>
                        }
                      />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {matched.length > shown.length ? (
          <Text style={[styles.more, { color: theme.colors.textMuted }]}>
            {matched.length - shown.length} autres correspondent. Affinez la
            recherche ou les filtres.
          </Text>
        ) : null}

        {/*
          The button carries the count of what is TICKED, not of what is on
          screen. Narrowing the search after ticking must not quietly drop what
          was already chosen, so the selection outlives the term and the filters.
        */}
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
      </ScrollView>
    </>
  );
}

/**
 * How many rows are drawn at once.
 *
 * A CHOICE with its reason beside it, like PANEL_LOADING_MS. Enough that a
 * filter on one muscle shows most of its answer; few enough that the page is
 * not five hundred decoded images. D16 refuses a virtualised list — a few
 * hundred rows at most, standard views — so the answer is to show fewer and
 * say so.
 */
const MAX_SHOWN = 40;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  intro: { fontSize: 14, lineHeight: 19 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 56 },
  // A fixed width, so a drawing and a substitute leave the names on one column.
  thumb: { width: 62 },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  present: { fontSize: 13 },
  more: { fontSize: 13, textAlign: 'center' },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24 },
  primary: { paddingVertical: 14, alignItems: 'center' },
});
