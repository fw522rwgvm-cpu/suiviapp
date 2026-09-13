import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import {
  localDateFromParts,
  localDateParts,
  monthGrid,
  nextMonth,
  previousMonth,
  type LocalDate,
} from '@/core/date';
import { monthName } from '@/core/format';
import { useTheme } from '@/core/theme';

/**
 * A month grid, for the direct access to a date of specs 8.3.
 *
 * Written by hand rather than taken from @react-native-community/datetimepicker,
 * which is a NATIVE dependency and absent from section 5: adding one is an
 * event costing a CI cycle, and this needs about a hundred and fifty lines on
 * top of primitives core/date already has. It will serve again for the
 * planning overrides of slice 5 and the weight history of slice 8, which is
 * also when it earns its move to core/ui — at its second real user, not by
 * anticipation (D10).
 *
 * It touches no Date and does no arithmetic of its own beyond counting cells:
 * every date comes out of core/date, so the grid is the same at +14 as in
 * Paris. The week starts on Monday (D3).
 *
 * Selecting a date only changes what is displayed. Nothing here writes, so
 * browsing the calendar materialises nothing (specs 8.2).
 */

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export function MonthCalendar({
  month,
  selected,
  today,
  onSelect,
  onMonthChange,
}: {
  /** Any date inside the month on show. */
  month: LocalDate;
  selected: LocalDate;
  today: LocalDate;
  onSelect: (date: LocalDate) => void;
  onMonthChange: (month: LocalDate) => void;
}) {
  const theme = useTheme();
  const { year, month: monthNumber } = localDateParts(month);
  const first = localDateFromParts({ year, month: monthNumber, day: 1 });
  const cells = monthGrid(month);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onMonthChange(previousMonth(first))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
        >
          <SymbolView name="chevron.left" size={16} tintColor={theme.colors.accent} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {monthName(first)} {year}
        </Text>
        <Pressable
          onPress={() => onMonthChange(nextMonth(first))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
        >
          <SymbolView name="chevron.right" size={16} tintColor={theme.colors.accent} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={`${initial}-${index}`} style={styles.cell}>
            <Text style={[styles.initial, { color: theme.colors.textFaint }]}>{initial}</Text>
          </View>
        ))}

        {cells.map((date, index) => {
          if (date === null) {
            return <View key={`blank-${index}`} style={styles.cell} />;
          }
          const isSelected = date === selected;
          const isToday = date === today;
          return (
            <Pressable
              key={date}
              onPress={() => onSelect(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  isSelected ? { backgroundColor: theme.colors.accent } : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: isSelected
                        ? theme.colors.onAccent
                        : isToday
                          ? theme.colors.accent
                          : theme.colors.text,
                      fontWeight: isToday || isSelected ? '700' : '400',
                    },
                  ]}
                >
                  {localDateParts(date).day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Seven to a row, whatever the width.
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 12 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 16, fontVariant: ['tabular-nums'] },
});
