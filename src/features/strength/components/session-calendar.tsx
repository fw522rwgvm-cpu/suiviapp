import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { monthName } from '@/core/format';
import { localDateParts, type LocalDate } from '@/core/date';
import type { CalendarCell } from '../domain/strength-panel';

/**
 * The session calendar of specs 10.6.
 *
 * > Calendrier des séances.
 *
 * ## A WEEK PER COLUMN, NOT A MONTH GRID
 *
 * MonthCalendar exists and is deliberately not reused: it is a SELECTOR of one
 * month, and this calendar is governed by the same 3 months / 1 an / tout
 * control as the charts beside it. A month grid cannot show a year. Seven rows
 * and one column per week scales to all three ranges — thirteen columns for a
 * quarter, fifty-two for a year — and the eye reads a run of blank columns as
 * a break in training without being told to.
 *
 * What IS shared is core/date: every cell comes out of it, so the grid is the
 * same at +14 as in Paris and the week starts on Monday (D3).
 *
 * ## IT IS A PICTURE, NOT A CONTROL
 *
 * Nothing here is tappable. Specs 10.6 asks for a calendar among the charts,
 * and the one interaction the document grants any of them is "toucher un point
 * affiche sa valeur et sa date" — which on a grid where each cell already
 * carries its own date would say nothing new. A cell that looked tappable and
 * did nothing is the defect the Séances list had until this slice.
 *
 * ## IT OPENS ON THE RIGHT, BECAUSE THE RECENT END IS THE SUBJECT
 *
 * A year is more columns than the screen holds. Scrolled to the start, the
 * panel would open on last October — so the strip is pushed to its end once,
 * on mount, and the reader arrives at this week.
 */
export function SessionCalendar({
  weeks,
  trained,
}: {
  weeks: readonly CalendarCell[][];
  /** The civil days that carry at least one session. */
  trained: ReadonlySet<string>;
}) {
  const theme = useTheme();
  const scroller = useRef<ScrollView>(null);

  /*
    Pushed to the end on mount rather than on every render: the range control
    remounts this by changing the number of columns, which is exactly when the
    reader wants the recent end again, and nothing else should move it.

    `animated: false` — this is the position the strip STARTS at, not a
    movement, and an animation on first paint reads as the page settling.
  */
  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: false });
  }, [weeks.length]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityRole="image"
        accessibilityLabel={`Calendrier des séances, ${trained.size} ${
          trained.size === 1 ? 'jour' : 'jours'
        } d’entraînement`}
      >
        {weeks.map((week, index) => (
          <View key={week[0]?.date ?? index} style={styles.column}>
            {/*
              A month label above the column that CONTAINS the first of a
              month, so the strip is readable without an axis. Anything denser
              would be a label per column; anything sparser and a year of
              squares says nothing about when.
            */}
            <Text style={[styles.month, { color: theme.colors.textFaint }]} numberOfLines={1}>
              {monthLabelFor(week)}
            </Text>
            {week.map((cell) => (
              <View
                key={cell.date}
                style={[
                  styles.cell,
                  {
                    borderRadius: 3,
                    backgroundColor: cellColour(cell, trained, theme),
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * What a cell says.
 *
 * Three states, and the third is the one that is easy to forget: a day OUTSIDE
 * the range is drawn as nothing at all rather than as an untrained day. A grey
 * square for a day the range never covered would say "you did not train" about
 * a day nobody was asked about — and the first and last columns are full of
 * them, purely so the grid is square.
 */
function cellColour(
  cell: CalendarCell,
  trained: ReadonlySet<string>,
  theme: ReturnType<typeof useTheme>,
): string {
  if (!cell.inRange) return 'transparent';
  return trained.has(cell.date) ? theme.colors.accent : theme.colors.border;
}

/** The month name over the column holding its first day, and nothing otherwise. */
function monthLabelFor(week: readonly CalendarCell[]): string {
  const first = week.find((cell) => localDateParts(cell.date).day === 1);
  if (first === undefined) return '';
  return monthName(first.date as LocalDate).slice(0, 3);
}

const CELL = 11;

const styles = StyleSheet.create({
  container: { gap: 6 },
  strip: { flexDirection: 'row', gap: 3, paddingRight: 4 },
  column: { gap: 3 },
  // A fixed height, so the columns with no month name keep their cells level
  // with the ones that have one.
  month: { fontSize: 9, height: 11, width: CELL * 3 },
  cell: { width: CELL, height: CELL },
});
