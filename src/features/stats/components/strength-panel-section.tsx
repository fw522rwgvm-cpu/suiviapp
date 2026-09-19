import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useMinimumVisible } from '@/core/ui/use-minimum-visible';
import { Segmented } from '@/core/ui/segmented';
import { Text } from '@/core/ui/text';
import { useStrengthPanel } from '@/features/strength/data/session-queries';
import {
  calendarWeeks,
  panelPoints,
  panelTotals,
  trainedDays,
  type PanelPoint,
} from '@/features/strength/domain/strength-panel';
import {
  exerciseRangeFor,
  exerciseRangeLabel,
  EXERCISE_RANGE_KEYS,
  type ExerciseRangeKey,
} from '@/features/strength/domain/exercise-range';
import { tallyMuscles, rankedMuscles } from '@/features/strength/domain/muscle-volume';
import { durationText } from '@/features/strength/domain/session-text';
import { SessionCalendar } from '@/features/strength/components/session-calendar';
import { SessionSeriesChart } from '@/features/strength/components/session-series-chart';
import { BodyMapView } from '@/features/strength/components/body-map-view';
import { StatCard } from './stat-card';
import { PANEL_LOADING_MS } from '../domain/panel-loading';

/**
 * The strength panel of the dashboard (specs 10.6).
 *
 * > Plages : 3 mois / 1 an / tout. Calendrier des séances · Durée des séances
 * > · Volume total par séance · Répétitions par séance · Carte corporelle des
 * > muscles travaillés · Graphique croisé.
 *
 * ## ITS OWN RANGES, WHICH SPECS 7 ALREADY ALLOWS FOR
 *
 * > Chaque volet garde ses propres plages, qui diffèrent d'un volet à l'autre.
 *
 * Nutrition offers 7/30/90 and weight 7/30/90/365. This one offers 3 months, a
 * year and everything, because that is what specs 10.6 names — and because a
 * week of strength training is two or three sessions, which is a chart of
 * three points.
 *
 * The keys come from the exercise page's range module rather than a second
 * list: specs 10.1 and 10.6 give the SAME three ranges, and two copies would
 * be free to disagree about what "tout" means.
 *
 * ## ONE READ, AND THE METRIC CHOOSER NEVER TOUCHES IT
 *
 * The calendar, the three series, the totals and the body map all come from
 * one query. Changing the metric re-folds rows already in hand; only the range
 * reaches SQL, which is what D13 asks for — the point count settled in the
 * query rather than in the renderer.
 */

const METRICS = [
  { value: 'duration', label: 'Durée' },
  { value: 'volume', label: 'Volume' },
  { value: 'reps', label: 'Reps' },
] as const;

type Metric = (typeof METRICS)[number]['value'];

export function StrengthPanelSection({
  today,
  range,
  onRangeChange,
  onReady,
}: {
  today: LocalDate;
  range: ExerciseRangeKey;
  onRangeChange: (range: ExerciseRangeKey) => void;
  /** Called once this panel is showing real content; see StatsScreen. */
  onReady?: () => void;
}) {
  const theme = useTheme();
  const [metric, setMetric] = useState<Metric>('volume');

  /*
    "Tout" needs the earliest session there is, and the panel cannot know it
    before reading. So the read runs UNBOUNDED for that key and the fold
    narrows nothing — which is what "tout" means anyway. The other two are
    bounded in SQL, on ix_session_date.
  */
  const span = useMemo(
    () => exerciseRangeFor(range, today, null),
    [range, today],
  );
  const panel = useStrengthPanel(range === 'all' ? null : span.from, span.to);

  const sessions = panel.data?.sessions ?? [];
  const earliest = sessions[0]?.date ?? null;

  /*
    The grain is decided from the span that is actually covered, which for
    "tout" is only known once the rows are in. Re-deriving it here rather than
    reusing `span` is what stops a three-week history being drawn as monthly
    means because the button said "tout".
  */
  const drawn = useMemo(
    () => exerciseRangeFor(range, today, earliest),
    [range, today, earliest],
  );

  const points = useMemo(
    () => panelPoints(sessions, drawn.grain),
    [sessions, drawn.grain],
  );
  const totals = useMemo(() => panelTotals(sessions), [sessions]);
  const trained = useMemo(() => trainedDays(sessions), [sessions]);
  const weeks = useMemo(
    () => calendarWeeks(drawn.from ?? drawn.to, drawn.to),
    [drawn.from, drawn.to],
  );

  /*
    The muscles worked over the range (specs 10.6). tallyMuscles is the
    routine page's own function, so "how much does this work my chest" is one
    rule whether it is asked of a routine or of three months of training.
  */
  const tally = useMemo(
    () => tallyMuscles(panel.data?.volumeSets ?? []),
    [panel.data?.volumeSets],
  );
  const muscles = useMemo(() => rankedMuscles(tally), [tally]);

  const waiting = useMinimumVisible(panel.isPending, PANEL_LOADING_MS);
  useEffect(() => {
    if (!waiting) onReady?.();
  }, [waiting, onReady]);

  return (
    <View style={styles.panel}>
      <Segmented
        options={EXERCISE_RANGE_KEYS.map((key) => ({
          value: key,
          label: exerciseRangeLabel(key),
        }))}
        value={range}
        onChange={onRangeChange}
        grow
      />

      {waiting ? (
        <View style={styles.waiting}>
          <LoadingDots />
        </View>
      ) : sessions.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          Aucune séance terminée sur cette période.
        </Text>
      ) : (
        <>
          <StatCard
            title="Séances"
            headline={String(totals.sessions)}
            caption={totals.sessions === 1 ? 'séance terminée' : 'séances terminées'}
            note={noteFor(totals.days, totals.meanDurationMs)}
          >
            <SessionCalendar weeks={weeks} trained={trained} />
          </StatCard>

          <StatCard title="Par séance">
            <View style={styles.chooser}>
              <Segmented options={METRICS} value={metric} onChange={setMetric} grow />
            </View>
            <SessionSeriesChart
              points={points.map((point) => ({
                date: point.date,
                sessions: point.sessions,
                value: valueOf(point, metric),
              }))}
              title={titleOf(metric)}
              /*
                Every one of the three is a per-session figure, so every bucket
                is a mean — no exception, unlike the exercise page where three
                of five series are already maxima. Said out loud whenever a
                point is not one session.
              */
              caption={
                drawn.grain === 'day'
                  ? null
                  : `Moyenne par ${drawn.grain === 'week' ? 'semaine' : 'mois'}`
              }
              format={(value) => formatOf(metric, value)}
              accessibilityLabel={`${titleOf(metric)} sur la plage choisie`}
            />
          </StatCard>

          {/*
            THE BODY MAP IS OVER THE RANGE, NOT OVER ONE ROUTINE.

            Same drawing and same thresholds as the routine page, which is a
            reserve rather than a claim: levelOf's bands were chosen against
            ONE session — "trois, six et dix séries pondérées est ce qu'une
            séance ressemble" — and three months of training reaches them on
            every muscle that is trained at all. So the map here says WHICH
            muscles are worked far better than it says how much. Flagged in
            CLAUDE.md rather than silently re-tuned: a second set of
            thresholds would be a second answer to the same question.
          */}
          <StatCard title="Muscles travaillés">
            <BodyMapView muscles={muscles} volume={tally} />
          </StatCard>
        </>
      )}
    </View>
  );
}

function valueOf(point: PanelPoint, metric: Metric): number | null {
  switch (metric) {
    case 'duration':
      return point.durationMs;
    case 'volume':
      return point.volumeKg;
    case 'reps':
      return point.reps;
  }
}

function titleOf(metric: Metric): string {
  switch (metric) {
    case 'duration':
      return 'Durée des séances';
    case 'volume':
      return 'Volume total';
    case 'reps':
      return 'Répétitions';
  }
}

/** A value with its unit, in French. The axis ticks use it too. */
function formatOf(metric: Metric, value: number): string {
  if (metric === 'duration') return durationText(value);
  if (metric === 'reps') return String(Math.round(value));
  return `${Math.round(value)} kg`;
}

/**
 * The second line of the headline card.
 *
 * Days rather than sessions, because that is what the calendar underneath
 * marks — two figures about one range that counted differently would be the
 * quiet disagreement this project treats as a defect.
 */
function noteFor(days: number, meanDurationMs: number | null): string {
  const dayText = days === 1 ? '1 jour' : `${days} jours`;
  if (meanDurationMs === null) return dayText;
  return `${dayText} · ${durationText(meanDurationMs)} en moyenne`;
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  waiting: { paddingVertical: 48, alignItems: 'center' },
  chooser: { paddingBottom: 4 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 32 },
});
