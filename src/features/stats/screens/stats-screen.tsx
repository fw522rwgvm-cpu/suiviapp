import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { Segmented } from '@/core/ui/segmented';
import { usePreferences, useToday } from '@/features/settings/data/settings-queries';
import { NutritionPanelSection } from '../components/nutrition-panel-section';
import { WeightPanelSection } from '../components/weight-panel-section';
import { DEFAULT_STAT_RANGE, type StatRangeDays } from '../domain/stat-range';
import {
  DEFAULT_WEIGHT_RANGE,
  type WeightRangeKey,
} from '@/features/weight/domain/weight-range';

/**
 * The Stats tab (specs 7, 8.7, 9.2, 9.4).
 *
 * Specs 7 makes this one dashboard across every module rather than a statistics
 * screen per feature. Strength joins it at slice 12.
 *
 * ## TWO TABS, WHERE THE TWO PANELS USED TO BE STACKED
 *
 * They were one above the other, each with its own range control — so the page
 * carried two segmented controls a scroll apart, and the second one arrived
 * without warning half way down. Tabs make the choice explicit and give each
 * panel the top of the screen, which is where a range control belongs relative
 * to what it governs.
 *
 * It also settles a real cost of the stacked version: the weight panel's
 * queries ran on every visit to the Stats tab, whether or not anyone scrolled
 * to it. Only the chosen panel is mounted now, so the other's reads do not run.
 * React Query keeps what it read, so switching back is the cache rather than
 * SQLite.
 *
 * ## THE RANGES LIVE HERE, NOT IN THE PANELS
 *
 * Each panel is unmounted while the other is shown, and state in an unmounted
 * component is gone. Held here, a range chosen on one tab survives a visit to
 * the other — which is what anyone would expect of a control they set on
 * purpose.
 *
 * ## THE SCROLL OFFSET SURVIVES A CHANGE OF TAB, AND OF RANGE
 *
 * The first version jumped back to the top on every tab change, to avoid
 * landing at an offset the arriving panel might be too short to fill. Requested
 * otherwise (specs 14.24), and the objection was smaller than it looked: iOS
 * clamps such an offset to the new content's own bottom, which is a page that
 * is merely scrolled rather than a page that is wrong. What the jump cost was
 * real — comparing the two panels, or two ranges of one panel, meant scrolling
 * back down after every single comparison, which is the whole activity this
 * screen exists for.
 *
 * ## ONE ScrollView IN EVERY STATE
 *
 * Never a View while loading and a ScrollView once loaded. Swapping one element
 * type for another makes React unmount the first and mount the second, and
 * UIKit then recomputes a fresh ScrollView's content inset from scratch — which
 * is not zero under a translucent tab bar. That is what used to make the day
 * page jump into place, and it is written up in journal-screen.tsx. Switching
 * tabs changes what is INSIDE this scroll view; the scroll view itself stays.
 */
type Panel = 'nutrition' | 'weight';

const PANEL_OPTIONS: { value: Panel; label: string }[] = [
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'weight', label: 'Poids' },
];

export function StatsScreen() {
  const theme = useTheme();
  const today = useToday();
  const { adherenceTolerancePct } = usePreferences();

  const [panel, setPanel] = useState<Panel>('nutrition');
  const [range, setRange] = useState<StatRangeDays>(DEFAULT_STAT_RANGE);
  const [weightRange, setWeightRange] = useState<WeightRangeKey>(DEFAULT_WEIGHT_RANGE);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Stats</Text>

      <Segmented
        options={PANEL_OPTIONS}
        value={panel}
        // Nothing but the switch: the scroll offset is deliberately left
        // alone, see the note at the top of this file.
        onChange={setPanel}
        grow
      />

      {panel === 'nutrition' ? (
        <NutritionPanelSection
          today={today}
          tolerancePct={adherenceTolerancePct}
          range={range}
          onRangeChange={setRange}
        />
      ) : (
        <WeightPanelSection
          today={today}
          range={weightRange}
          onRangeChange={setWeightRange}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Generous bottom padding: the tab bar is translucent, and content is meant
  // to scroll under it rather than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 16 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
});
