import { useMemo, useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { EmptyState } from '@/core/ui/empty-state';
import { ListSeparator } from '@/core/ui/list-separator';
import { Segmented } from '@/core/ui/segmented';
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
 * control, and refused it: Routines and Exercices became two SECTIONS of one
 * scrolling page (specs 14.20 no 2).
 *
 * REQUESTED AND REVERSED (specs 14.35). The page is what specs 7 described in
 * the first place, and the objection did not survive the catalogue: with five
 * hundred exercises in the library, "two sections of one page" means scrolling
 * past a routine list to reach a search field, every time. The moment a section
 * is long enough that you never see the other one, it was already a tab.
 *
 * ## AND ONLY THE CHOSEN PANEL IS MOUNTED, WHICH IS THE POINT
 *
 * Each panel holds its OWN query. Not tidiness: a panel that is not mounted
 * does not read, so opening Entraînement no longer costs the exercise list, the
 * routine list and the session list at once. It is the arrangement Stats
 * settled in slice 8, for the same reason.
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

const PANELS = [
  { value: 'exercises', label: 'Exercices' },
  { value: 'routines', label: 'Routines' },
  { value: 'sessions', label: 'Séances' },
] as const;

type Panel = (typeof PANELS)[number]['value'];

/**
 * How many exercise rows are drawn at once.
 *
 * ## THIS IS A PERFORMANCE FIX, NOT A PREFERENCE
 *
 * The library used to hold what somebody had typed; it now holds five hundred
 * and fifty-two by default, and every row carries a photograph. Rendering them
 * all meant decoding five hundred and fifty-two JPEGs to open a tab — reported
 * from the device as "l'app est beaucoup plus lente".
 *
 * D16 refuses a specialised list library — a few hundred rows at most, standard
 * views — so the answer is not virtualisation, it is showing fewer and SAYING
 * SO. Exactly what the catalogue screen settled at the same number, and
 * narrowing is one tap away in the search field and the filters directly above.
 */
const MAX_SHOWN = 40;

export function TrainingScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [section, setSection] = useState<Section>('strength');
  const [panel, setPanel] = useState<Panel>('exercises');

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
          <Segmented options={PANELS} value={panel} onChange={setPanel} grow />

          {panel === 'exercises' ? <ExercisesPanel theme={theme} router={router} /> : null}
          {panel === 'routines' ? <RoutinesPanel theme={theme} router={router} /> : null}
          {panel === 'sessions' ? <SessionsPanel theme={theme} router={router} /> : null}
        </>
      )}
    </ScrollView>
  );
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

function Card({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
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
      {children}
    </View>
  );
}

function ExercisesPanel({ theme, router }: { theme: Theme; router: Router }) {
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);

  const exercises = useExercises();
  const setFavorite = useSetExerciseFavorite();

  const held = useMemo(() => exercises.data ?? [], [exercises.data]);
  const matched = useMemo(() => searchExercises(held, term, filter), [held, term, filter]);
  const available = useMemo(
    () => ({ muscles: availableMuscles(held), equipment: availableEquipment(held) }),
    [held],
  );
  const shown = matched.slice(0, MAX_SHOWN);

  return (
    <>
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

      {shown.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          {emptyListMessage({
            held: held.length,
            term: term.trim(),
            filtering: isFiltering(filter),
          })}
        </Text>
      ) : (
        <Card theme={theme}>
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
        </Card>
      )}

      {matched.length > shown.length ? (
        <Text style={[styles.more, { color: theme.colors.textMuted }]}>
          {matched.length - shown.length} autres correspondent. Affinez la recherche ou les
          filtres.
        </Text>
      ) : null}
    </>
  );
}

function RoutinesPanel({ theme, router }: { theme: Theme; router: Router }) {
  const routines = useRoutines();
  const held = routines.data ?? [];

  return (
    <>
      <PanelHead
        theme={theme}
        title="Routines"
        actionLabel="Nouvelle routine"
        onAction={() => router.push('/(modals)/routine-edit')}
      />

      {held.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Aucune routine. Touchez + pour en bâtir une.
        </Text>
      ) : (
        <Card theme={theme}>
          {held.map((routine, index) => (
            <View key={routine.id}>
              {index === 0 ? null : <ListSeparator />}
              <RoutineRow
                routine={routine}
                onPress={() => router.push(`/(tabs)/training/routine/${routine.id}`)}
              />
            </View>
          ))}
        </Card>
      )}
    </>
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
function SessionsPanel({ theme, router }: { theme: Theme; router: Router }) {
  const sessions = useSessions();
  const held = sessions.data ?? [];

  if (held.length === 0) {
    return (
      <EmptyState
        symbol="figure.strengthtraining.traditional"
        title="Aucune séance"
        message="Ouvrez une routine et touchez « Commencer » pour en enregistrer une."
        note="Les séances terminées resteront ici."
      />
    );
  }

  return (
    <Card theme={theme}>
      {held.map((session, index) => (
        <View key={session.id}>
          {index === 0 ? null : <ListSeparator />}
          <SessionRow
            session={session}
            onPress={
              session.status === 'in_progress'
                ? () => router.push('/(tabs)/training/session')
                : undefined
            }
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  screenTitle: { fontSize: 32, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '600' },
  empty: { fontSize: 15, lineHeight: 21 },
  more: { fontSize: 13, textAlign: 'center' },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
