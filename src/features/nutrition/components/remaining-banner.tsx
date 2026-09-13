import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacroWhole } from '@/core/format';
import { useTheme } from '@/core/theme';
import { progressRatio, remainingMacros, targetStanding, type Macros } from '../domain/macros';
import { ProgressRing } from './progress-ring';

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
 * THE RING ARRIVED, and the note that used to stand here was right about
 * everything except the cost. It said a ring needs react-native-svg and that
 * views would be "a second graphics tool" — true, but react-native-svg is
 * NATIVE, and the first screen to mount it is this one. Adding it would stop
 * the application opening at all until a CI cycle and a reinstall. So the ring
 * is drawn with views, and slice 7 rewrites it behind the same props when svg
 * lands for the charts. See progress-ring.tsx.
 *
 * THE GAUGE IS THE ONE THING HERE THAT TURNS RED, past the margin. The
 * three macro bars never do, whatever they are filled to: going over on
 * carbohydrates is not a failure the way going over on the day is, and a row
 * of red bars would say it was. Calories are the number specs 8.3 makes
 * legible without interaction; they are the one that gets to raise its voice.
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
  /**
   * "en trop" rather than "au-dessus".
   *
   * Above what? The phrase needed the target to be in the sentence to mean
   * anything, and the target is not in the sentence — the figure above it is
   * the overshoot itself. "En trop" says what the number IS, which is the only
   * thing the banner has room to say.
   */
  const headlineLabel =
    remaining === null
      ? 'kcal consommées'
      : remaining.kcal >= 0
        ? 'kcal restantes'
        : 'kcal en trop';

  /**
   * Two states, decided in the domain (D9): within the margin, or past it.
   *
   * A FULL GAUGE KEEPS THE ORDINARY COLOUR. Reaching the target means there is
   * nothing left, which is the goal met rather than missed, so the arc closes
   * in the accent and stays there while the overshoot is still small. Only
   * past fifty kilocalories does it turn red.
   *
   * THE ARC CARRIES IT; THE FIGURE DOES NOT. The number stays in the text
   * colour whatever the standing, because it is the one thing specs 8.3
   * requires to be legible without any interaction — and a red numeral on a
   * card is read as an error before it is read as a quantity.
   */
  const standing = targetStanding(consumed.kcal, target?.kcal ?? null);

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
      {/*
        The figure lives INSIDE the ring now. Specs 8.3 wants the remaining
        calories legible without any interaction, and the ring is the one shape
        on the screen whose whole job is to be read at a glance — putting the
        number anywhere else would make the eye do the work twice.
      */}
      <View
        style={styles.ringRow}
        accessible
        accessibilityLabel={`${formatKcal(Math.abs(headlineValue))} ${headlineLabel}`}
      >
        {/*
          A THREE-QUARTER GAUGE, not a closed ring: sweep 270 from 225°, which
          is a 90° gap centred on six o'clock. An open shape has two ends, and
          ends are what say which way the thing fills — a closed circle at 95%
          and one at 5% differ only by where the seam is.

          The gap also buys the figure its width back: the number sits in the
          widest part of the shape rather than between two arcs.
        */}
        <ProgressRing
          progress={progressRatio(consumed.kcal, target?.kcal ?? null)}
          size={186}
          thickness={14}
          sweep={270}
          startAngle={225}
          color={standing === 'beyond' ? theme.colors.danger : theme.colors.accent}
        >
          <Text style={[styles.figure, { color: theme.colors.text }]}>
            {formatKcal(Math.abs(headlineValue))}
          </Text>
          <Text style={[styles.figureLabel, { color: theme.colors.textMuted }]}>
            {headlineLabel}
          </Text>
        </ProgressRing>
      </View>

      {target === null ? (
        <Text style={[styles.note, { color: theme.colors.textFaint }]}>
          Aucun objectif défini
        </Text>
      ) : null}

      <View style={styles.columns}>
        {columns.map((column) => (
          <MacroColumnView key={column.label} column={column} />
        ))}
      </View>
    </View>
  );
}

function MacroColumnView({ column }: { column: MacroColumn }) {
  const theme = useTheme();

  return (
    <View style={styles.column}>
      <Text style={[styles.columnLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {column.label}
      </Text>

      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        {/*
          ALWAYS ITS OWN COLOUR, never red, however full. Going over on
          carbohydrates is not the same kind of event as going over on the day,
          and three red bars would say that it was.
        */}
        <View
          style={[
            styles.fill,
            {
              backgroundColor: column.color,
              width: `${progressRatio(column.consumed, column.target) * 100}%`,
            },
          ]}
        />
      </View>

      <Text style={[styles.columnValue, { color: theme.colors.text }]} numberOfLines={1}>
        {column.target === null
          ? `${formatMacroWhole(column.consumed)} g`
          : `${formatMacroWhole(column.consumed)} / ${formatMacroWhole(column.target)} g`}
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
  /**
   * The gauge box is square, but a three-quarter gauge only paints the top of
   * it: the arc ends at 135° and 225°, so its lowest point sits at
   * cos(45°) × radius below centre — about twenty points short of the bottom
   * edge on a 186-point box. That empty band was reading as a gap between the
   * figure and the bars, so it is pulled back out.
   *
   * If the gauge is ever resized, this moves with it: it is 0.11 × size,
   * rounded. Nothing computes it, because a magic number with its arithmetic
   * written down beside it is easier to change than a formula.
   */
  ringRow: { alignItems: 'center', marginBottom: -20 },
  figure: {
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  // Smaller than it was outside the ring: it has to sit under the figure
  // within the circle's own width, and "kcal au-dessus" is the longest of the
  // three labels.
  figureLabel: { fontSize: 12, textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  // Side by side rather than stacked: three macros are one glance, not three.
  // The top margin is small because ringRow has already given back the gauge's
  // empty bottom; between them they leave a normal gap rather than two.
  columns: { flexDirection: 'row', gap: 14, marginTop: 10 },
  column: { flex: 1, gap: 7 },
  // Centred over their bar, both of them: the bar is the column's axis, and
  // text ranged left against a centred shape reads as three things that do not
  // line up.
  columnLabel: { fontSize: 12, textAlign: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  columnValue: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});
