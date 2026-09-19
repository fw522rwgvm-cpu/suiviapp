import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/core/ui/text';
import { LoadingDots } from '@/core/ui/loading-dots';
import { FormInput, FormRow, FormSection } from '@/core/ui/form-section';
import { useTheme } from '@/core/theme';
import { formatLongDate } from '@/core/format';
import { toEntityId } from '@/core/id';
import type { SessionId, SessionSetId } from '@/core/db/schema';
import type { SessionSetView, SessionView } from '../data/session-reads';
import {
  useCompleteSet,
  useDeleteSession,
  useRemoveSet,
  useReopenSet,
  useSession,
  useSetSessionNotes,
  useSetSetRir,
  useSetSetType,
} from '../data/session-queries';
import { useDeferredSetWrites } from '../hooks/use-deferred-set-writes';
import { needsReps, recordSet, type TypedSet } from '../domain/session-set';
import { durationText, progressText } from '../domain/session-text';
import { SessionBlockCard } from '../components/session-block-card';
import { RirPicker } from '../components/rir-picker';

/**
 * The page of a FINISHED session (specs 10.5).
 *
 * > Liste chronologique des séances terminées, avec détail, édition et
 * > suppression.
 *
 * The list has existed since slice 11; this is the destination its rows never
 * had, and CLAUDE.md named the gap rather than filling it early.
 *
 * ## IT IS A SECOND SCREEN, NOT A MODE OF THE LIVE ONE
 *
 * They share the thing that must not diverge — SessionBlockCard, so specs
 * 10.2's "présentation identique" holds — and nothing else. The live screen is
 * a timer, a rest countdown, a running duration and a deferred-write rhythm
 * built around somebody standing between two sets; none of that means anything
 * on a workout that is over, and a screen carrying both would be a page of
 * conditionals on a state that never changes while it is open.
 *
 * ## THE TABLE IS EDITABLE ON SIGHT, WITH NO EDIT MODE
 *
 * The exercise page of specs 14.27 has one, and this deliberately does not.
 * The difference is where the value lives while it is being changed: the
 * exercise editor holds a DRAFT in React, so leaving it has two honest endings
 * and a gesture cannot be told apart from either. Here every keystroke goes to
 * SQLite through the same deferred rhythm the live session uses — there is no
 * unsaved state, so there is nothing to save, nothing to discard and nothing
 * to guard.
 *
 * Which also means "détail" and "édition", the two words specs 10.5 puts side
 * by side, are one screen rather than two: the detail IS the fields, and
 * touching one is the edit.
 *
 * ## EDITING DOES NOT LENGTHEN THE SESSION, AND THAT IS ENFORCED ELSEWHERE
 *
 * Every write here goes through the functions the live session uses, and each
 * one calls touchSession. Left alone, correcting a load three weeks later
 * would open a new activity segment — three weeks being well past D12's thirty
 * minutes — and the session's "temps actif" would quietly grow by the time
 * spent fixing a typo, on the figure specs 10.6 draws. touchSession refuses to
 * extend a finished session; the rule is there rather than here so that no
 * screen has to remember it.
 */
export function PastSessionScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const id = toEntityId<SessionId>(params.id ?? '');
  const query = useSession(id);

  if (id === null) return <Missing />;

  // undefined is "not answered yet"; null is "no such session". Folding the two
  // together is what makes a stale link render as a blank page for ever — the
  // rule since slice 4, where it cost two defects.
  if (query.data === undefined) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: 'Séance' }} />
        <LoadingDots />
      </View>
    );
  }

  if (query.data === null) return <Missing />;

  return <PastSession session={query.data} />;
}

function PastSession({ session }: { session: SessionView }) {
  const theme = useTheme();
  const router = useRouter();
  const complete = useCompleteSet();
  const reopen = useReopenSet();
  const setRir = useSetSetRir();
  const setType = useSetSetType();
  const remove = useRemoveSet();
  const setNotes = useSetSessionNotes();
  const removeSession = useDeleteSession();
  const writes = useDeferredSetWrites(session.id);

  const sets = session.blocks.flatMap((block) => block.sets);

  /** What is being typed, keyed by set. The live screen's arrangement exactly. */
  const [typing, setTyping] = useState<Record<string, TypedSet>>({});
  const [rirFor, setRirFor] = useState<SessionSetId | null>(null);
  const rirTarget = rirFor === null ? null : (sets.find((set) => set.id === rirFor) ?? null);

  /**
   * The note, held locally while it is being typed.
   *
   * The one value on this page that is NOT written on every keystroke: it is
   * prose, and a write per character on a paragraph is a write per character.
   * It goes to SQLite on blur, which is the same moment the quantity field of
   * slice 4 applies its value and for the same reason — a sentence is finished
   * when you stop writing it.
   */
  const [note, setNote] = useState(session.notes ?? '');

  function typedFor(set: SessionSetView): TypedSet {
    return (
      typing[set.id] ?? {
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
    // Flushed first, so the debounce cannot land after the validation and
    // overwrite what was recorded. The two rhythms of D12 write the same
    // columns, so their order matters exactly here.
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
    setTyping((current) => {
      const next = { ...current };
      delete next[set.id];
      return next;
    });
  }

  /** Choosing a RIR, which validates the set as well (specs 14.40). */
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

  /**
   * Deleting the whole session (specs 10.5, "supprimable").
   *
   * ## IT ASKS, WHERE deleteSession's OWN COMMENT SAID IT NEED NOT — CHANGED
   *
   * That comment was written in slice 11, when nothing could reach the
   * function, and it reasoned from specs 5.3 reserving the application's one
   * warning for deleting an exercise. The reasoning holds for what is
   * destroyed; it does not hold for how it is reached.
   *
   * The precedent it leans on is the journal, which dropped its confirmations
   * because deleting there takes TWO gestures with a named button visible
   * between them. A button at the foot of a page is one gesture. So the shape
   * that answered the question in the journal is absent here, and the
   * confirmation is what puts it back.
   *
   * What it names is the consequence rather than the act: an hour of work, and
   * the records and charts of specs 10.1 that counted it.
   */
  function confirmDelete(): void {
    Alert.alert(
      'Supprimer cette séance ?',
      'Ses séries sont retirées de vos records et de vos graphiques. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            writes.flush();
            removeSession.mutate(session.id, { onSuccess: () => router.back() });
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: session.routineName ?? 'Séance libre' }} />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/*
          What the session WAS, in the three figures the list row already shows
          — so opening a row never contradicts the row that was tapped.

          The duration is summed from the segments (D12), never ended_at minus
          started_at: a session left open overnight would otherwise read as
          fourteen hours.
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
          <Figure label="Date" value={formatLongDate(session.date)} />
          <Figure label="Durée" value={durationText(session.recordedDurationMs)} />
          <Figure label="Séries" value={progressText(session.doneSets, session.totalSets)} />
        </View>

        {session.blocks.map((block) => (
          <SessionBlockCard
            key={block.id}
            block={block}
            /*
              No pending notes: finishing a session consumes the notes of the
              exercises it contained (specs 6.3), so there is nothing unread
              left to show. A finished session showing them again would make
              every old workout carry every note ever written.
            */
            notes={new Map()}
            /*
              No thumbnails, and the absence is cheap rather than principled:
              this page does not hold the exercise library, and reading it for
              a picture would be a query the live screen gets for free because
              it already has one.
            */
            media={new Map()}
            previous={new Map()}
            showPrevious={false}
            progression={new Map()}
            /* Nothing is "next" in a session that is over. */
            activeSetId={null}
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
            onRemove={(set) =>
              remove.mutate({ setId: set.id as SessionSetId, sessionId: session.id })
            }
          />
        ))}

        {session.blocks.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Cette séance ne contient aucun exercice.
          </Text>
        ) : null}

        {/*
          THE SESSION NOTE OF SPECS 6.3, which had a column, a write and a hook
          since slice 11 and no way in or out. It belongs here rather than on
          the live screen: what you have to say about a workout is something you
          say once it is over.
        */}
        <FormSection caption="Notes">
          <FormRow>
            <View style={styles.noteField}>
              <FormInput
                value={note}
                onChangeText={setNote}
                onBlur={() => setNotes.mutate({ sessionId: session.id, notes: note })}
                placeholder="Facultatif"
                multiline
                autoCapitalize="sentences"
              />
            </View>
          </FormRow>
        </FormSection>

        <Pressable
          onPress={confirmDelete}
          disabled={removeSession.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.delete,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              opacity: pressed || removeSession.isPending ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>
            Supprimer la séance
          </Text>
        </Pressable>
      </ScrollView>

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
      <Text style={[styles.figureValue, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Missing() {
  const theme = useTheme();
  return (
    <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'Séance' }} />
      <Text style={{ color: theme.colors.textMuted }}>Cette séance n’existe plus.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 72 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  band: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  figure: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  figureLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  // Smaller than the live band's 22: the date is words, not a figure, and three
  // columns of 22 would put it on two lines.
  figureValue: { fontSize: 15, fontWeight: '600' },
  noteField: { flex: 1, gap: 4, paddingVertical: 4 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24 },
  delete: { paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteLabel: { fontSize: 16, fontWeight: '500' },
});
