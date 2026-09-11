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
 * `target` is null until slice 5: targets come from day templates, and
 * specs 8.1 forbids entering or storing them anywhere else. So today the
 * figure is what has been eaten, which is the only number that exists, and the
 * bars have nothing to fill. The contract carries `target` from the first day
 * so that nothing here changes when it arrives.
 *
 * STILL NO PROGRESS RING, and it is worth restating because this layout is
 * where one would go. A ring needs react-native-svg, a native dependency that
 * section 7 schedules with the graphic primitives of slice 7, and D13 asks for
 * ONE graphics tool — so assembling a ring out of rotated Views would not be a
 * cheap substitute but a second one. A thick bar is the honest stand-in: it
 * answers the same question, and it is two Views.
 */

interface MacroColumn {
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

  const columns: MacroColumn[] = [
    {
      label: 'Protéines',
      consumed: consumed.protein,
      target: target?.protein ?? null,
      color: theme.colors.macroProtein,
    },
    {
      label: 'Glucides',
      consumed: consumed.carbs,
      target: target?.carbs ?? null,
      color: theme.colors.macroCarbs,
    },
    {
      label: 'Lipides',
      consumed: consumed.fat,
      target: target?.fat ?? null,
      color: theme.colors.macroFat,
    },
  ];

  const headlineValue = remaining === null ? consumed.kcal : remaining.kcal;
  const headlineLabel =
    remaining === null
      ? 'kcal consommées'
      : remaining.kcal >= 0
        ? 'kcal restantes'
        : 'kcal au-dessus';
  const over = remaining !== null && remaining.kcal < 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.xl,
        },
        theme.shadow,
      ]}
    >
      <Text
        style={[styles.figure, { color: over ? theme.colors.warning : theme.colors.text }]}
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
      ) : (
        <View style={[styles.calorieTrack, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.calorieFill,
              {
                backgroundColor: over ? theme.colors.warning : theme.colors.accent,
                width: `${ratioOf(consumed.kcal, target.kcal) * 100}%`,
              },
            ]}
          />
        </View>
      )}

      <View style={styles.columns}>
        {columns.map((column) => (
          <MacroColumnView key={column.label} column={column} />
        ))}
      </View>
    </View>
  );
}

/**
 * Clamped, so passing a target fills the bar rather than overflowing its
 * rounded corners. The figures beside it stay exact — the bar is the glance,
 * the numbers are the answer.
 */
function ratioOf(consumed: number, target: number | null): number {
  if (target === null || target <= 0) return 0;
  return Math.min(1, Math.max(0, consumed / target));
}

function MacroColumnView({ column }: { column: MacroColumn }) {
  const theme = useTheme();

  return (
    <View style={styles.column}>
      <Text style={[styles.columnLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {column.label}
      </Text>

      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: column.color, width: `${ratioOf(column.consumed, column.target) * 100}%` },
          ]}
        />
      </View>

      <Text style={[styles.columnValue, { color: theme.colors.text }]} numberOfLines={1}>
        {column.target === null
          ? `${formatMacro(column.consumed)} g`
          : `${formatMacro(column.consumed)} / ${formatMacro(column.target)} g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 26,
    paddingBottom: 20,
    paddingHorizontal: 20,
    gap: 2,
  },
  figure: {
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  figureLabel: { fontSize: 15, textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  calorieTrack: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 18 },
  calorieFill: { height: 10, borderRadius: 5 },
  // Side by side rather than stacked: three macros are one glance, not three.
  columns: { flexDirection: 'row', gap: 14, marginTop: 20 },
  column: { flex: 1, gap: 7 },
  columnLabel: { fontSize: 12 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  columnValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
