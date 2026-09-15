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
import { useExercises, useSetExerciseFavorite } from '../data/exercise-queries';
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
  empty: { fontSize: 15, lineHeight: 21 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
