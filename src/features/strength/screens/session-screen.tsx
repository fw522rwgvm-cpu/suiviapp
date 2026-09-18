import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import type { ExerciseId, SessionSetId } from '@/core/db/schema';
import type { SessionBlockView, SessionSetView, SessionView } from '../data/session-reads';
import {
  useActiveSession,
  useAddRound,
  useCompleteSet,
  useFinishSession,
  usePendingNotes,
  useRemoveSet,
  useSkipSet,
} from '../data/session-queries';
import { useDeferredSetWrites } from '../hooks/use-deferred-set-writes';
import { useLiveDuration } from '../hooks/use-live-duration';
import { useRestTimer } from '../hooks/use-rest-timer';
import { recordSet, type TypedSet } from '../domain/session-set';
import { durationText, progressText, restText } from '../domain/session-text';
import { setColumns } from '../components/set-cell';
import { LiveSetRow } from '../components/live-set-row';

/**
 * The live session (specs 10.3).
 *
 * ## WHAT IS HELD IN REACT AND WHAT IS HELD IN SQLITE
 *
 * The session is in SQLite, always — that is the whole of specs 10.3's
 * "persistance continue", and it is why a force quit costs nothing. What lives
 * here is exactly two things: which set the RIR row is attached to, and the
 * text being typed into the current row before its debounce fires.
 *
 * Neither is worth persisting and both would be wrong to. The active row is a
 * position of attention, not a fact about the workout; and the typed text is
 * already on its way to the database through the deferred rhythm of D12.
 *
 * ## THE TYPED VALUES ARE SEEDED FROM WHAT WAS WRITTEN, NOT KEPT IN PARALLEL
 *
 * A set reopened after a kill shows what the last flush stored. That is the
 * only source there is, which is what stops this screen having two answers to
 * "what is in this field" — the shape slice 4 chased out of quantity prefill.
 */
export function SessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const active = useActiveSession();
  const session = active.data ?? null;

  if (active.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <LoadingDots />
      </View>
    );
  }

  if (session === null) {
    /*
      Nothing live. Reached by a stale link or by finishing the session from
      here, and it says so rather than showing an empty workout — the three
      different nothings rule of emptyListMessage.
    */
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: 'Séance' }} />
        <Text style={{ color: theme.colors.textMuted }}>Aucune séance en cours.</Text>
      </View>
    );
  }

  return <LiveSession session={session} onLeave={() => router.back()} />;
}

function LiveSession({ session, onLeave }: { session: SessionView; onLeave: () => void }) {
  const theme = useTheme();
  const complete = useCompleteSet();
  const skip = useSkipSet();
  const remove = useRemoveSet();
  const addRound = useAddRound();
  const finish = useFinishSession();
  const writes = useDeferredSetWrites(session.id);

  const sets = useMemo(() => session.blocks.flatMap((block) => block.sets), [session.blocks]);
  const exerciseIds = useMemo(
    () =>
      [...new Set(sets.map((set) => set.exerciseId).filter((id): id is ExerciseId => id !== null))],
    [sets],
  );
  const notes = usePendingNotes(exerciseIds);

  /**
   * The set the RIR row is attached to.
   *
   * `null` means "the first one not finished", computed at render rather than
   * stored — so validating a set moves the row forward without anything having
   * to set it, and a workout done out of order still works because tapping any
   * row pins it.
   */
  const [pinned, setPinned] = useState<SessionSetId | null>(null);
  const firstOpen = sets.find((set) => set.status === 'pending')?.id ?? null;
  const activeSetId = pinned ?? firstOpen;

  /** What is being typed, keyed by set. Empty means "show the placeholders". */
  const [typing, setTyping] = useState<Record<string, TypedSet>>({});

  const liveMs = useLiveDuration(session.segments);
  const rest = useRestTimer(session.id, session.blocks);

  function typedFor(set: SessionSetView): TypedSet {
    return (
      typing[set.id] ?? {
        // Seeded from what was written, so a set reopened after a kill shows the
        // last flush rather than an empty field.
        reps: set.actualReps,
        loadKg: set.actualLoadKg,
        durationSeconds: set.actualDurationSeconds,
      }
    );
  }

  function onType(set: SessionSetView, typed: TypedSet): void {
    setTyping((current) => ({ ...current, [set.id]: typed }));
    writes.queue(set.id as SessionSetId, typed);
  }

  function onValidate(set: SessionSetView, rir: number): void {
    /*
      The pending write is flushed FIRST, so the debounce cannot land after the
      validation and overwrite what was recorded with what was in the field a
      moment earlier. The two rhythms of D12 write the same columns, so their
      order matters exactly here and nowhere else.
    */
    writes.flush();
    complete.mutate({
      setId: set.id as SessionSetId,
      sessionId: session.id,
      recorded: recordSet(
        {
          setType: set.setType,
          repsMin: set.targetRepsMin,
          repsMax: set.targetRepsMax,
          loadKg: set.targetLoadKg,
          rir: set.targetRir,
          durationSeconds: set.targetDurationSeconds,
        },
        typedFor(set),
        rir,
      ),
    });
    // Let the next unfinished set take the row.
    setPinned(null);
  }

  function confirmFinish(): void {
    const left = session.totalSets - session.doneSets;
    const question =
      left === 0
        ? 'Terminer la séance ?'
        : `Terminer la séance ? ${left === 1 ? 'Une série n’a pas été faite' : `${left} séries n’ont pas été faites`}.`;
    Alert.alert(question, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer',
        onPress: () => {
          writes.flush();
          finish.mutate(session.id, { onSuccess: onLeave });
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: session.routineName ?? 'Séance',
          headerRight: () => (
            <Pressable
              onPress={confirmFinish}
              accessibilityRole="button"
              accessibilityLabel="Terminer la séance"
              hitSlop={8}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 17 }}>Terminer</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/*
          The upper band of specs 10.3: elapsed time and sets done over total.
          Two figures and nothing else — it is read between two sets, by someone
          out of breath.
        */}
        <View
          style={[
            styles.band,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          <Figure label="Durée" value={durationText(liveMs)} />
          <Figure label="Séries" value={progressText(session.doneSets, session.totalSets)} />
          {/*
            THE REST APPEARS ONLY WHILE ONE IS RUNNING, and takes the accent.

            A third figure sitting at "0:00" between sets would be a countdown
            that is always there and almost never means anything — and the two
            figures beside it are the ones read at a glance. It arrives when a
            set is validated, which is the moment it becomes the only number
            anybody is waiting for, and leaves when it is up.

            The band does not change height with it: the placeholder keeps the
            column, so validating a set never makes the page jump under the
            thumb. Slice 8's rule from the weight card, where a card growing
            under the meals was the same defect in smaller.
          */}
          <View style={styles.figure}>
            <Text style={[styles.figureLabel, { color: theme.colors.textMuted }]}>Repos</Text>
            <Text
              style={[
                styles.figureValue,
                { color: rest.endsAt === null ? theme.colors.textFaint : theme.colors.accent },
              ]}
            >
              {rest.endsAt === null ? '—' : restText(rest.remainingMs)}
            </Text>
          </View>
        </View>

        {session.blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            notes={notes.data ?? new Map()}
            activeSetId={activeSetId}
            typedFor={typedFor}
            onActivate={(id) => setPinned(id)}
            onType={onType}
            onValidate={onValidate}
            onSkip={(set) =>
              skip.mutate({
                setId: set.id as SessionSetId,
                sessionId: session.id,
                skipped: set.status !== 'skipped',
              })
            }
            onRemove={(set) =>
              remove.mutate({ setId: set.id as SessionSetId, sessionId: session.id })
            }
            onAddRound={() => addRound.mutate({ blockId: block.id as never, sessionId: session.id })}
          />
        ))}

        {session.blocks.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Aucun exercice. Ajoutez-en un pour commencer.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.figureValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

/**
 * One block of the session: its exercises, its rest, its sets.
 *
 * The layout is the routine page's, deliberately — specs 14.23 no 4 settled it
 * there and a session that looked different would be a second answer to "what
 * does a block look like". Exercise names in the accent colour, rest on one
 * line under them, a table with no inner grid.
 */
function BlockCard({
  block,
  notes,
  activeSetId,
  typedFor,
  onActivate,
  onType,
  onValidate,
  onSkip,
  onRemove,
  onAddRound,
}: {
  block: SessionBlockView;
  notes: Map<string, string[]>;
  activeSetId: string | null;
  typedFor: (set: SessionSetView) => TypedSet;
  onActivate: (id: SessionSetId) => void;
  onType: (set: SessionSetView, typed: TypedSet) => void;
  onValidate: (set: SessionSetView, rir: number) => void;
  onSkip: (set: SessionSetView) => void;
  onRemove: (set: SessionSetView) => void;
  onAddRound: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  /** The distinct exercises, in the order they first appear — the round order. */
  const exercises: { id: ExerciseId | null; name: string }[] = [];
  for (const set of block.sets) {
    const key = set.exerciseId ?? set.exerciseName;
    if (!exercises.some((item) => (item.id ?? item.name) === key)) {
      exercises.push({ id: set.exerciseId, name: set.exerciseName });
    }
  }
  const superset = exercises.length > 1;
  const letters = new Map(
    exercises.map((item, index) => [item.id ?? item.name, LETTERS[index] ?? '?']),
  );

  /** A set's round: its rank for its own exercise, derived from the order. */
  function roundOf(index: number): number {
    const set = block.sets[index];
    if (set === undefined) return 1;
    const key = set.exerciseId ?? set.exerciseName;
    let rank = 0;
    for (let i = 0; i <= index; i += 1) {
      const candidate = block.sets[i];
      if (candidate !== undefined && (candidate.exerciseId ?? candidate.exerciseName) === key) {
        rank += 1;
      }
    }
    return rank;
  }

  const shownNotes = exercises.flatMap((item) =>
    item.id === null ? [] : (notes.get(item.id) ?? []),
  );

  return (
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
      {/* A superset carries a rail, as the routine page draws it. */}
      {superset ? (
        <View style={[styles.rail, { backgroundColor: theme.colors.accent }]} />
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.titles}>
          {exercises.map((item, index) => (
            <Pressable
              key={item.id ?? item.name}
              disabled={item.id === null}
              onPress={() => router.push(`/training/exercise/${item.id ?? ''}`)}
              accessibilityRole={item.id === null ? 'text' : 'link'}
            >
              <Text
                style={[
                  styles.title,
                  {
                    // A deleted exercise has no page to open, so it is not a
                    // link and must not look like one.
                    color: item.id === null ? theme.colors.textMuted : theme.colors.accent,
                  },
                ]}
              >
                {superset ? `${LETTERS[index] ?? '?'} · ${item.name}` : item.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {block.restSeconds === null ? null : (
          <View style={styles.rest}>
            <SymbolView
              name="timer"
              tintColor={theme.colors.textMuted}
              size={13}
              fallback={<Text style={{ color: theme.colors.textMuted }}>⏱</Text>}
            />
            <Text style={[styles.restText, { color: theme.colors.textMuted }]}>
              {block.restSeconds} s de repos
            </Text>
          </View>
        )}

        {/*
          The notes of specs 14.28 no 2, read DURING the workout rather than a
          page away. Read-only: a note belongs to the exercise, and editing it
          from here would change it for every routine that uses it, from a
          screen that says nothing about them.
        */}
        {shownNotes.length === 0 ? null : (
          <View style={styles.notes}>
            {shownNotes.map((note, index) => (
              <Text key={index} style={[styles.note, { color: theme.colors.textMuted }]}>
                {note}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.head}>
          <Text style={[styles.headCell, setColumns.colSet, { color: theme.colors.textMuted }]}>
            {superset ? 'Tour' : 'Série'}
          </Text>
          <Text style={[styles.headCell, setColumns.colValue, { color: theme.colors.textMuted }]}>
            kg
          </Text>
          <Text style={[styles.headCell, setColumns.colReps, { color: theme.colors.textMuted }]}>
            {block.sets.some((set) => set.tracksDuration === 1) ? 'Temps' : 'Reps'}
          </Text>
          <Text style={[styles.headCell, setColumns.colValue, { color: theme.colors.textMuted }]}>
            État
          </Text>
        </View>

        {block.sets.map((set, index) => (
          <View key={set.id}>
            {index === 0 ? null : <ListSeparator />}
            <LiveSetRow
              set={set}
              round={roundOf(index)}
              letter={superset ? (letters.get(set.exerciseId ?? set.exerciseName) ?? '?') : null}
              typed={typedFor(set)}
              active={activeSetId === set.id}
              onActivate={() => onActivate(set.id as SessionSetId)}
              onType={(typed) => onType(set, typed)}
              onValidate={(rir) => onValidate(set, rir)}
              onDelete={() => onRemove(set)}
            />
          </View>
        ))}

        <Pressable
          onPress={onAddRound}
          accessibilityRole="button"
          style={styles.addRound}
          hitSlop={6}
        >
          {/*
            "Ajouter un tour" in a superset, because half a round of a superset
            is not something anybody trains (specs 14.23 no 1). The wording
            follows the shape of the block, exactly as the routine page's does.
          */}
          <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
            {superset ? 'Ajouter un tour' : 'Ajouter une série'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 96 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  band: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  figure: { flex: 1, alignItems: 'center', gap: 2 },
  figureLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  figureValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', flexDirection: 'row' },
  rail: { width: 3 },
  cardBody: { flex: 1, padding: 12, gap: 8 },
  titles: { gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  restText: { fontSize: 13 },
  notes: { gap: 3 },
  note: { fontSize: 13, lineHeight: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  headCell: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  addRound: { paddingTop: 6, paddingHorizontal: 4 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24 },
});
