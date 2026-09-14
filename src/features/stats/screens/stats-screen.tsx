import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { LoadingDots } from '@/core/ui/loading-dots';
import { Segmented } from '@/core/ui/segmented';
import { usePreferences, useToday } from '@/features/settings/data/settings-queries';
import { AdherenceCard } from '../components/adherence-card';
import { CaloriesCard } from '../components/calories-card';
import { CaloriesChart } from '../components/calories-chart';
import { MacrosChart } from '../components/macros-chart';
import { SplitCard } from '../components/split-card';
import { WeightPanelSection } from '../components/weight-panel-section';
import { useDailyFigures } from '../data/stats-queries';
import { nutritionPanel } from '../domain/panel';
import {
  DEFAULT_STAT_RANGE,
  rangeLabel,
  STAT_RANGE_DAYS,
  type StatRangeDays,
} from '../domain/stat-range';
import {
  DEFAULT_WEIGHT_RANGE,
  type WeightRangeKey,
} from '@/features/weight/domain/weight-range';

/**
 * The Stats tab — nutrition panel (specs 7, 8.7).
 *
 * Weight arrived at slice 8 and strength comes at slice 12, as further panels
 * under this one. Specs 7 makes this one dashboard across every module rather
 * than a statistics screen per feature.
 *
 * ## THE RANGE CONTROL AT THE TOP DOES NOT GOVERN ALL OF THEM, AND CANNOT
 *
 * It was written to. Specs 8.7 gives the nutrition panel 7, 30 and 90 days and
 * specs 9.2 gives the weight panel 30 days, 90 days, a year and everything —
 * two normative lists, and different ones. A single control would have to
 * invent a range neither document asks for: seven days of a curve smoothed over
 * seven days has one usable point, and "tout" over the calories is three years
 * of bars specs 8.7 never wanted.
 *
 * So this one keeps the panel it has always governed, unchanged and in place,
 * and the weight panel carries its own beneath its own heading.
 *
 * ## NOT A CALCULATION IN SIGHT
 *
 * Everything shown comes out of nutritionPanel, one pure function (D9:
 * "Composants : RIEN"). The screen chooses a range, hands over the rows, and
 * renders what comes back.
 *
 * ## ONE ScrollView IN BOTH STATES
 *
 * Never a View while loading and a ScrollView once loaded. Swapping one
 * element type for another makes React unmount the first and mount the second,
 * and UIKit then recomputes a fresh ScrollView's content inset from scratch —
 * which is not zero under a translucent tab bar. That is what used to make the
 * day page jump into place, and it is written up in journal-screen.tsx.
 */
const RANGE_OPTIONS = STAT_RANGE_DAYS.map((days) => ({
  value: String(days),
  label: rangeLabel(days),
}));

export function StatsScreen() {
  const theme = useTheme();
  const today = useToday();
  const { adherenceTolerancePct } = usePreferences();
  const [range, setRange] = useState<StatRangeDays>(DEFAULT_STAT_RANGE);
  const [weightRange, setWeightRange] = useState<WeightRangeKey>(DEFAULT_WEIGHT_RANGE);

  const figures = useDailyFigures(today, range);
  const rows = figures.data;

  const panel = useMemo(
    () => (rows === undefined ? null : nutritionPanel(rows, adherenceTolerancePct, today)),
    [rows, adherenceTolerancePct, today],
  );

  /**
   * Nothing at all, which is a real state and not a failure.
   *
   * A fresh installation, and every range on a journal that has never been
   * kept. Distinguished from "still loading" because they look the same and
   * mean opposite things — specs 8.3 point 8 makes the same distinction on the
   * Journal, for the same reason.
   */
  // Every day of the range, today included: a journal started this morning has
  // nothing to aggregate but is not empty.
  const empty = panel !== null && panel.days.every((day) => day.consumed === null);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Stats</Text>

      <Segmented
        options={RANGE_OPTIONS}
        value={String(range)}
        onChange={(value) => {
          // Looked up in the same array the options come from, so no cast and
          // no second list of what a valid range is.
          const chosen = STAT_RANGE_DAYS.find((days) => String(days) === value);
          if (chosen !== undefined) setRange(chosen);
        }}
        grow
      />

      {panel === null ? (
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
          <AdherenceCard
            adherence={panel.adherence}
            tolerancePct={adherenceTolerancePct}
          />
        </>
      )}

      {/*
        THE WEIGHT PANEL SITS OUTSIDE THE NUTRITION BRANCH, DELIBERATELY.

        A journal nobody has kept says "Rien à agréger" above — and that must not
        hide the weight curve, which is a different measurement with a different
        emptiness. Someone who weighs themselves daily and logs no food has a
        full weight panel and an empty nutrition one, and the screen has to be
        able to say both at once.
      */}
      <WeightPanelSection
        today={today}
        range={weightRange}
        onRangeChange={setWeightRange}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Generous bottom padding: the tab bar is translucent, and content is meant
  // to scroll under it rather than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 16 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
  waiting: { paddingVertical: 48, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 16 },
});
