import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';
import { useTheme } from '@/core/theme';
import { setTypeLabel } from '../domain/vocabulary';
import type { BlockDraft, LineDraft } from '../domain/routine-draft';
import { restForLine, setIndexOf } from '../domain/routine-draft';
import { setSummary } from '../domain/routine-text';

/**
 * One set of a routine (specs 10.2).
 *
 * > Balayer une série vers la gauche la supprime.
 *
 * SwipeToDeleteRow, unchanged, with the rule it carries: the first swipe only
 * uncovers the action however far it is pulled, and either a second swipe or a
 * press on the now-visible button removes. Two gestures cost one more moment
 * and buy the sight of what is about to happen.
 *
 * ## THE PRESS IS HANDED OVER, NEVER WRAPPED
 *
 * onPress goes to the component rather than into a Pressable around the
 * content. React Native's responder system and gesture-handler are two
 * recognisers that do not arbitrate with each other, so a Pressable underneath
 * an active pan fires on release — which is how uncovering "Retirer" on a
 * basket line used to open the quantity screen. A Tap and a Pan in one detector
 * race, and the pan activating makes the tap fail.
 *
 * Corollary, and it applies here: NO CHILD PAINTS ITS OWN BACKGROUND, or it
 * hides the row's highlight.
 */
export function SetRow({
  block,
  line,
  lineIndex,
  editable,
  onPress,
  onDelete,
}: {
  block: BlockDraft;
  line: LineDraft;
  lineIndex: number;
  /** A routine's page shows the same rows without the swipe (specs 10.2). */
  editable: boolean;
  onPress?: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();

  const index = setIndexOf(block, lineIndex);
  const rest = restForLine(block, line);
  const summary = setSummary(line, rest);

  const content = (
    <View style={styles.row}>
      {/*
        The set number, in tabular figures so a column of them lines up. It is
        the rank FOR ITS EXERCISE, which is what makes a superset readable: A1
        A2 A3 B1 B2 B3 rather than 1 through 6.
      */}
      <Text style={[styles.index, { color: theme.colors.textMuted }]}>{`S${index}`}</Text>

      <View style={styles.body}>
        <Text style={[styles.summary, { color: theme.colors.text }]} numberOfLines={1}>
          {summary}
        </Text>
        {line.note.trim() === '' ? null : (
          <Text style={[styles.note, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {line.note}
          </Text>
        )}
      </View>

      {/*
        The set type is stated only when it is NOT a working set. `travail` is
        the default (specs 6.3), so labelling every ordinary row "Travail" would
        be a column of the same word — and the exceptions, which are the ones
        worth seeing, would stop standing out.
      */}
      {line.setType === 'work' ? null : (
        <Text style={[styles.type, { color: theme.colors.textMuted }]}>
          {setTypeLabel(line.setType)}
        </Text>
      )}
      {line.progressionEnabled ? (
        <Text style={[styles.type, { color: theme.colors.accent }]}>↗</Text>
      ) : null}
    </View>
  );

  if (!editable) return content;

  return (
    <SwipeToDeleteRow
      onDelete={onDelete ?? (() => undefined)}
      onPress={onPress}
      accessibilityLabel={`Série ${index}, ${summary}`}
      actionLabel="Retirer"
    >
      {content}
    </SwipeToDeleteRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  index: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 24 },
  body: { flex: 1, gap: 2 },
  summary: { fontSize: 15 },
  note: { fontSize: 13 },
  type: { fontSize: 13 },
});
