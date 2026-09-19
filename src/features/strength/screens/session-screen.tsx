import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/build/react-navigation/elements';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import type { ExerciseId, SessionSetId, SetType } from '@/core/db/schema';
import { previousFor } from '../data/session-reads';
import type {
  PreviousSet,
  SessionBlockView,
  SessionSetView,
  SessionView,
} from '../data/session-reads';
import {
  useActiveSession,
  useAddRound,
  useCompleteSet,
  useFinishSession,
  usePendingNotes,
  useRemoveSet,
  usePreviousSets,
  useReopenSet,
  useSetSetRir,
  useSetSetType,
  useSkipSet,
} from '../data/session-queries';
import { useDeferredSetWrites } from '../hooks/use-deferred-set-writes';
import { SESSION_TICK_MS, useLiveDuration } from '../hooks/use-live-duration';
import { SESSION_ACTIVE_GAP_MS } from '../domain/session-activity';
import { useRestTimer } from '../hooks/use-rest-timer';
import { needsReps, recordSet, type TypedSet } from '../domain/session-set';
import { elapsedText, progressText, restText } from '../domain/session-text';
import { setColumns } from '../components/set-cell';
import { LiveSetRow } from '../components/live-set-row';
import { RirPicker } from '../components/rir-picker';
import { ExerciseDrawing } from '../components/exercise-drawing';
import { useExercises, useRestAlert } from '../data/exercise-queries';

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
  const reopen = useReopenSet();
  const setRir = useSetSetRir();
  const setType = useSetSetType();
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
   * The set the hint is attached to: the first one not finished.
   *
   * ## PINNING IS GONE, AND THAT IS WHAT FIXED THE DOUBLE TAP
   *
   * Tapping a row used to move this, because the RIR strip lived under the
   * active row and a workout is not always performed in order. The strip became
   * a column on every row (specs 14.38), so there is nothing left to move.
   *
   * Keeping the row press cost a real defect: SwipeToDeleteRow swallows touches
   * with `pointerEvents="box-only"` whenever it has an `onPress`, so the
   * buttons INSIDE the row never received the first tap — it activated the row,
   * which removed the onPress, and only the second one reached the button.
   * Reported as "je dois appuyer 2 fois sur le bouton valider".
   *
   * It is the same trap slice 10 paid for with the routine table's fields, one
   * layer up: a row that owns the press cannot also contain controls.
   */
  const activeSetId = sets.find((set) => set.status === 'pending')?.id ?? null;

  /** What is being typed, keyed by set. Empty means "show the placeholders". */
  const [typing, setTyping] = useState<Record<string, TypedSet>>({});

  /**
   * Which set the RIR window is about. `null` means it is closed.
   *
   * An id rather than the set itself, so the window always shows what the
   * DATABASE holds: picking a RIR writes immediately and the row re-reads, and
   * a captured object would go on showing the value it had when it was opened.
   */
  const [rirFor, setRirFor] = useState<SessionSetId | null>(null);
  const rirTarget = rirFor === null ? null : (sets.find((set) => set.id === rirFor) ?? null);

  const headerHeight = useHeaderHeight();
  // Every second: this page shows them (specs 14.38). The banner keeps its
  // fifteen, because it shows minutes and runs on every screen.
  const liveMs = useLiveDuration(session.segments, SESSION_ACTIVE_GAP_MS, SESSION_TICK_MS);

  /** What each set did the last time this routine was performed (specs 14.39). */
  const previous = usePreviousSets(session.routineId, session.id);

  /**
   * exercise id -> its medium, for the thumbnail beside each block title.
   *
   * From the library query the application already holds, not a read per block:
   * that is the per-row cost slice 4 refused when quick-add reached the whole
   * library. A session set carries a frozen NAME and no medium, deliberately —
   * history does not change when a picture does.
   */
  const library = useExercises();
  const media = useMemo(
    () => new Map((library.data ?? []).map((item) => [String(item.id), item.mediaUri])),
    [library.data],
  );
  // Defaults to ON while the setting is still being read: a rest that ends in
  // silence because a query had not resolved would look like the toggle is
  // broken, and the read is local SQLite.
  const restAlert = useRestAlert();
  const rest = useRestTimer(session.id, session.blocks, restAlert.data ?? true);

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
    /*
      The typing entry is DROPPED, so the row goes back to reading the database.

      Without this a set validated with untouched fields keeps `{reps: null}` in
      the local map, and the cell falls back to its placeholder — the same
      NUMBER, in the faint colour, so a recorded set would read as an empty one.
      After a discrete act the stored row is the truth; the local map only
      exists for the milliseconds between a keystroke and its flush.
    */
    setTyping((current) => {
      const next = { ...current };
      delete next[set.id];
      return next;
    });

    // The hint follows the first unfinished set on its own, so nothing here
    // has to move it: validating this one is what makes the next one first.
  }

  /**
   * Choosing a RIR, which VALIDATES the set as well (specs 14.40).
   *
   * ## WHY BOTH, AFTER SPLITTING THEM APART
   *
   * Specs 14.38 split the RIR out of the validation because one control doing
   * two things made the second unreachable — there was no way to correct a
   * mis-tapped RIR. That stands: the RIR is still a value of its own, still
   * editable, and the check button still toggles on its own.
   *
   * What comes back is the SHORTCUT, requested: saying the RIR is the last
   * thing you do for a set, so it should not then need a second tap. The
   * difference from slice 11 is that this is now the fast path rather than the
   * only path.
   *
   * ## A DONE SET IS ONLY CORRECTED, NEVER RE-VALIDATED
   *
   * Re-running completeSet would rewrite `completed_at`, which is the instant
   * the rest counts from — so correcting the RIR of a set finished ten minutes
   * ago would restart its rest. Already done means write the RIR and stop.
   *
   * ## AND A SET THAT CANNOT BE VALIDATED IS NOT
   *
   * needsReps() is now only true for a set with NO target at all, which is one
   * added live. Its RIR is recorded and the row keeps saying what is missing,
   * rather than validating a set nobody described.
   */
  function onPickRir(set: SessionSetView, rir: number): void {
    if (set.status === 'done') {
      setRir.mutate({ setId: set.id as SessionSetId, sessionId: session.id, rir });
      return;
    }

    const target = {
      setType: set.setType,
      repsMin: set.targetRepsMin,
      repsMax: set.targetRepsMax,
      loadKg: set.targetLoadKg,
      rir: set.targetRir,
      durationSeconds: set.targetDurationSeconds,
    };
    if (needsReps(target, typedFor(set))) {
      setRir.mutate({ setId: set.id as SessionSetId, sessionId: session.id, rir });
      return;
    }

    onValidate(set, rir);
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

      {/*
        THE INSET IS DECLARED, NOT INHERITED — slice 3's rule, and pinning the
        band is exactly what made it necessary.

        `contentInsetAdjustmentBehavior="automatic"` pushed the content under the
        transparent header while the band was the first thing IN the scroller.
        Outside it, nothing does: the band was drawn behind the title and the
        Terminer button. The scroller keeps "never" and the page states the
        padding, which is the arrangement slice 3 settled after the carousel
        overshot three times.
      */}
      <View
        style={[
          styles.page,
          { backgroundColor: theme.colors.background, paddingTop: headerHeight },
        ]}
      >
        {/*
          The upper band of specs 10.3: elapsed time and sets done over total.
          Two figures and nothing else — it is read between two sets, by someone
          out of breath.

          PINNED ABOVE THE SCROLLER since specs 14.38, rather than being the
          first thing in it. It used to scroll away, which meant the one figure
          the screen exists to carry was gone as soon as you reached the third
          block — on the screen where you are least able to go looking for it.
          The cost is a permanent band; it is three short figures high, and it
          is what the page is for.
        */}
        <View
          style={[
            styles.band,
            styles.pinnedBand,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          {/*
            To the SECOND here, unlike the persistent banner. The reasoning is
            in elapsedText: a ticking figure is noise on every other screen and
            is the point on this one.
          */}
          <Figure label="Durée" value={elapsedText(liveMs)} />
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

        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {session.blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              notes={notes.data ?? new Map()}
              media={media}
              previous={previous.data ?? new Map()}
              activeSetId={activeSetId}
              typedFor={typedFor}
              onType={onType}
              onCycleType={(set, next) =>
                setType.mutate({
                  setId: set.id as SessionSetId,
                  sessionId: session.id,
                  setType: next,
                })
              }
              onOpenRir={(set) => setRirFor(set.id as SessionSetId)}
              onValidate={onValidate}
              onReopen={(set) =>
                reopen.mutate({ setId: set.id as SessionSetId, sessionId: session.id })
              }
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
              onAddRound={() =>
                addRound.mutate({ blockId: block.id as never, sessionId: session.id })
              }
            />
          ))}

          {session.blocks.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              Aucun exercice. Ajoutez-en un pour commencer.
            </Text>
          ) : null}
        </ScrollView>
      </View>

      {/*
        The RIR window belongs to the SCREEN, not to a row.

        One Modal for the whole page rather than one per set: eight hundred
        mounted modals is the shape this screen spent the day removing, and a
        picker is a single conversation — which set it is about is state, and
        `null` means nobody is having it.
      */}
      <RirPicker
        visible={rirFor !== null}
        current={rirTarget === null ? null : (rirTarget.actualRir ?? rirTarget.targetRir)}
        onDismiss={() => setRirFor(null)}
        onPick={(rir) => {
          if (rirTarget !== null) onPickRir(rirTarget, rir);
          setRirFor(null);
        }}
      />
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
  media,
  previous,
  activeSetId,
  typedFor,
  onType,
  onCycleType,
  onOpenRir,
  onValidate,
  onReopen,
  onSkip,
  onRemove,
  onAddRound,
}: {
  block: SessionBlockView;
  notes: Map<string, string[]>;
  /** exercise id -> its medium, for the thumbnail beside each title. */
  media: ReadonlyMap<string, string | null>;
  previous: ReadonlyMap<string, PreviousSet>;
  activeSetId: string | null;
  typedFor: (set: SessionSetView) => TypedSet;
  onType: (set: SessionSetView, typed: TypedSet) => void;
  onCycleType: (set: SessionSetView, next: SetType) => void;
  onOpenRir: (set: SessionSetView) => void;
  onValidate: (set: SessionSetView, rir: number) => void;
  onReopen: (set: SessionSetView) => void;
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
              style={styles.titleRow}
            >
              {/*
                The same thumbnail the library and the routine page draw, one
                pose. It costs no query: the exercise list is already cached,
                and a read per block is the per-row cost slice 4 refused.
              */}
              <View style={styles.titleThumb}>
                <ExerciseDrawing
                  mediaUri={item.id === null ? null : (media.get(String(item.id)) ?? null)}
                  height={32}
                />
              </View>
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
          <Text style={[styles.headCell, setColumns.colPrev, { color: theme.colors.textMuted }]}>
            Précéd.
          </Text>
          <Text style={[styles.headCell, setColumns.colValue, { color: theme.colors.textMuted }]}>
            kg
          </Text>
          <Text style={[styles.headCell, setColumns.colReps, { color: theme.colors.textMuted }]}>
            {block.sets.some((set) => set.tracksDuration === 1) ? 'Temps' : 'Reps'}
          </Text>
          <Text style={[styles.headCell, setColumns.colRir, { color: theme.colors.textMuted }]}>
            RIR
          </Text>
          {/*
            The check column has no word above it. "Fait" over a column of
            checkmarks is the label saying what the glyph already says, and the
            four characters cost the reps column width it needs more.
          */}
          <View style={setColumns.colCheck} />
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
              previous={previousFor(previous, set)}
              onType={(typed) => onType(set, typed)}
              onCycleType={(next) => onCycleType(set, next)}
              onOpenRir={() => onOpenRir(set)}
              onValidate={(rir) => onValidate(set, rir)}
              onReopen={() => onReopen(set)}
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
  page: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 96 },
  // Outside the scroller now, so it carries the margin the content container
  // used to give it.
  pinnedBand: { marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // A fixed width, so a photograph and the substitute leave the names on one
  // column — the rule every other list in this feature follows.
  titleThumb: { width: 44 },
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
