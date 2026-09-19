import { useMemo, useState } from 'react';
import { ActionSheetIOS, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { CardRow } from '@/core/ui/list-card';
import { EmptyState } from '@/core/ui/empty-state';
import { Segmented } from '@/core/ui/segmented';
import { VIRTUAL_LIST_PROPS } from '@/core/ui/virtual-list';
import { useTheme, type Theme } from '@/core/theme';
import { SearchField } from '@/features/nutrition/components/search-field';
import { ExerciseFilterStrips } from '../components/exercise-filter';
import { ExerciseRow } from '../components/exercise-row';
import { RoutineRow } from '../components/routine-row';
import { SessionRow } from '../components/session-row';
import { useExercises, useSetExerciseFavorite } from '../data/exercise-queries';
import { useRoutines } from '../data/routine-queries';
import { useSessions } from '../data/session-queries';
import {
  availableEquipment,
  availableMuscles,
  isFiltering,
  NO_FILTER,
  searchExercises,
  type ExerciseFilter,
} from '../domain/exercise-search';
import { emptyListMessage } from '../domain/exercise-text';

/** expo-router does not export its router type; this is the one useRouter gives. */
type Router = ReturnType<typeof useRouter>;

/**
 * The Entrainement tab (specs 7, 10.1, 10.3).
 *
 * ## TWO LEVELS OF SEGMENTED CONTROL, WHICH REVERSES SLICE 10
 *
 * Specs 7 asks for "Musculation et Activités" by segmented control, and
 * describes Musculation as holding "Routines · Exercices · Historique". Slice
 * 10 read that literally, called it a segmented control inside a segmented
 * control, and refused it (specs 14.20 no 2). REQUESTED AND REVERSED (specs
 * 14.35): with five hundred exercises in the library, "two sections of one
 * page" means scrolling past a routine list to reach a search field, every
 * time. The moment a section is long enough that you never see the other one,
 * it was already a tab.
 *
 * ## THE SCREEN IS ALWAYS A FlatList, IN EVERY STATE
 *
 * Never a ScrollView in one branch and a list in another. Two reasons, and the
 * second is the one that would have cost a day:
 *
 * - a VirtualizedList inside a plain ScrollView of the same axis does not
 *   virtualise at all — it renders everything and warns about it, which is the
 *   exact opposite of what this screen is for;
 * - swapping the element type between two states is what slice 3 found made the
 *   day page jump: React unmounts one scroller and mounts another, and UIKit
 *   recomputes a fresh content inset. Here the states are tabs rather than
 *   loading, but the mechanism is the same one.
 *
 * So Activités is an empty list with a message, not a different kind of page.
 *
 * ## ONLY THE CHOSEN PANEL IS MOUNTED, WHICH IS WHY EACH HOLDS ITS OWN QUERY
 *
 * Not tidiness: a panel that is not mounted does not read, so opening
 * Entraînement no longer costs the exercise list, the routine list and the
 * session list at once. The arrangement Stats settled in slice 8.
 *
 * ## NO HEADER FROM THE NAVIGATOR, AS ON STATS AND RÉGLAGES
 *
 * NativeTabs supplies none and the stack's index hides its own, so the screen
 * carries its large title itself — in the LIST HEADER, so it scrolls away
 * instead of costing three hundred points of permanent chrome above a list this
 * long.
 */

const SECTIONS = [
  { value: 'strength', label: 'Musculation' },
  { value: 'activities', label: 'Activités' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

const PANELS = [
  { value: 'exercises', label: 'Exercices' },
  { value: 'routines', label: 'Routines' },
  { value: 'sessions', label: 'Séances' },
] as const;

type Panel = (typeof PANELS)[number]['value'];

export function TrainingScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [section, setSection] = useState<Section>('strength');
  const [panel, setPanel] = useState<Panel>('exercises');

  /**
   * The chrome every panel puts at the top of its own list.
   *
   * An ELEMENT, never an inline `() => <Chrome/>`. A function passed to
   * `ListHeaderComponent` is a NEW component type on every render, so React
   * unmounts and remounts the subtree — and the subtree holds a TextInput,
   * which means the search field would lose focus on every keystroke. Passing
   * an element keeps the type stable and reconciles in place.
   */
  const chrome = (
    <View style={styles.chrome}>
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Entraînement</Text>
      <Segmented options={SECTIONS} value={section} onChange={setSection} grow />
      {section === 'strength' ? (
        <Segmented options={PANELS} value={panel} onChange={setPanel} grow />
      ) : null}
    </View>
  );

  if (section === 'activities') {
    return (
      <FlatList
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        data={[]}
        keyExtractor={() => 'none'}
        renderItem={null}
        ListHeaderComponent={chrome}
        ListEmptyComponent={
          <EmptyState
            symbol="figure.run"
            title="Aucune activité"
            message="Les activités d’endurance arrivent en V4, tirées d’intervals.icu."
            note="Cette section restera en place d’ici là."
          />
        }
      />
    );
  }

  if (panel === 'routines') return <RoutinesPanel chrome={chrome} theme={theme} router={router} />;
  if (panel === 'sessions') return <SessionsPanel chrome={chrome} theme={theme} router={router} />;
  return <ExercisesPanel chrome={chrome} theme={theme} router={router} />;
}

/**
 * The two ways to gain an exercise, behind one "+".
 *
 * REPLACES THE "Parcourir le catalogue" LINK, which was a second control saying
 * the same thing in a different place — and a link at the bottom of a list is
 * not where somebody looks when they want to add something. The "+" is where
 * every other list in this application puts that action.
 *
 * A sheet rather than a screen because it is a fork, not a step: ActionSheetIOS
 * is a real UIAlertController, which is the iOS 26 direction applied as
 * written — the chrome belongs to the system. Same control slice 5 used to
 * choose a day template.
 */
function offerExerciseSources(router: Router): void {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Annuler', 'Créer un exercice', 'Ajouter depuis le catalogue'],
      cancelButtonIndex: 0,
      title: 'Ajouter un exercice',
    },
    (index) => {
      if (index === 1) router.push('/(modals)/exercise-edit');
      if (index === 2) router.push('/(tabs)/training/catalog');
    },
  );
}

function PanelHead({
  theme,
  title,
  actionLabel,
  onAction,
}: {
  theme: Theme;
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      <Pressable
        onPress={onAction}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <SymbolView name="plus" size={19} tintColor={theme.colors.accent} />
      </Pressable>
    </View>
  );
}

function ExercisesPanel({
  chrome,
  theme,
  router,
}: {
  chrome: React.ReactElement;
  theme: Theme;
  router: Router;
}) {
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
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...VIRTUAL_LIST_PROPS}
      data={shown}
      keyExtractor={(exercise) => exercise.id}
      ListHeaderComponent={
        <>
          {chrome}
          <View style={styles.panelChrome}>
            <PanelHead
              theme={theme}
              title="Exercices"
              actionLabel="Ajouter un exercice"
              onAction={() => offerExerciseSources(router)}
            />
            <SearchField value={term} onChange={setTerm} />
            {/*
              Directly under the field it narrows, as in the library and the add
              window: read top down it says "look for this — among these".
            */}
            <ExerciseFilterStrips available={available} filter={filter} onChange={setFilter} />
          </View>
        </>
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          {emptyListMessage({
            held: held.length,
            term: term.trim(),
            filtering: isFiltering(filter),
          })}
        </Text>
      }
      renderItem={({ item, index }) => (
        <CardRow first={index === 0} last={index === shown.length - 1}>
          <ExerciseRow
            exercise={item}
            onPress={() => router.push(`/(tabs)/training/exercise/${item.id}`)}
            onToggleFavorite={() =>
              setFavorite.mutate({ id: item.id, isFavorite: item.isFavorite !== 1 })
            }
          />
        </CardRow>
      )}
    />
  );
}

function RoutinesPanel({
  chrome,
  theme,
  router,
}: {
  chrome: React.ReactElement;
  theme: Theme;
  router: Router;
}) {
  const routines = useRoutines();
  const held = routines.data ?? [];

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      {...VIRTUAL_LIST_PROPS}
      data={held}
      keyExtractor={(routine) => routine.id}
      ListHeaderComponent={
        <>
          {chrome}
          <View style={styles.panelChrome}>
            <PanelHead
              theme={theme}
              title="Routines"
              actionLabel="Nouvelle routine"
              onAction={() => router.push('/(modals)/routine-edit')}
            />
          </View>
        </>
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Aucune routine. Touchez + pour en bâtir une.
        </Text>
      }
      renderItem={({ item, index }) => (
        <CardRow first={index === 0} last={index === held.length - 1}>
          <RoutineRow
            routine={item}
            onPress={() => router.push(`/(tabs)/training/routine/${item.id}`)}
          />
        </CardRow>
      )}
    />
  );
}

/**
 * Every session, finished and running (specs 10.3).
 *
 * NO "+" HERE, and the absence is the point: a session is started FROM a
 * routine, which is where the button lives. One that could be started from this
 * list would have to ask which routine — a question the routine page has
 * already answered by being open.
 */
function SessionsPanel({
  chrome,
  theme,
  router,
}: {
  chrome: React.ReactElement;
  theme: Theme;
  router: Router;
}) {
  const sessions = useSessions();
  const held = sessions.data ?? [];

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      {...VIRTUAL_LIST_PROPS}
      data={held}
      keyExtractor={(session) => session.id}
      ListHeaderComponent={chrome}
      ListEmptyComponent={
        <EmptyState
          symbol="figure.strengthtraining.traditional"
          title="Aucune séance"
          message="Ouvrez une routine et touchez « Commencer » pour en enregistrer une."
          note="Les séances terminées resteront ici."
        />
      }
      renderItem={({ item, index }) => (
        <CardRow first={index === 0} last={index === held.length - 1}>
          <SessionRow
            session={item}
            onPress={
              item.status === 'in_progress'
                ? () => router.push('/(tabs)/training/session')
                : undefined
            }
          />
        </CardRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 56 },
  // The chrome and the panel chrome carry their own spacing, because the list's
  // content container cannot: a gap there would also space the rows apart and
  // break the card the CardRow edges draw.
  chrome: { gap: 16, paddingBottom: 16 },
  panelChrome: { gap: 16, paddingBottom: 16 },
  screenTitle: { fontSize: 32, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '600' },
  empty: { fontSize: 15, lineHeight: 21 },
});
