import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LocalDate } from '@/core/date';
import { formatWeight } from '@/core/format';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useMinimumVisible } from '@/core/ui/use-minimum-visible';
import { Segmented } from '@/core/ui/segmented';
import { Text } from '@/core/ui/text';
import { rollingMean, WEEKLY_WINDOW_DAYS } from '../domain/series';
import { useKcalBuckets } from '../data/stats-queries';
import {
  useActiveGoal,
  useRateWindow,
  useWeightSeries,
} from '@/features/weight/data/weight-queries';
import { weightPanel } from '@/features/weight/domain/panel';
import {
  readRangeFor,
  weightRangeFor,
  weightRangeLabel,
  WEIGHT_RANGE_KEYS,
  type WeightRangeKey,
} from '@/features/weight/domain/weight-range';
import {
  aimedRateText,
  gapText,
  goalTargetText,
  projectionText,
  rateText,
} from '@/features/weight/domain/weight-text';
import { StatCard } from './stat-card';
import { WeightChart } from './weight-chart';
import { WeightCrossChart } from './weight-cross-chart';
import { PANEL_LOADING_MS } from '../domain/panel-loading';

/**
 * The weight panel of the dashboard (specs 9.2, 9.4).
 *
 * ## ITS OWN RANGE CONTROL, AND THAT IS NOT A DUPLICATE
 *
 * Specs 8.7 offers the nutrition panel 7, 30 and 90 days; specs 9.2 offers this
 * one 30 days, 90 days, a year and everything. Both lists are normative and
 * they are different, so one control cannot serve both: seven days of a curve
 * smoothed over seven days has one usable point, and "tout" is a range specs
 * 8.7 never asks of the calories.
 *
 * ## AND NO HEADING OF ITS OWN, SINCE THE TAB IS THE HEADING
 *
 * The section was titled "Poids" while the two panels were stacked and needed
 * telling apart. The tab says it now, directly above, so the title would be the
 * same word twice — which is what took the headings off the recipe and
 * recent-meal lists once the filter named them.
 *
 * ## THE GRAIN CHANGES WITH THE RANGE, AND THE SCREEN NEVER KNOWS
 *
 * weightRangeFor decides day, week or month (D9), the reads group in SQL (D13),
 * and everything below receives a dense series of points carrying civil dates.
 * Nothing here branches on the grain — the only thing that does is `showRaw`,
 * which specs 9.2 precision 3 ties to the same threshold.
 */
export function WeightPanelSection({
  today,
  range,
  onRangeChange,
  onReady,
}: {
  today: LocalDate;
  range: WeightRangeKey;
  onRangeChange: (range: WeightRangeKey) => void;
  /**
   * Called once this panel is showing real content.
   *
   * The screen holds the page's height while a panel reloads, so that a
   * short loading state cannot make iOS clamp the scroll offset. Only the
   * panel knows when that is over, and it already does: `waiting` is the
   * indicator's own floor.
   */
  onReady?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const goal = useActiveGoal();

  /** What is DRAWN. */
  const dateRange = useMemo(() => weightRangeFor(range, today), [range, today]);
  /**
   * What is READ — the same range widened backwards by the smoothing's run-up.
   *
   * Kept apart from the one above so the extra days cannot leak onto the axis:
   * the panel smooths over this and then keeps only the points inside
   * `dateRange`.
   */
  const readRange = useMemo(() => readRangeFor(dateRange), [dateRange]);

  const series = useWeightSeries(readRange);
  const rateWindow = useRateWindow(today);
  const kcal = useKcalBuckets(dateRange.from, dateRange.to, dateRange.grain);

  const panel = useMemo(() => {
    if (series.data === undefined || rateWindow.data === undefined) return null;
    return weightPanel(dateRange, series.data, rateWindow.data, goal.data ?? null, today);
  }, [dateRange, series.data, rateWindow.data, goal.data, today]);

  /**
   * The calories series, aligned to the weight buckets position by position.
   *
   * At the daily grain it is the seven-day rolling mean specs 9.4 asks for. At
   * the weekly and monthly grain the bucket mean IS already an average over at
   * least seven days — the same reasoning specs 9.2 precision 3 gives for the
   * weight series, applied to the other one so the two are treated alike.
   */
  const kcalSeries = useMemo(() => {
    if (panel === null || kcal.data === undefined) return null;
    const perBucket = panel.points.map((point) => kcal.data.get(point.date) ?? null);
    return dateRange.grain === 'day' ? rollingMean(perBucket, WEEKLY_WINDOW_DAYS) : perBucket;
  }, [panel, kcal.data, dateRange.grain]);

  /**
   * The indicator, held to a floor once it has appeared at all.
   *
   * Not `panel === null` directly: a first visit answers fast enough to be seen
   * and not fast enough to be missed, which is a flash, and a flash reads as a
   * defect. Nothing is delayed on a range already read — useMinimumVisible only
   * imposes the floor once the waiting has begun. See PANEL_LOADING_MS.
   */
  const waiting = useMinimumVisible(panel === null, PANEL_LOADING_MS);

  useEffect(() => {
    if (!waiting) onReady?.();
  }, [waiting, onReady]);

  const empty = panel !== null && panel.points.every((point) => point.raw === null);

  return (
    <>
      <Segmented
        options={WEIGHT_RANGE_KEYS.map((key) => ({
          value: key,
          label: weightRangeLabel(key),
        }))}
        value={range}
        onChange={onRangeChange}
        grow
      />

      {waiting || panel === null ? (
        <View style={styles.waiting}>
          <LoadingDots />
        </View>
      ) : empty ? (
        <View style={styles.waiting}>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            Aucune pesée
          </Text>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            Saisissez votre poids sous les repas du Journal. La courbe apparaît dès la
            première mesure.
          </Text>
        </View>
      ) : (
        <>
          <StatCard
            title="Évolution"
            headline={panel.currentKg === null ? '—' : formatWeight(panel.currentKg)}
            caption={
              panel.currentKg === null
                ? 'Aucune pesée récente'
                : 'Poids lissé le plus récent'
            }
          >
            <WeightChart panel={panel} />
          </StatCard>

          {/*
            THE HEADLINE IS THE FIGURE, OR THERE IS NO HEADLINE.
            Specs 9.2 precision 2 refuses a number below seven measurements and
            asks that the reason be SAID — so the card drops its big figure
            entirely and the caption carries the whole sentence, rather than
            printing a dash over an explanation nobody would connect to it.
          */}
          <StatCard
            title="Rythme réel"
            headline={panel.rate.ok ? rateText(panel.rate) : undefined}
            caption={
              panel.rate.ok
                ? 'Régression sur la série lissée des 14 derniers jours'
                : rateText(panel.rate)
            }
          >
            {panel.goal === null ? (
              <Text style={[styles.note, { color: theme.colors.textMuted }]}>
                Aucun objectif actif. Définissez-en un dans les Réglages pour voir
                votre écart au rythme visé.
              </Text>
            ) : (
              <View style={styles.goalRows}>
                <GoalRow label={goalTargetText(panel.goal.goal)} />
                <GoalRow label={`Rythme visé : ${aimedRateText(panel.goal.aimed)}`} />
                <GoalRow label={projectionText(panel.goal.projection)} />
                {gapText(panel.goal.gapKgPerWeek) === null ? null : (
                  <GoalRow label={gapText(panel.goal.gapKgPerWeek) ?? ''} strong />
                )}
              </View>
            )}
          </StatCard>

          {kcalSeries === null ? null : (
            <StatCard
              title="Poids et calories"
              caption="Poids lissé contre la moyenne mobile des calories consommées"
            >
              <WeightCrossChart panel={panel} kcalSeries={kcalSeries} />
            </StatCard>
          )}

          {/*
            The history is one push away from the curve, which is the whole
            reason the Stats tab gained a stack. Correcting a measurement FOLLOWS
            seeing it look wrong here — specs 9.1 asks for a list that is
            "consultable et corrigeable" and names no place for it, and this is
            the place where the question gets asked.
          */}
          <Pressable
            onPress={() => router.push('/(tabs)/stats/weight-history')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.link,
              {
                backgroundColor: pressed ? theme.colors.background : theme.colors.surface,
              },
            ]}
          >
            <Text style={[styles.linkLabel, { color: theme.colors.accent }]}>
              Historique des pesées
            </Text>
          </Pressable>
        </>
      )}
    </>
  );
}

function GoalRow({ label, strong }: { label: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.goalRow,
        strong === true ? styles.goalRowStrong : null,
        { color: strong === true ? theme.colors.text : theme.colors.textMuted },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  waiting: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 24 },
  note: { fontSize: 13, lineHeight: 18 },
  goalRows: { gap: 4 },
  goalRow: { fontSize: 13, lineHeight: 18 },
  goalRowStrong: { fontSize: 14, fontWeight: '600' },
  link: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  linkLabel: { fontSize: 16, fontWeight: '600' },
});
