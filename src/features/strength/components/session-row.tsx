import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { formatDayCompact } from '@/core/format/date-fr';
import type { SessionListItem } from '../data/session-reads';
import { durationText, progressText } from '../domain/session-text';

/**
 * One session in the Séances list (specs 10.3).
 *
 * ## THE ONE IN PROGRESS IS MARKED, NOT SORTED TO THE TOP
 *
 * It is already first, because the list is ordered by date and a running
 * session is today's. Lifting it out into its own section would say it is a
 * different KIND of thing, and it is not — it is the same session, a few
 * minutes earlier. What it gets instead is an accent dot and the word, which
 * is what tells it apart on the one row where "47 min" does not mean finished.
 *
 * ## THE DURATION COMES FROM THE SEGMENTS, WHICH IS WHY IT CAN BE SHORT
 *
 * A session left open overnight shows the time actually spent, not the wall
 * clock between its two ends (D12). Somebody reading "12 min" on a session
 * they started yesterday evening is reading the truth, and the alternative
 * would have said fourteen hours.
 *
 * ## A SESSION WITH NO SETS STILL SHOWS ITS COUNT
 *
 * "0/0" rather than a blank: a session that was started and abandoned is a real
 * thing that happened, and an empty space where a figure belongs reads as a
 * rendering fault rather than as a session with nothing in it.
 *
 * ## EVERY ROW OPENS NOW, AND THE TWO GO TO DIFFERENT PLACES
 *
 * Slice 11 gave a press only to the running one: there was one session screen,
 * it showed the session in progress, and a finished row that looked tappable
 * and did nothing would have been worse than one that says it is a record.
 * Specs 10.5's page is the destination that was missing, so the row is a link
 * again — to the live screen when it is running and to its own page when it is
 * not.
 *
 * `onPress` stays OPTIONAL rather than becoming required. It is what makes the
 * row draw its chevron, and a row that cannot be opened must not promise it —
 * the caller says which, and the component has one rule instead of a status
 * check of its own.
 */
export function SessionRow({
  session,
  onPress,
}: {
  session: SessionListItem;
  /** Omitted only where a row genuinely leads nowhere; see the note above. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const running = session.status === 'in_progress';

  const title = session.routineName ?? 'Séance libre';
  const detail = running
    ? `En cours · ${progressText(session.doneSets, session.totalSets)}`
    : `${durationText(session.recordedDurationMs)} · ${progressText(
        session.doneSets,
        session.totalSets,
      )}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole={onPress === undefined ? 'text' : 'button'}
      accessibilityLabel={`${title}, ${formatDayCompact(session.date)}, ${detail}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor:
            pressed && onPress !== undefined ? theme.colors.background : theme.colors.surface,
        },
      ]}
    >
      <View style={styles.identity}>
        <View style={styles.titleLine}>
          {running ? (
            <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
          ) : null}
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={[styles.detail, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {`${formatDayCompact(session.date)} · ${detail}`}
        </Text>
      </View>

      {onPress === undefined ? null : (
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={theme.colors.textFaint}
          fallback={<Text style={{ color: theme.colors.textFaint }}>›</Text>}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 58,
  },
  identity: { flex: 1, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
  detail: { fontSize: 13 },
});
