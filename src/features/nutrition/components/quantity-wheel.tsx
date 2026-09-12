import { useEffect, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * How much of it: a whole number, a fraction, and what it is counted in.
 *
 * Three wheels turning together, so the amount and its unit are one answer
 * rather than a figure typed in one place and a unit chosen in another. A
 * third of a slice is a thing people eat; typing 0,333 is not a thing people
 * do.
 *
 * ## IT IS NOT A UIPickerView, AND THAT IS A DECISION
 *
 * A real wheel is UIPickerView, and the only way to one from React Native is
 * @react-native-picker/picker -- a NATIVE dependency, outside section 5, which
 * the project's rules make an event requiring explicit approval, and which
 * costs a build cycle on an account that can only sign for seven days.
 *
 * So these are lists that snap, which is what a wheel is underneath: a fixed
 * row height, a snap interval equal to it, fast deceleration, and a band drawn
 * across the middle to say where the answer is read. What it does not have is
 * the system's curvature and its sound. Said here so nobody has to wonder.
 *
 * ## Why the fraction is its own wheel
 *
 * Because it is a different question. "How many" is answered from zero
 * upwards and has no end; "and a bit more" has seven answers and no order
 * worth scrolling. Putting halves and thirds into the number wheel would make
 * every whole number three taps further away than the last.
 */

/** Tall enough to read, short enough that five fit above the keyboard's room. */
const ITEM = 36;
const VISIBLE = 5;
const HEIGHT = ITEM * VISIBLE;

/** The whole part. One thousand is past any plate. */
const WHOLES = Array.from({ length: 1001 }, (_, value) => value);

/**
 * The fractions a person actually says, in the order they grow.
 *
 * The first is "none", and it is spelled as a dash rather than as 0: a wheel
 * showing 0 beside another 0 reads as a figure of nought point nought.
 */
export const FRACTIONS: readonly { label: string; value: number }[] = [
  { label: '—', value: 0 },
  { label: '1/8', value: 0.125 },
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 0.5 },
  { label: '2/3', value: 2 / 3 },
  { label: '3/4', value: 0.75 },
  { label: '7/8', value: 0.875 },
];

export interface WheelChoice {
  /** The whole part, as shown on the first wheel. */
  whole: number;
  /** Index into FRACTIONS. */
  fraction: number;
  /** Index into `units`: 0 is the base unit, the rest are the food's portions. */
  unit: number;
}

export function amountOf(choice: WheelChoice): number {
  return choice.whole + (FRACTIONS[choice.fraction]?.value ?? 0);
}

export function QuantityWheel({
  units,
  choice,
  onChange,
}: {
  /** What it can be counted in: the base unit first, then this food's portions. */
  units: readonly string[];
  choice: WheelChoice;
  onChange: (choice: WheelChoice) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wheel}>
      {/*
        The band that says where the answer is read, drawn behind the wheels
        and across all three: it belongs to the control, not to any one column.
      */}
      <View
        style={[styles.band, { backgroundColor: theme.colors.background }]}
        pointerEvents="none"
      />

      <Column
        values={WHOLES.map(String)}
        index={choice.whole}
        onSelect={(whole) => onChange({ ...choice, whole })}
        align="flex-end"
        accessibilityLabel="Nombre"
      />
      <Column
        values={FRACTIONS.map((fraction) => fraction.label)}
        index={choice.fraction}
        onSelect={(fraction) => onChange({ ...choice, fraction })}
        align="center"
        accessibilityLabel="Fraction"
      />
      <Column
        values={units}
        index={choice.unit}
        onSelect={(unit) => onChange({ ...choice, unit })}
        align="flex-start"
        accessibilityLabel="Unité"
      />
    </View>
  );
}

function Column({
  values,
  index,
  onSelect,
  align,
  accessibilityLabel,
}: {
  values: readonly string[];
  index: number;
  onSelect: (index: number) => void;
  align: 'flex-start' | 'center' | 'flex-end';
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const list = useRef<FlatList<string>>(null);

  useEffect(() => {
    // Put the wheel where the value already is, without animating: this runs
    // when the value arrives from a query, and a wheel that spins into place
    // on opening reads as the screen changing its mind.
    list.current?.scrollToOffset({ offset: index * ITEM, animated: false });
    // Only when the value changes from OUTSIDE. Scrolling reports its own
    // index, and re-scrolling to it would fight the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.length]);

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const at = Math.round(event.nativeEvent.contentOffset.y / ITEM);
    const clamped = Math.min(Math.max(at, 0), values.length - 1);
    if (clamped !== index) onSelect(clamped);
  }

  return (
    <FlatList
      ref={list}
      data={values as string[]}
      keyExtractor={(value, at) => `${at}-${value}`}
      style={styles.column}
      contentContainerStyle={styles.columnContent}
      showsVerticalScrollIndicator={false}
      // The three things that make a list behave like a wheel.
      snapToInterval={ITEM}
      decelerationRate="fast"
      getItemLayout={(_, at) => ({ length: ITEM, offset: ITEM * at, index: at })}
      // Both, because a slow drag never gains momentum and would otherwise
      // settle on a row without ever saying so.
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      accessibilityLabel={accessibilityLabel}
      renderItem={({ item, index: at }) => (
        <View style={[styles.item, { alignItems: align }]}>
          <Text
            style={[
              styles.value,
              at === index
                ? { color: theme.colors.text }
                : { color: theme.colors.textFaint, fontSize: 17 },
            ]}
            numberOfLines={1}
          >
            {item}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  wheel: { flexDirection: 'row', height: HEIGHT },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (HEIGHT - ITEM) / 2,
    height: ITEM,
    borderRadius: 10,
  },
  column: { flex: 1 },
  // Half a wheel of padding at each end, so the first and last values can
  // reach the middle like any other.
  columnContent: { paddingVertical: (HEIGHT - ITEM) / 2 },
  item: { height: ITEM, justifyContent: 'center', paddingHorizontal: 10 },
  value: { fontSize: 20, fontVariant: ['tabular-nums'] },
});
