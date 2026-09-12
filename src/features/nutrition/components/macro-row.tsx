import { StyleSheet, Text, View } from 'react-native';
import { formatKcal, formatMacro } from '@/core/format';
import { useTheme, type Theme } from '@/core/theme';
import type { Macros } from '../domain/macros';

/**
 * The four figures of a quantity, side by side: what this much of it is worth.
 *
 * Name above with its colour worn as a dot, value with its unit below. Four
 * columns rather than a sentence, because these are read by comparison -- is
 * there more protein here than fat -- and a sentence has to be parsed before
 * it can be compared. The dot is what carries the colour: a coloured NUMBER is a number
 * you have to decide the meaning of, and a coloured label is a label competing
 * with the figure it introduces.
 *
 * Calories are one of the four here, not set apart. This is the block that
 * answers "what am I about to log", and on that question energy is one figure
 * among four. Elsewhere -- on a journal row, in the remaining banner -- it
 * keeps its own place, because there the question is what it costs.
 *
 * No arithmetic: the totals arrive already derived (D9).
 */

/** The four, in the order they are read. Declared once, colour and all. */
const PARTS = [
  { key: 'kcal', label: 'Calories', tint: (theme: Theme) => theme.colors.macroKcal },
  { key: 'protein', label: 'Protéines', tint: (theme: Theme) => theme.colors.macroProtein },
  { key: 'carbs', label: 'Glucides', tint: (theme: Theme) => theme.colors.macroCarbs },
  { key: 'fat', label: 'Lipides', tint: (theme: Theme) => theme.colors.macroFat },
] as const;

export function MacroRow({ total }: { total: Macros }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {PARTS.map((part) => (
        <View key={part.key} style={styles.column}>
          <View style={styles.heading}>
            <View style={[styles.dot, { backgroundColor: part.tint(theme) }]} />
            <Text
              style={[styles.label, { color: theme.colors.textMuted }]}
              numberOfLines={1}
              // The name may be shortened by the platform on a narrow screen;
              // the figure under it never is.
              adjustsFontSizeToFit
            >
              {part.label}
            </Text>
          </View>

          <Text
            style={[styles.value, { color: theme.colors.text }]}
            numberOfLines={1}
            // Every value carries its unit, so "kcal" makes this the widest of
            // the four columns. It shrinks rather than being cut: a figure a
            // point smaller is still read, and a truncated one is not.
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {/*
              The space before each unit is non-breaking, and spelled out rather
              than typed. It was typed here at first, and invisible: this project
              has already lost time twice to one an editor had quietly turned
              into an ordinary space, which nothing shows and no reading catches.
            */}
            {part.key === 'kcal'
              ? `${formatKcal(total.kcal)}\u00A0kcal`
              : `${formatMacro(total[part.key])}\u00A0g`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  // Equal shares, so the four read as a set rather than as four things that
  // happen to sit in a line.
  column: { flex: 1, alignItems: 'center', gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12 },
  // Tabular figures, so the four line up under each other and a changing
  // quantity does not make the row shuffle.
  value: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
