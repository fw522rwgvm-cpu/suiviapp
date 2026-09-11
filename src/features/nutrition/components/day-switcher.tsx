import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatDayTitle } from '@/core/format';
import { useTheme } from '@/core/theme';

/**
 * The day being looked at, and the way to the next one (specs 8.3).
 *
 * > Navigation between days: previous / next buttons, direct access to a date,
 * > horizontal swipe.
 *
 * WHY IT IS A ROW OF ITS OWN AND NOT PART OF THE HEADER.
 *
 * The system header used to carry four controls: two chevrons for the day, and
 * two icons for the library and the calendar. They are two different kinds of
 * thing — one changes WHAT you are looking at, the other takes you SOMEWHERE
 * ELSE — and mixing them in one bar makes both harder to find. Split, the
 * header keeps only the icons, and the day lives here, where it can be bigger
 * than a navigation-bar title is allowed to be.
 *
 * It sits ABOVE the carousel rather than inside a page, so there is one of it
 * rather than three, and it does not slide away under the finger. The date it
 * shows commits with the page, exactly as the header title did before.
 */
export function DaySwitcher({
  date,
  today,
  onPrevious,
  onNext,
  onPickDate,
}: {
  date: LocalDate;
  today: LocalDate;
  onPrevious: () => void;
  onNext: () => void;
  onPickDate: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Arrow symbol="chevron.left" label="Jour précédent" onPress={onPrevious} />

      {/*
        The label is the target for the date picker as well: a date you can
        read is a date you expect to be able to touch, and it is a far larger
        target than the calendar icon in the header.
      */}
      <Pressable
        onPress={onPickDate}
        accessibilityRole="button"
        accessibilityLabel="Choisir une date"
        style={styles.label}
      >
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {formatDayTitle(date, today)}
        </Text>
      </Pressable>

      <Arrow symbol="chevron.right" label="Jour suivant" onPress={onNext} />
    </View>
  );
}

function Arrow({
  symbol,
  label,
  onPress,
}: {
  symbol: 'chevron.left' | 'chevron.right';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [
        styles.arrow,
        {
          backgroundColor: pressed ? theme.colors.border : theme.colors.surface,
          borderColor: theme.colors.border,
        },
        theme.shadow,
      ]}
    >
      <SymbolView name={symbol} size={15} tintColor={theme.colors.text} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  label: { flex: 1, alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '600' },
  arrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
