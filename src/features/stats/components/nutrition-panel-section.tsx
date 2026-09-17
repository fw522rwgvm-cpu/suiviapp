import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { useMinimumVisible } from '@/core/ui/use-minimum-visible';
import { Segmented } from '@/core/ui/segmented';
import { Text } from '@/core/ui/text';
import { AdherenceCard } from './adherence-card';
import { CaloriesCard } from './calories-card';
import { CaloriesChart } from './calories-chart';
import { MacrosChart } from './macros-chart';
import { SplitCard } from './split-card';
import { useDailyFigures } from '../data/stats-queries';
import { nutritionPanel } from '../domain/panel';
import { PANEL_LOADING_MS } from '../domain/panel-loading';
import {
  rangeLabel,
  STAT_RANGE_DAYS,
  type StatRangeDays,
} from '../domain/stat-range';

/**
 * The nutrition panel of the dashboard (specs 8.7).
 *
 * Lifted out of stats-screen.tsx unchanged when the screen gained its two tabs:
 * with a weight panel beside it, a screen holding one panel's queries, its
 * range state and its empty branch inline would have had to hold both. The
 * screen is wiring again, and each panel owns what it needs.
 *
 * ## ITS RANGE STAYS 7 / 30 / 90, AND STAYS ITS OWN
 *
 * Specs 8.7 names those three; specs 9.2 names four different ones for weight.
 * Two normative lists, so two controls — a single one would have to invent a
 * range neither document asks for.
 *
 * ## NOT A CALCULATION IN SIGHT
 *
 * Everything shown comes out of nutritionPanel, one pure function (D9:
 * "Composants : RIEN"). The section chooses a range, hands over the rows, and
 * renders what comes back.
 */
const RANGE_OPTIONS = STAT_RANGE_DAYS.map((days) => ({
  value: String(days),
  label: rangeLabel(days),
}));

export function NutritionPanelSection({
  today,
  tolerancePct,
  range,
  onRangeChange,
}: {
  today: LocalDate;
  tolerancePct: number;
  range: StatRangeDays;
  onRangeChange: (range: StatRangeDays) => void;
}) {
  const theme = useTheme();

  const figures = useDailyFigures(today, range);
  const rows = figures.data;

  const panel = useMemo(
    () => (rows === undefined ? null : nutritionPanel(rows, tolerancePct, today)),
    [rows, tolerancePct, today],
  );

  /**
   * Nothing at all, which is a real state and not a failure.
   *
   * A fresh installation, and every range on a journal that has never been
   * kept. Distinguished from "still loading" because they look the same and
   * mean opposite things — specs 8.3 point 8 makes the same distinction on the
   * Journal, for the same reason.
   *
   * Every day of the range, today included: a journal started this morning has
   * nothing to aggregate but is not empty.
   */
  /**
   * The indicator, held to a floor once it has appeared at all.
   *
   * Not `panel === null` directly: a first visit answers fast enough to be seen
   * and not fast enough to be missed, which is a flash, and a flash reads as a
   * defect. Nothing is delayed on a range already read — useMinimumVisible only
   * imposes the floor once the waiting has begun. See PANEL_LOADING_MS.
   */
  const waiting = useMinimumVisible(panel === null, PANEL_LOADING_MS);

  const empty = panel !== null && panel.days.every((day) => day.consumed === null);

  return (
    <>
      <Segmented
        options={RANGE_OPTIONS}
        value={String(range)}
        onChange={(value) => {
          // Looked up in the same array the options come from, so no cast and
          // no second list of what a valid range is.
          const chosen = STAT_RANGE_DAYS.find((days) => String(days) === value);
          if (chosen !== undefined) onRangeChange(chosen);
        }}
        grow
      />

      {waiting || panel === null ? (
        <View style={styles.waiting}>
          <LoadingDots />
        </View>
      ) : empty ? (
        <View style={styles.waiting}>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            Rien à agréger
          </Text>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            Aucune journée renseignée sur cette plage. Les chiffres apparaissent dès
            qu’un repas est enregistré.
          </Text>
        </View>
      ) : (
        <>
          <CaloriesCard panel={panel} chart={<CaloriesChart panel={panel} />} />
          <SplitCard
            splits={panel.splits}
            recorded={panel.recorded}
            range={panel.range}
            chart={<MacrosChart panel={panel} />}
          />
          <AdherenceCard adherence={panel.adherence} tolerancePct={tolerancePct} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  waiting: { paddingVertical: 48, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 16 },
});
