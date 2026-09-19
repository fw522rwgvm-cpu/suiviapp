import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { Segmented } from '@/core/ui/segmented';
import { useTheme } from '@/core/theme';
import { formatDayCompact } from '@/core/format';
import { useToday } from '@/features/settings/data/settings-queries';
import type { HistorySet } from '../data/history-reads';
import {
  exerciseSessionPoints,
  personalRecords,
  type ExerciseSessionPoint,
} from '../domain/exercise-stats';
import {
  bucketChartPoints,
  DEFAULT_EXERCISE_RANGE,
  EXERCISE_RANGE_KEYS,
  exerciseRangeFor,
  exerciseRangeLabel,
  type ExerciseRangeKey,
} from '../domain/exercise-range';
import {
  DEFAULT_EXERCISE_METRIC,
  EXERCISE_METRICS,
  metricFor,
  type ExerciseMetricKey,
} from '../domain/exercise-metric';
import { ExerciseChart } from './exercise-chart';
import { ExerciseRecords } from './exercise-records';

/**
 * Everything specs 10.1 asks of an exercise's past, in one section.
 *
 * > Graphiques sur 3 mois / 1 an / tout : … Records personnels : … Historique
 * > complet.
 *
 * ## ONE READ UPSTREAM, THREE FOLDS HERE
 *
 * The records, the chart and the list are three questions about the rows
 * useExerciseHistory already holds. Changing the range or the metric touches no
 * database — it re-folds what is in hand, which is what makes those controls
 * instant on a page D16 budgets.
 *
 * ## THE ORDER ON THE PAGE IS THE ORDER OF THE QUESTIONS
 *
 * Records first, because "what is my best" is answered at a glance and is the
 * reason most visits happen. Then the chart, which answers "is it moving".
 * Then the complete history, which is the reference nobody reads top to bottom
 * but everybody occasionally needs.
 *
 * It also puts the records ABOVE the range control, which is deliberate: they
 * are over all of history and must not look governed by it.
 */
export function ExerciseHistorySection({ history }: { history: readonly HistorySet[] }) {
  const theme = useTheme();
  const today = useToday();

  const [range, setRange] = useState<ExerciseRangeKey>(DEFAULT_EXERCISE_RANGE);
  const [metricKey, setMetricKey] = useState<ExerciseMetricKey>(DEFAULT_EXERCISE_METRIC);

  const points = exerciseSessionPoints(history);
  const records = personalRecords(history);
  const metric = metricFor(metricKey);

  // The oldest point there is, for "tout". The list is oldest first, so this
  // is its head rather than a scan.
  const earliest = points[0]?.date ?? null;
  const span = exerciseRangeFor(range, today, earliest);
  const chartPoints = bucketChartPoints(points, span, span.grain);

  if (history.length === 0) {
    return (
      <View style={styles.section}>
        <SectionTitle title="Historique" />
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Cet exercice n’a encore été fait dans aucune séance.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionTitle title="Historique" />

      <ExerciseRecords records={records} formatKg={formatKg} />

      <Segmented
        options={EXERCISE_RANGE_KEYS.map((key) => ({
          value: key,
          label: exerciseRangeLabel(key),
        }))}
        value={range}
        onChange={setRange}
        grow
      />

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
        {/*
          A scrolling strip of chips rather than a segmented control: five
          labels cannot be equal segments on 390 points without truncating,
          and "Vol. sé…" is worse than a strip that has to be pushed.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {EXERCISE_METRICS.map((item) => {
            const chosen = item.key === metricKey;
            return (
              <Pressable
                key={item.key}
                onPress={() => setMetricKey(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={item.label}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: chosen ? theme.colors.accent : theme.colors.background,
                    borderRadius: theme.radius.sm,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: chosen ? theme.colors.onAccent : theme.colors.text },
                  ]}
                >
                  {item.short}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ExerciseChart points={chartPoints} metric={metric} grain={span.grain} />
      </View>

      <SessionList points={points} />
    </View>
  );
}

/**
 * The "historique complet" of specs 10.1: every session, most recent first.
 *
 * ## IT IS COMPLETE, AND THE RANGE CONTROL DOES NOT NARROW IT
 *
 * "Historique COMPLET" is what specs 10.1 says, and the ranges belong to the
 * charts a bullet above. A list that shrank when somebody chose three months
 * would be answering a question nobody asked of it — and the reason to open
 * this list at all is usually to find something that is not recent.
 *
 * ## NEWEST FIRST, WHICH IS THE OPPOSITE OF THE CHART
 *
 * A chart reads left to right in time; a list of records reads newest first,
 * as every other list in this application does. The fold produces oldest
 * first because that is the direction an accumulation runs, so this reverses a
 * copy rather than asking for a second ordering.
 *
 * ## EACH ROW OPENS ITS SESSION
 *
 * Which is the page specs 10.5 adds in this same slice. Before it existed
 * there would have been nowhere to go, and a list of inert rows about
 * workouts you cannot open would have been a worse answer than none.
 */
function SessionList({ points }: { points: readonly ExerciseSessionPoint[] }) {
  const theme = useTheme();
  const router = useRouter();
  const newestFirst = [...points].reverse();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          paddingVertical: 2,
        },
        theme.shadow,
      ]}
    >
      {newestFirst.map((point, index) => (
        <View key={point.sessionId}>
          {index === 0 ? null : <ListSeparator />}
          <Pressable
            onPress={() => router.push(`/(tabs)/training/session/${point.sessionId}`)}
            accessibilityRole="button"
            accessibilityLabel={`Séance du ${formatDayCompact(point.date)}, ${summaryOf(point)}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.colors.background : 'transparent' },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowDate, { color: theme.colors.text }]}>
                {formatDayCompact(point.date)}
              </Text>
              <Text style={[styles.rowDetail, { color: theme.colors.textMuted }]}>
                {summaryOf(point)}
              </Text>
            </View>
            <SymbolView
              name="chevron.right"
              size={13}
              tintColor={theme.colors.textFaint}
              fallback={<Text style={{ color: theme.colors.textFaint }}>›</Text>}
            />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * One session's worth of this exercise, in one line.
 *
 * "3 séries · 70 kg max · 1 160 kg" — the count, the heaviest, the volume. A
 * set-by-set listing belongs to the session page, which is one tap away; what
 * a history row has to do is let somebody find the right session.
 *
 * A bodyweight session says its repetitions instead, because the two figures
 * it cannot fill are the two that would otherwise be dashes.
 */
function summaryOf(point: ExerciseSessionPoint): string {
  const sets = point.setCount === 1 ? '1 série' : `${point.setCount} séries`;
  if (point.maxLoadKg === null) return `${sets} · ${point.totalReps} reps`;

  const parts = [sets, `${formatKg(point.maxLoadKg, 1)} max`];
  if (point.sessionVolume !== null) parts.push(formatKg(point.sessionVolume, 0));
  return parts.join(' · ');
}

/**
 * A load, written the way the rest of the application writes one.
 *
 * A comma for the decimal separator and no trailing zero. session-text.ts has
 * the same function and keeps it private; the duplication is named rather than
 * hidden, and whichever is next edited for its own reasons should take the
 * other with it into core/format.
 */
function formatKg(value: number, decimals: number): string {
  const rounded = value.toFixed(decimals);
  const trimmed = decimals > 0 ? String(Number(rounded)) : rounded;
  return `${trimmed.replace('.', ',')} kg`;
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600' },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  chips: { gap: 8, paddingRight: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 2,
    minHeight: 52,
  },
  rowText: { flex: 1, gap: 2 },
  rowDate: { fontSize: 15, fontWeight: '500' },
  rowDetail: { fontSize: 13 },
  empty: { fontSize: 15, paddingVertical: 12 },
});
