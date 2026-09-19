import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { Segmented } from '@/core/ui/segmented';
import { usePreferences, useToday } from '@/features/settings/data/settings-queries';
import { NutritionPanelSection } from '../components/nutrition-panel-section';
import { StrengthPanelSection } from '../components/strength-panel-section';
import { WeightPanelSection } from '../components/weight-panel-section';
import { DEFAULT_STAT_RANGE, type StatRangeDays } from '../domain/stat-range';
import {
  DEFAULT_WEIGHT_RANGE,
  type WeightRangeKey,
} from '@/features/weight/domain/weight-range';
import {
  DEFAULT_EXERCISE_RANGE,
  type ExerciseRangeKey,
} from '@/features/strength/domain/exercise-range';

/**
 * The Stats tab (specs 7, 8.7, 9.2, 9.4).
 *
 * Specs 7 makes this one dashboard across every module rather than a statistics
 * screen per feature. Strength joined it at slice 12, which is what specs 7's
 * "Nutrition, Poids, puis Musculation en V3" foresaw.
 *
 * ## THREE TABS, WHERE THE TWO PANELS USED TO BE STACKED
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
 * Each panel is unmounted while another is shown, and state in an unmounted
 * component is gone. Held here, a range chosen on one tab survives a visit to
 * the others — which is what anyone would expect of a control they set on
 * purpose.
 *
 * THREE ranges rather than one, because specs 7 says so in as many words:
 * "chaque volet garde ses propres plages, qui diffèrent d'un volet à l'autre".
 * Strength offers 3 months, a year and everything; the other two do not.
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
 * ## AND THE PAGE KEEPS ITS HEIGHT WHILE IT RELOADS, RATHER THAN GETTING IT BACK
 *
 * Simply not scrolling was not enough, and the case that shows it is the FIRST
 * visit to a range: both panels render a loading indicator while their queries
 * answer, which is a page a few hundred points tall. iOS clamps the offset to
 * that, correctly, and the reading place is gone.
 *
 * The first answer was to remember the offset and put it back once the content
 * could hold it. It worked and it was VISIBLE — the page went to the top and
 * came back, which is two movements where the right number is none. Reported as
 * such.
 *
 * So nothing is restored: the page is stopped from shrinking in the first
 * place. While a panel is reloading, the content keeps the height it had, so
 * there is no clamp to undo and the offset is never touched by anyone. The
 * floor is released when the panel says it has real content, which is the only
 * moment its natural height means anything.
 *
 * `onReady` rather than a timer: the panel is the only thing that knows whether
 * it is waiting, and it already knows — PANEL_LOADING_MS holds its indicator to
 * a floor, and the end of that floor is exactly the moment the page may take
 * its own size again.
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
type Panel = 'nutrition' | 'weight' | 'strength';

const PANEL_OPTIONS: { value: Panel; label: string }[] = [
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'weight', label: 'Poids' },
  { value: 'strength', label: 'Muscu' },
];

export function StatsScreen() {
  const theme = useTheme();
  const today = useToday();
  const { adherenceTolerancePct } = usePreferences();

  const [panel, setPanel] = useState<Panel>('nutrition');
  const [range, setRange] = useState<StatRangeDays>(DEFAULT_STAT_RANGE);
  const [weightRange, setWeightRange] = useState<WeightRangeKey>(DEFAULT_WEIGHT_RANGE);
  const [strengthRange, setStrengthRange] = useState<ExerciseRangeKey>(DEFAULT_EXERCISE_RANGE);

  /**
   * Whether the page is holding its height while a panel reloads.
   *
   * Set by the control that changes the choice, not by an effect watching it:
   * an effect runs after the render that has already shrunk the content, by
   * which time iOS has clamped and the reading place is gone.
   */
  const [holding, setHolding] = useState(false);
  /** The height the page had when it was last showing real content. */
  const [reserved, setReserved] = useState(0);

  const release = useCallback(() => setHolding(false), []);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        styles.container,
        holding && reserved > 0 ? { minHeight: reserved } : null,
      ]}
      onContentSizeChange={(_width, height) => {
        // Only while the page is showing what it really has: measured under the
        // floor, this would record the floor and hold it for ever.
        if (!holding) setReserved(height);
      }}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Stats</Text>

      <Segmented
        options={PANEL_OPTIONS}
        value={panel}
        // The page holds its height until the arriving panel has content.
        // See the note at the top of this file.
        onChange={(chosen) => {
          setHolding(true);
          setPanel(chosen);
        }}
        grow
      />

      {panel === 'nutrition' ? (
        <NutritionPanelSection
          today={today}
          tolerancePct={adherenceTolerancePct}
          range={range}
          onRangeChange={(chosen) => {
            setHolding(true);
            setRange(chosen);
          }}
          onReady={release}
        />
      ) : panel === 'weight' ? (
        <WeightPanelSection
          today={today}
          range={weightRange}
          onRangeChange={(chosen) => {
            setHolding(true);
            setWeightRange(chosen);
          }}
          onReady={release}
        />
      ) : (
        <StrengthPanelSection
          today={today}
          range={strengthRange}
          onRangeChange={(chosen) => {
            setHolding(true);
            setStrengthRange(chosen);
          }}
          onReady={release}
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
