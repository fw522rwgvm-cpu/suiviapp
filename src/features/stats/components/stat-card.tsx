import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';

/**
 * A named card of the dashboard.
 *
 * Three real users on the day it is written — calories, split, adherence — so
 * it starts shared rather than being extracted later. It stays in
 * features/stats rather than core/ui: the rule is a second user, and all three
 * of these are in this folder.
 *
 * The headline figure is the largest thing in the card and sits above its own
 * explanation, which is the shape the remaining banner already uses: D16 makes
 * immediate legibility the priority, and a figure read at a glance has to be
 * found before it is read.
 */
export function StatCard({
  title,
  headline,
  caption,
  note,
  children,
}: {
  title: string;
  /**
   * The one figure of the card, when the card HAS one.
   *
   * Omitted where the drawing is already the figure: the split card states
   * three shares in a bar and again in three rows, so a headline repeating
   * them a third time was three numbers saying what the picture underneath
   * said better.
   */
  headline?: string;
  /**
   * What the figure is a figure OF — a number alone is a riddle.
   *
   * Required in spirit and optional in type, for the same reason: where there
   * is no headline there is nothing to caption.
   */
  caption?: string;
  /** A second line, when there is something to say. */
  note?: string | null;
  children?: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.title, { color: theme.colors.textFaint }]}>
        {title.toUpperCase()}
      </Text>

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
        {headline === undefined ? null : (
          <Text style={[styles.headline, { color: theme.colors.text }]}>{headline}</Text>
        )}
        {caption === undefined ? null : (
          <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{caption}</Text>
        )}
        {note === undefined || note === null ? null : (
          <Text style={[styles.note, { color: theme.colors.textFaint }]}>{note}</Text>
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  title: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  // Tabular figures so a number that changes with the range does not shift the
  // ones beside it. Nunito carries tnum; if it does not, this is where it shows.
  headline: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 15, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 19 },
});
