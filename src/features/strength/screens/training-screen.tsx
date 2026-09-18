import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { EmptyState } from '@/core/ui/empty-state';
import { ListSeparator } from '@/core/ui/list-separator';
import { Segmented } from '@/core/ui/segmented';
import { useTheme } from '@/core/theme';
import { SearchField } from '@/features/nutrition/components/search-field';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { ExerciseRow } from '../components/exercise-row';
import { RoutineRow } from '../components/routine-row';
import { useExercises, useSetExerciseFavorite } from '../data/exercise-queries';
import { useRoutines } from '../data/routine-queries';
import {
  availableEquipment,
  availableMuscles,
  isFiltering,
  NO_FILTER,
  searchExercises,
  type ExerciseFilter,
} from '../domain/exercise-search';
import { emptyListMessage } from '../domain/exercise-text';

/**
 * The Entrainement tab (specs 7, 10.1).
 *
 * ## ONE SEGMENTED CONTROL, NOT TWO NESTED ONES
 *
 * Specs 7 asks for "Musculation et Activités" by segmented control within a
 * single screen, and describes Musculation as holding "Routines · Exercices ·
 * Historique". Read literally that is a segmented control inside a segmented
 * control, which is a shape this application uses nowhere and which costs the
 * reader a moment every time to work out which level moved.
 *
 * So: ONE control, Musculation / Activités. Inside Musculation, Routines and
 * Exercices are two SECTIONS of one scrolling page rather than two tabs —
 * a routine is built out of exercises, and seeing both at once is how you
 * notice you need to create one. Historique arrives in slice 12 and takes its
 * place then, when there is something to put in it.
 *
 * The specs are amended in that direction rather than diverged from.
 *
 * ## NO HEADER FROM THE NAVIGATOR, AS ON STATS AND RÉGLAGES
 *
 * NativeTabs supplies none and the stack's index hides its own, so the screen
 * carries its large title itself — the arrangement slice 8 settled for Stats,
 * kept here so the four tabs look like four of the same thing.
 */

const SECTIONS = [
  { value: 'strength', label: 'Musculation' },
  { value: 'activities', label: 'Activités' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

export function TrainingScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [section, setSection] = useState<Section>('strength');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);

  const exercises = useExercises();
  const routines = useRoutines();
  const setFavorite = useSetExerciseFavorite();

  const held = useMemo(() => exercises.data ?? [], [exercises.data]);
  const shown = useMemo(() => searchExercises(held, term, filter), [held, term, filter]);
  const available = useMemo(
    () => ({ muscles: availableMuscles(held), equipment: availableEquipment(held) }),
    [held],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Entraînement</Text>

      <Segmented options={SECTIONS} value={section} onChange={setSection} grow />

      {section === 'activities' ? (
        <EmptyState
          symbol="figure.run"
          title="Aucune activité"
          message="Les activités d’endurance arrivent en V4, tirées d’intervals.icu."
          note="Cette section restera en place d’ici là."
        />
      ) : (
        <>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Routines</Text>
            <Pressable
              onPress={() => router.push('/(modals)/routine-edit')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Nouvelle routine"
            >
              <SymbolView name="plus" size={19} tintColor={theme.colors.accent} />
            </Pressable>
          </View>

          {(routines.data ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              Aucune routine. Touchez + pour en bâtir une.
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
              {(routines.data ?? []).map((routine, index) => (
                <View key={routine.id}>
                  {index === 0 ? null : <ListSeparator />}
                  <RoutineRow
                    routine={routine}
                    onPress={() => router.push(`/(tabs)/training/routine/${routine.id}`)}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Exercices</Text>
            <Pressable
              onPress={() => router.push('/(modals)/exercise-edit')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Nouvel exercice"
            >
              <SymbolView name="plus" size={19} tintColor={theme.colors.accent} />
            </Pressable>
          </View>

          <SearchField value={term} onChange={setTerm} />

          {/*
            Directly under the field it narrows, as in the library and the add
            window: read top down it says "look for this — among these".
          */}
          <ExerciseFilterStrips available={available} filter={filter} onChange={setFilter} />

          {shown.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {emptyListMessage({
                held: held.length,
                term: term.trim(),
                filtering: isFiltering(filter),
              })}
            </Text>
          ) : null}

          {/*
            THE CATALOGUE, AND WHY IT IS A LINK RATHER THAN A DIALOG.

            Specs 10.1 describes a library with a creation button and nothing
            else, so a fresh installation starts empty — the one place in the
            application that asks for a quarter of an hour before it serves.
            Thirty-three exercises are offered instead of typed.

            NOT installed on first launch, and not a seed in `0010`: a migration
            is replayed by every import (G4), so a seed would reinject these
            rows into an archive that deliberately held none, with fresh ULIDs.
            The rule since slice 4 covers the rest — what the user SAVES is
            written, what they merely look at is not.

            PROMINENT WHEN THE LIBRARY IS EMPTY, quiet afterwards, never gone:
            somebody who took ten and wants the other twenty-three later should
            not have to empty their library to be offered them again.
          */}
          {held.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/training/catalog')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.catalogPrimary,
                {
                  backgroundColor: theme.colors.accent,
                  borderRadius: theme.radius.lg,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.onAccent, fontSize: 16, fontWeight: '600' }}>
                Ajouter des exercices courants
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/(tabs)/training/catalog')}
              accessibilityRole="button"
              style={styles.catalogQuiet}
              hitSlop={6}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
                Ajouter des exercices courants
              </Text>
            </Pressable>
          )}

          {shown.length === 0 ? null : (
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
              {shown.map((exercise, index) => (
                <View key={exercise.id}>
                  {index === 0 ? null : <ListSeparator />}
                  <ExerciseRow
                    exercise={exercise}
                    onPress={() => router.push(`/(tabs)/training/exercise/${exercise.id}`)}
                    onToggleFavorite={() =>
                      setFavorite.mutate({
                        id: exercise.id,
                        isFavorite: exercise.isFavorite !== 1,
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  screenTitle: { fontSize: 32, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '600' },
  catalogPrimary: { paddingVertical: 14, alignItems: 'center' },
  catalogQuiet: { paddingVertical: 6, alignItems: 'center' },
  empty: { fontSize: 15, lineHeight: 21 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
