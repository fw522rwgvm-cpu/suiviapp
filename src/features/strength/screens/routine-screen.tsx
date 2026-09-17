import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { toEntityId } from '@/core/id';
import type { RoutineId } from '@/core/db/schema';
import { BodyMapView } from '../components/body-map-view';
import { SetTable } from '../components/set-table';
import { useDeleteRoutine, useRoutine } from '../data/routine-queries';
import type { RoutineBlockView } from '../data/routine-reads';
import type { BlockDraft, LineDraft } from '../domain/routine-draft';
import { blockTitle, restText } from '../domain/routine-text';
import { restForBlock } from '../domain/routine-draft';

/**
 * The page of one routine (specs 10.2).
 *
 * > Présentation identique à la création, non éditable.
 * > Toucher un exercice ouvre sa page.
 * > Carte corporelle des muscles travaillés.
 *
 * "Identique à la création" is taken literally: the same SetRow renders here
 * and in the editor, with `editable` deciding whether it can be swiped. Two
 * components drawing one row is how the page and the form start disagreeing
 * about what a set says — and this row states a rest the BLOCK may own, which
 * is precisely the kind of thing that drifts.
 *
 * ## WHAT IS NOT HERE: THE START BUTTON
 *
 * Specs 10.2 lists "démarrage, édition, suppression". Starting needs a session,
 * which is slice 11's table. A button that did nothing would be worse than its
 * absence. The other two are here.
 */
export function RoutineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = toEntityId<RoutineId>(params.id ?? '');

  const routine = useRoutine(id);
  const remove = useDeleteRoutine();
  const [deleting, setDeleting] = useState(false);

  if (id === null) return <Missing />;

  // undefined is "not answered yet"; null is "no such routine".
  if (routine.data === undefined) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }
  if (routine.data === null) return <Missing />;

  const view = routine.data;

  function confirmDelete() {
    if (id === null) return;
    /**
     * A plain confirmation, without the warning specs 5.3 reserves for an
     * exercise. Deleting a routine destroys nothing that cannot be rebuilt:
     * the exercises it pointed at are untouched, and no history hangs off it —
     * session_set will copy its targets rather than link to them.
     */
    Alert.alert(`Supprimer « ${view.name} » ?`, 'Les exercices ne sont pas supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          remove.mutate(id, {
            onSuccess: () => router.back(),
            onError: () => setDeleting(false),
          });
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: view.name,
          headerRight: () => (
            // A bare Pressable, never a GlassButton: the bar already lays its
            // own material behind what it is given.
            <Pressable
              onPress={() => router.push(`/(modals)/routine-edit?id=${view.id}`)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Modifier"
            >
              <SymbolView name="pencil" size={19} tintColor={theme.colors.accent} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
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
          <BodyMapView muscles={view.muscles} />
        </View>

        {view.warmupSteps.length === 0 ? null : (
          <Section title="ÉCHAUFFEMENT">
            {view.warmupSteps.map((step, index) => (
              <View key={`${index}-${step}`}>
                {index === 0 ? null : <ListSeparator />}
                <View style={styles.step}>
                  <Text style={[styles.stepText, { color: theme.colors.text }]}>{step}</Text>
                </View>
              </View>
            ))}
          </Section>
        )}

        {view.blocks.map((block) => {
          const draft = toBlockDraft(block);
          const title = blockTitle(block.lines.map((line) => line.exerciseName));

          return (
            <Section
              key={block.id}
              title={title ?? exerciseNameOf(block)}
              subdued={title === null}
              onPressTitle={() => {
                const first = block.lines[0];
                if (first !== undefined) {
                  router.push(`/(tabs)/training/exercise/${first.exerciseId}`);
                }
              }}
            >
              <SetTable
                block={draft}
                tracksDuration={block.lines[0]?.tracksDuration === 1}
                editable={false}
              />

              {/*
                The rest sits UNDER the sets, once, because it belongs to the
                block in every shape — between rounds of a superset, between
                sets of a single exercise. It left the row when the four target
                columns needed the width.
              */}
              {restForBlock(draft) === null ? null : (
                <View style={styles.blockRest}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                    {`Repos : ${restText(restForBlock(draft) ?? 0)}`}
                  </Text>
                </View>
              )}
            </Section>
          );
        })}

        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.delete,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              opacity: pressed || deleting ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>
            Supprimer la routine
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

/**
 * The view's block in the draft shape SetRow and restForLine both read.
 *
 * No assertion anywhere: routine-reads.ts narrows exerciseId and setType at the
 * point they enter the application, so this is a plain reshape — the page and
 * the editor hand SetRow exactly the same thing, which is what keeps the two
 * from drifting about what a set says.
 */
function toBlockDraft(block: RoutineBlockView): BlockDraft {
  return {
    id: block.id,
    restSeconds: block.restSeconds,
    lines: block.lines.map(
      (line): LineDraft => ({
        id: line.id,
        exerciseId: line.exerciseId,
        exerciseName: line.exerciseName,
        setType: line.setType,
        repsMin: line.repsMin,
        repsMax: line.repsMax,
        targetLoadKg: line.targetLoadKg,
        targetRir: line.targetRir,
        durationSeconds: line.durationSeconds,
        restSeconds: line.restSeconds,
        progressionEnabled: line.progressionEnabled === 1,
        // A text field cannot hold absence; the row renders nothing for ''.
        note: line.note ?? '',
      }),
    ),
  };
}

function exerciseNameOf(block: { lines: { exerciseName: string }[] }): string {
  return block.lines[0]?.exerciseName ?? 'Bloc';
}

function Section({
  title,
  subdued,
  onPressTitle,
  children,
}: {
  title: string;
  subdued?: boolean;
  /**
   * Specs 10.2: "Toucher un exercice ouvre sa page".
   *
   * It moved from the row to the TITLE when the rows became a table: a cell is
   * a number, and a press spanning four of them would fight the swipe that
   * removes the set. The title names the exercise, so it is what a reader would
   * touch to mean "that exercise".
   */
  onPressTitle?: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const heading = (
    <Text
      style={[
        styles.sectionTitle,
        { color: subdued === true ? theme.colors.text : theme.colors.accent },
      ]}
    >
      {title}
    </Text>
  );

  return (
    <View style={styles.section}>
      {onPressTitle === undefined ? (
        heading
      ) : (
        <Pressable onPress={onPressTitle} accessibilityRole="button" hitSlop={6}>
          {heading}
        </Pressable>
      )}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            overflow: 'hidden',
          },
          theme.shadow,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function Missing() {
  const theme = useTheme();
  return (
    <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
      <Text style={{ color: theme.colors.textMuted }}>Cette routine n’existe plus.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 56 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 0 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  step: { paddingVertical: 11, paddingHorizontal: 14 },
  stepText: { fontSize: 15 },
  blockRest: { paddingVertical: 9, paddingHorizontal: 14 },
  delete: { paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteLabel: { fontSize: 16, fontWeight: '500' },
});
