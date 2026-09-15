import { Picker } from '@react-native-picker/picker';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import type { NotificationTime } from '../domain/kinds';

/**
 * What time a notification fires: two wheels, hours and minutes.
 *
 * ## WHY A WHEEL HERE, WHERE THE CUTOFF HOUR GOT ROWS
 *
 * Amendment 14.12 no 9 chose rows with a tick for the theme and the cutoff
 * hour, for the third time, and the argument was: a UIPickerView costs a scroll
 * for what can be a tap, and in rows "bounded between 0h and 6h" can be SEEN
 * rather than merely being true.
 *
 * Neither half applies. The cutoff has seven possible values and they fit on
 * screen; a notification time has 24 x 12 and they do not. A list of rows would
 * be a scroll of two hundred and eighty-eight, which is the thing the wheel was
 * refused for. And there is no bound worth seeing: any time of day is a legal
 * answer.
 *
 * So this is the same reasoning arriving at the other answer, not an exception
 * to it.
 *
 * TWO PICKERS, NOT ONE WITH TWO COMPONENTS — the note quantity-wheel carries.
 * UIPickerView does have several components in one view and no React Native
 * binding exposes them, so the selection band is drawn twice. Visible if looked
 * for, and the same cost the quantity screen already pays.
 *
 * MINUTES BY FIVE. Sixty rows to choose the moment a reminder fires is
 * precision nobody wants and a wheel nobody can land on; twelve is one flick.
 * A stored value that is not a multiple of five — an imported archive, a row
 * repaired by hand — still displays, because the wheel is told its value rather
 * than only its options; it simply cannot be re-chosen exactly.
 */

const MINUTE_STEP = 5;

export function TimeWheel({
  value,
  onChange,
}: {
  value: NotificationTime;
  onChange: (time: NotificationTime) => void;
}) {
  const theme = useTheme();

  // Built once: they never change, and rebuilding them on every turn of the
  // other wheel is the kind of work a picker makes visible.
  const hours = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => (
        <Picker.Item key={hour} label={String(hour).padStart(2, '0')} value={hour} />
      )),
    [],
  );

  const minutes = useMemo(() => {
    const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);
    // A stored minute off the grid keeps its own item, so the wheel shows the
    // truth rather than snapping to something the user never chose.
    const all = steps.includes(value.minute) ? steps : [...steps, value.minute].sort((a, b) => a - b);
    return all.map((minute) => (
      <Picker.Item key={minute} label={String(minute).padStart(2, '0')} value={minute} />
    ));
  }, [value.minute]);

  const item = { color: theme.colors.text, fontSize: 20 };

  return (
    <View style={styles.wheel}>
      <Picker
        selectedValue={value.hour}
        onValueChange={(hour) => onChange({ ...value, hour: Number(hour) })}
        itemStyle={item}
        style={styles.column}
        accessibilityLabel="Heure"
      >
        {hours}
      </Picker>

      <Picker
        selectedValue={value.minute}
        onValueChange={(minute) => onChange({ ...value, minute: Number(minute) })}
        itemStyle={item}
        style={styles.column}
        accessibilityLabel="Minute"
      >
        {minutes}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  // The height iOS gives a picker in a sheet. Left to itself in a row it would
  // collapse, having no intrinsic height of its own here.
  wheel: { flexDirection: 'row', height: 180 },
  // Equal halves: both columns hold two digits, so neither needs more room.
  column: { flex: 1 },
});
