import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { formatDayCompact } from '@/core/format';
import type { PersonalRecord, PersonalRecords } from '../domain/exercise-stats';

/**
 * The four personal records of specs 10.1.
 *
 * > Records personnels : charge maximale, meilleur 1RM estimé, meilleur volume
 * > de série, meilleur volume de séance.
 *
 * ## THEY ARE OVER ALL OF HISTORY, AND THE RANGE CONTROL DOES NOT TOUCH THEM
 *
 * Specs 10.1 lists the ranges under "Graphiques" and the records as a separate
 * bullet. A record that changed when somebody moved a segmented control would
 * not be a record — it would be a maximum over a window, which is what the
 * chart underneath already draws. So the card sits ABOVE the range control,
 * where nothing suggests the two are connected.
 *
 * ## EACH ONE CARRIES ITS DATE, WHICH SPECS 10.1 DOES NOT ASK FOR
 *
 * "120 kg" alone is half a fact. What makes a record worth reading is whether
 * it is from last month or from two years ago, because that is the difference
 * between progress and an exercise that was abandoned. It costs nothing: the
 * rows carry their session already. FLAGGED as an addition.
 *
 * ## NOTHING YET IS A DASH, NOT AN EMPTY CARD
 *
 * An exercise never trained shows four dashes rather than disappearing. The
 * rule previousText already states for its column: a blank where a figure
 * belongs reads as a rendering fault, and a dash says the question was asked.
 */
export function ExerciseRecords({
  records,
  formatKg,
}: {
  records: PersonalRecords;
  /** How a load is written, so the page has one spelling of a kilogram. */
  formatKg: (value: number, decimals: number) => string;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
        theme.shadow,
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>RECORDS</Text>
      <View style={styles.grid}>
        <Cell label="Charge max" record={records.maxLoadKg} text={(v) => formatKg(v, 1)} />
        <Cell label="1RM estimé" record={records.bestOneRm} text={(v) => formatKg(v, 1)} />
        <Cell label="Volume série" record={records.bestSetVolume} text={(v) => formatKg(v, 0)} />
        <Cell
          label="Volume séance"
          record={records.bestSessionVolume}
          text={(v) => formatKg(v, 0)}
        />
      </View>
    </View>
  );
}

function Cell({
  label,
  record,
  text,
}: {
  label: string;
  record: PersonalRecord | null;
  text: (value: number) => string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.cell}>
      <Text style={[styles.cellLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.cellValue,
          { color: record === null ? theme.colors.textFaint : theme.colors.text },
        ]}
        numberOfLines={1}
      >
        {record === null ? '—' : text(record.value)}
      </Text>
      {/*
        The date is held even when there is no record, as an empty line: four
        cells that changed height depending on whether they had a value would
        make the grid ragged for a reason nobody can see.
      */}
      <Text style={[styles.cellDate, { color: theme.colors.textFaint }]} numberOfLines={1}>
        {record === null ? ' ' : formatDayCompact(record.date)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  title: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  // Two by two rather than four across: "Volume séance" does not fit a quarter
  // of 358 points, and a truncated label on a card of four figures is the one
  // thing that makes them unreadable as a set.
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  cell: { width: '50%', gap: 1 },
  cellLabel: { fontSize: 12 },
  cellValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cellDate: { fontSize: 11 },
});
