import { StyleSheet, Text, View } from 'react-native';
import { formatKcal, formatMacro } from '@/core/format';
import { useTheme } from '@/core/theme';
import { remainingMacros, type Macros } from '../domain/macros';

/**
 * The banner at the top of the Journal (specs 8.3).
 *
 * > The remaining calories must be legible without any interaction.
 *
 * Which is why the figure is the largest thing on the screen and sits above
 * everything else. D16 makes immediate legibility the priority, and the iOS 26
 * direction adds the reservation that glass costs contrast: never glass under
 * a number that has to be read at a glance. This surface is painted, not
 * glass; the chrome around it belongs to the system.
 *
 * `target` is null for the whole of slice 1: targets come from day templates,
 * which arrive in slice 5, and specs 8.1 forbids entering or storing them
 * anywhere else. Section 7 says as much — the remaining banner becomes
 * meaningful in slice 5. So today the figure is what has been eaten, which is
 * the only number that exists. The contract carries `target` from the first
 * day so that nothing about this component has to change when it arrives.
 *
 * No progress ring yet: it needs react-native-svg, a native dependency that
 * section 7 schedules with the graphic primitives of slice 7. A ring with
 * nothing to fill would be a native cycle spent on an empty circle. Bars are
 * two Views.
 */

interface MacroLine {
  label: string;
  consumed: number;
  target: number | null;
  color: string;
}

export function RemainingBanner({
  consumed,
  target,
}: {
  consumed: Macros;
  target: Macros | null;
}) {
  const theme = useTheme();
  const remaining = target === null ? null : remainingMacros(target, consumed);

  const lines: MacroLine[] = [
    { label: 'Protéines', consumed: consumed.protein, target: target?.protein ?? null, color: theme.colors.accent },
    { label: 'Glucides', consumed: consumed.carbs, target: target?.carbs ?? null, color: theme.colors.accent },
    { label: 'Lipides', consumed: consumed.fat, target: target?.fat ?? null, color: theme.colors.accent },
  ];

  const headlineValue = remaining === null ? consumed.kcal : remaining.kcal;
  const headlineLabel =
    remaining === null
      ? 'kcal consommées'
      : remaining.kcal >= 0
        ? 'kcal restantes'
        : 'kcal au-dessus';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text
        style={[
          styles.figure,
          { color: remaining !== null && remaining.kcal < 0 ? theme.colors.warning : theme.colors.text },
        ]}
        // Read out as one phrase rather than a bare number.
        accessibilityLabel={`${formatKcal(Math.abs(headlineValue))} ${headlineLabel}`}
      >
        {formatKcal(Math.abs(headlineValue))}
      </Text>
      <Text style={[styles.figureLabel, { color: theme.colors.textMuted }]}>{headlineLabel}</Text>

      {target === null ? (
        <Text style={[styles.note, { color: theme.colors.textFaint }]}>
          Aucun objectif défini
        </Text>
      ) : null}

      <View style={styles.lines}>
        {lines.map((line) => (
          <MacroBar key={line.label} line={line} />
        ))}
      </View>
    </View>
  );
}

function MacroBar({ line }: { line: MacroLine }) {
  const theme = useTheme();
  // Clamped so passing the target fills the bar rather than overflowing it;
  // the figures above stay exact.
  const ratio =
    line.target === null || line.target <= 0
      ? 0
      : Math.min(1, Math.max(0, line.consumed / line.target));

  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: theme.colors.textMuted }]}>{line.label}</Text>
      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        <View
          style={[styles.fill, { backgroundColor: line.color, width: `${ratio * 100}%` }]}
        />
      </View>
      <Text style={[styles.lineValue, { color: theme.colors.text }]}>
        {line.target === null
          ? `${formatMacro(line.consumed)} g`
          : `${formatMacro(line.consumed)} / ${formatMacro(line.target)} g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 2,
  },
  figure: { fontSize: 44, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 14, textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  lines: { marginTop: 16, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineLabel: { fontSize: 13, width: 72 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  lineValue: { fontSize: 13, width: 96, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
