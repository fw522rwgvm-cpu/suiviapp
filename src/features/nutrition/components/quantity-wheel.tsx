import { Picker } from '@react-native-picker/picker';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import {
  FRACTIONS,
  settleWheel,
  type WheelChoice,
  type WheelUnit,
} from '../domain/wheel-choice';

/**
 * How much of it: a whole number, a fraction, and what it is counted in.
 *
 * Three wheels turning together, so the amount and its unit are one answer
 * rather than a figure typed in one place and a unit chosen in another. A
 * third of a slice is a thing people eat; typing 0,333 is not a thing people
 * do.
 *
 * ## THESE ARE REAL UIPickerViews
 *
 * A first version was three snapping lists, because a wheel means
 * `@react-native-picker/picker` and that is a native dependency, outside
 * section 5, which this project makes an event requiring approval. It was
 * approved, and the imitation is gone: `Picker` on iOS IS a UIPickerView, with
 * the system's curvature, its deceleration and its click.
 *
 * THREE PICKERS, NOT ONE WITH THREE COMPONENTS. UIPickerView does have several
 * components in one view, and no React Native binding exposes them; every
 * picker here is a view of its own. What that costs is a selection band drawn
 * three times instead of once, which is visible if looked for.
 *
 * ## Why the fraction is its own wheel
 *
 * Because it is a different question. "How many" is answered from zero upwards
 * and has no end; "and a bit more" has seven answers and no order worth
 * scrolling. Putting halves and thirds into the number wheel would make every
 * whole number three taps further away than the last.
 *
 * The two rules about what may be shown — a portion starts at one, and nothing
 * is not a quantity — live in the domain, not here. See settleWheel.
 */

/** One thousand is past any plate. */
const LAST_WHOLE = 1000;

export function QuantityWheel({
  units,
  choice,
  onChange,
}: {
  /** What it can be counted in: the base unit first, then this food's portions. */
  units: readonly WheelUnit[];
  choice: WheelChoice;
  onChange: (choice: WheelChoice) => void;
}) {
  const theme = useTheme();

  // A thousand items is a thousand React elements; they never change, so they
  // are built once rather than on every turn of another wheel.
  const wholes = useMemo(
    () =>
      Array.from({ length: LAST_WHOLE + 1 }, (_, value) => (
        <Picker.Item key={value} label={String(value)} value={value} />
      )),
    [],
  );

  // Seventeen, not twenty. A UIPickerView cuts a label that does not fit and
  // never shrinks it, so the size has to be chosen for the narrowest column
  // rather than for the widest -- and four digits in a quarter of a card is
  // the narrowest thing here.
  const item = { color: theme.colors.text, fontSize: 17 };

  function move(next: WheelChoice): void {
    onChange(settleWheel(choice, next, units));
  }

  return (
    <View style={styles.wheel}>
      <Picker
        selectedValue={choice.whole}
        onValueChange={(whole) => move({ ...choice, whole: Number(whole) })}
        itemStyle={item}
        style={styles.number}
        accessibilityLabel="Nombre"
      >
        {wholes}
      </Picker>

      <Picker
        selectedValue={choice.fraction}
        onValueChange={(fraction) => move({ ...choice, fraction: Number(fraction) })}
        itemStyle={item}
        style={styles.number}
        accessibilityLabel="Fraction"
      >
        {FRACTIONS.map((fraction, index) => (
          <Picker.Item key={fraction.label} label={fraction.label} value={index} />
        ))}
      </Picker>

      <Picker
        selectedValue={choice.unit}
        onValueChange={(unit) => move({ ...choice, unit: Number(unit) })}
        itemStyle={item}
        style={styles.unit}
        accessibilityLabel="Unité"
      >
        {units.map((unit, index) => (
          <Picker.Item key={unit.label} label={unit.label} value={index} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  // The height iOS gives a picker in a sheet. Left to itself in a row it would
  // collapse, having no intrinsic height of its own here.
  wheel: { flexDirection: 'row', height: 180 },
  // The two figure wheels share one half and the names take the other. A
  // picker does not shrink its text to fit -- it cuts it -- and "cuillere a
  // soupe" cut in the middle is not a unit anyone can choose with confidence.
  // Four digits and a fraction need far less room than a word does.
  number: { flex: 1 },
  unit: { flex: 2 },
});
