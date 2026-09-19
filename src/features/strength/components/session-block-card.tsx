import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import type { ExerciseId, SetType } from '@/core/db/schema';
import { previousFor } from '../data/session-reads';
import type {
  PreviousSet,
  SessionBlockView,
  SessionSetView,
} from '../data/session-reads';
import type { ProgressionSuggestions } from '../data/history-reads';
import type { TypedSet } from '../domain/session-set';
import { workSetNumbers } from '../domain/set-number';
import { progressionText } from '../domain/session-text';
import { setColumns } from './set-cell';
import { LiveSetRow } from './live-set-row';
import { ExerciseDrawing } from './exercise-drawing';

/**
 * ONE BLOCK OF A SESSION, DRAWN THE SAME WAY WHEREVER IT APPEARS.
 *
 * ## IT MOVED HERE AT ITS SECOND REAL USER, WHICH IS THE RULE (D10)
 *
 * It was private to session-screen.tsx while the live session was the only
 * place a session could be looked at. Specs 10.5 gives it a second — the page
 * of a FINISHED session — and specs 10.2 already demands the two look alike
 * ("présentation identique"), which a copy could not guarantee: two spellings
 * would agree on an ordinary block and drift on a superset with a warm-up in
 * it, which is the case nobody checks by hand.
 *
 * Not `core/ui`: this knows what a session set is. `set-cell` is the piece
 * that is generic enough to be shared with the routine table.
 *
 * ## WHAT THE TWO PAGES ACTUALLY DIFFER ON
 *
 * Three props, and each absence says something rather than merely saving work:
 *
 * - `showPrevious` — see below; a finished session cannot honestly answer
 *   "what did you do last time".
 * - `onAddRound` — a finished session has nothing left to add mid-workout.
 * - `activeSetId` — nothing is "next" in a session that is over.
 *
 * Everything else is identical, including that a recorded value stays
 * editable: specs 10.3 says a finished session "reste éditable" and specs 5.3
 * puts no time limit on it.
 */
/**
 * One block of the session: its exercises, its rest, its sets.
 *
 * The layout is the routine page's, deliberately — specs 14.23 no 4 settled it
 * there and a session that looked different would be a second answer to "what
 * does a block look like". Exercise names in the accent colour, rest on one
 * line under them, a table with no inner grid.
 */
export function SessionBlockCard({
  block,
  notes,
  media,
  previous,
  progression,
  activeSetId,
  typedFor,
  onType,
  onCycleType,
  onOpenRir,
  onValidate,
  onReopen,
  onRemove,
  onAddRound,
  showPrevious,
}: {
  block: SessionBlockView;
  notes: Map<string, string[]>;
  /** exercise id -> its medium, for the thumbnail beside each title. */
  media: ReadonlyMap<string, string | null>;
  previous: ReadonlyMap<string, PreviousSet>;
  progression: ProgressionSuggestions;
  activeSetId: string | null;
  typedFor: (set: SessionSetView) => TypedSet;
  onType: (set: SessionSetView, typed: TypedSet) => void;
  onCycleType: (set: SessionSetView, next: SetType) => void;
  onOpenRir: (set: SessionSetView) => void;
  onValidate: (set: SessionSetView, rir: number) => void;
  onReopen: (set: SessionSetView) => void;
  onRemove: (set: SessionSetView) => void;
  /** Omitted on a finished session, which has nothing left to add. */
  onAddRound?: () => void;
  /**
   * Whether the PRÉCÉDENT column is drawn (specs 14.39).
   *
   * TRUE on a live session, where the column is the whole point: it is what
   * you read to decide the load you are about to type.
   *
   * FALSE on a finished one, and not for want of room. readPreviousSets answers
   * "the last DONE session of this routine other than this one" — asked of a
   * session from March, that is whichever one came LAST, which may well be
   * June's. A column headed "précédent" showing a session from the future is
   * worse than no column, and a column of em dashes spends sixty-six points
   * saying nothing.
   */
  showPrevious?: boolean;
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

  /**
   * The number each row shows — working sets only, per exercise (specs 14.41).
   *
   * Computed once for the block rather than per row: the rank of a set depends
   * on everything above it, so a per-row loop was the same walk repeated for
   * every row. And the rule itself lives in the domain, because the routine
   * table numbers its sets the same way and two spellings would drift.
   */
  const numbers = workSetNumbers(
    block.sets.map((set) => ({
      key: set.exerciseId ?? set.exerciseName,
      setType: set.setType,
    })),
  );

  const shownNotes = exercises.flatMap((item) =>
    item.id === null ? [] : (notes.get(item.id) ?? []),
  );

  /**
   * The double-progression suggestions this block has earned (specs 10.4).
   *
   * One line per exercise that earned one, which on a superset is why the
   * letter is repeated: "A · Essayez 72,5 kg" is the only form that says WHICH
   * exercise to add weight to when the card carries two.
   *
   * A deleted exercise gets none — there is no increment left to read, and
   * specs 5.3 has already said its statistical continuity is broken.
   */
  const shownProgression = exercises.flatMap((item, index) => {
    if (item.id === null) return [];
    const suggestion = progression.get(String(item.id));
    if (suggestion === undefined) return [];
    const text = progressionText(suggestion);
    return [
      {
        key: String(item.id),
        text: superset ? `${LETTERS[index] ?? '?'} · ${text}` : text,
      },
    ];
  });

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
          THE SUGGESTION OF SPECS 10.4, AND IT IS ONLY EVER A SENTENCE.

          > L'application affiche une suggestion à la séance suivante. Elle ne
          > modifie jamais la routine ni la charge cible automatiquement.

          Which is why it is NOT in the load field's placeholder, where it would
          have been one tap closer: that placeholder carries the routine's own
          target and is what gets recorded if the field is left alone, so a
          suggestion written there would BE the application changing the target
          — and it would be indistinguishable from the target while doing it.

          It sits above the table, where the exercise's name and rest already
          are, because it is a fact about the exercise rather than about any one
          row. In the accent colour: it is the only thing on this card that was
          not simply read back from the routine.
        */}
        {shownProgression.length === 0 ? null : (
          <View style={styles.progression}>
            {shownProgression.map((item) => (
              <View key={item.key} style={styles.progressionLine}>
                <SymbolView
                  name="arrow.up.circle"
                  tintColor={theme.colors.accent}
                  size={13}
                  fallback={<Text style={{ color: theme.colors.accent }}>↑</Text>}
                />
                <Text style={[styles.progressionText, { color: theme.colors.accent }]}>
                  {item.text}
                </Text>
              </View>
            ))}
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
          {showPrevious === false ? null : (
            <Text style={[styles.headCell, setColumns.colPrev, { color: theme.colors.textMuted }]}>
              Précéd.
            </Text>
          )}
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
              number={numbers[index] ?? null}
              letter={superset ? (letters.get(set.exerciseId ?? set.exerciseName) ?? '?') : null}
              typed={typedFor(set)}
              active={activeSetId === set.id}
              previous={previousFor(previous, set)}
              showPrevious={showPrevious !== false}
              onType={(typed) => onType(set, typed)}
              onCycleType={(next) => onCycleType(set, next)}
              onOpenRir={() => onOpenRir(set)}
              onValidate={(rir) => onValidate(set, rir)}
              onReopen={() => onReopen(set)}
              onDelete={() => onRemove(set)}
            />
          </View>
        ))}

        {onAddRound === undefined ? null : (
          <Pressable
            onPress={onAddRound}
            accessibilityRole="button"
            style={styles.addRound}
            hitSlop={6}
          >
            {/*
              "Ajouter un tour" in a superset, because half a round of a
              superset is not something anybody trains (specs 14.23 no 1). The
              wording follows the shape of the block, exactly as the routine
              page's does.
            */}
            <Text style={{ color: theme.colors.accent, fontSize: 15 }}>
              {superset ? 'Ajouter un tour' : 'Ajouter une série'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', flexDirection: 'row' },
  rail: { width: 3 },
  cardBody: { flex: 1, padding: 12, gap: 8 },
  titles: { gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // A fixed width, so a photograph and the substitute leave the names on one
  // column — the rule every other list in this feature follows.
  titleThumb: { width: 44 },
  title: { fontSize: 17, fontWeight: '600' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  restText: { fontSize: 13 },
  progression: { gap: 3 },
  progressionLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // 13 like the rest line and the notes: it is one of the three short lines
  // between the exercise name and the table, and a fourth type size there
  // would make the group read as four unrelated things.
  progressionText: { fontSize: 13, fontWeight: '500' },
  notes: { gap: 3 },
  note: { fontSize: 13, lineHeight: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  headCell: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  addRound: { paddingTop: 6, paddingHorizontal: 4 },
});
