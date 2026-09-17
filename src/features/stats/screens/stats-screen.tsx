import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
 * ## AND SURVIVING MEANT PUTTING IT BACK, BECAUSE A LOADING PANEL IS SHORT
 *
 * Simply not scrolling was not enough, and the case that shows it is the FIRST
 * visit to a range: both panels render a loading indicator while their queries
 * answer, which is a page a few hundred points tall. iOS clamps the offset to
 * that, correctly and irreversibly — when the real content arrives a moment
 * later the page is already at the top, and nothing remembers where it was.
 *
 * So the offset is remembered when the choice changes and PUT BACK the moment
 * the content is tall enough to hold it. Not on a timer, not after a guessed
 * delay: onContentSizeChange is the event that says "the page just became this
 * tall", which is exactly the question being asked.
 *
 * A real drag cancels it. Someone who scrolls while the panel is still loading
 * has said where they want to be, and being pulled back by an arriving query
 * would be the page moving under a finger.
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

  const keepPlace = useKeptScrollPlace();

  return (
    <ScrollView
      ref={keepPlace.ref}
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
      onScroll={keepPlace.onScroll}
      onLayout={keepPlace.onLayout}
      onContentSizeChange={keepPlace.onContentSizeChange}
      onScrollBeginDrag={keepPlace.onScrollBeginDrag}
      // Sixty a second: the offset has to be current at the instant a choice
      // changes, and a coarser rate would remember a place from a moment ago.
      scrollEventThrottle={16}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Stats</Text>

      <Segmented
        options={PANEL_OPTIONS}
        value={panel}
        // The offset is remembered rather than reset, and put back once the
        // arriving panel is tall enough to hold it. See the note at the top.
        onChange={(chosen) => {
          keepPlace.remember();
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
            keepPlace.remember();
            setRange(chosen);
          }}
        />
      ) : (
        <WeightPanelSection
          today={today}
          range={weightRange}
          onRangeChange={(chosen) => {
            keepPlace.remember();
            setWeightRange(chosen);
          }}
        />
      )}
    </ScrollView>
  );
}

/**
 * Keeps the reading place across a change that makes the page briefly shorter.
 *
 * Everything here is a ref rather than state, and that is the point: none of it
 * has anything to say about what is rendered. Putting the offset in state would
 * re-render the whole screen on every frame of a scroll, to change nothing.
 *
 * `remember` is called by the control that changes the page, not by an effect
 * watching the choice: an effect runs after the render that shrank the content,
 * by which time iOS has already clamped the offset and the number to remember
 * is gone.
 */
function useKeptScrollPlace() {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const wanted = useRef<number | null>(null);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    viewport.current = event.nativeEvent.layout.height;
  }, []);

  const remember = useCallback(() => {
    // Zero is not worth restoring, and remembering it would fight a person who
    // switched panels while already at the top.
    wanted.current = offset.current > 0 ? offset.current : null;
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    const want = wanted.current;
    if (want === null) return;

    // Only once the page can actually hold that offset. Restoring earlier would
    // ask for a position iOS would clamp again, and the request would be spent.
    if (height - viewport.current < want) return;

    wanted.current = null;
    ref.current?.scrollTo({ y: want, animated: false });
  }, []);

  /** A finger on the page outranks anything a query is about to say. */
  const onScrollBeginDrag = useCallback(() => {
    wanted.current = null;
  }, []);

  return { ref, onScroll, onLayout, onContentSizeChange, onScrollBeginDrag, remember };
}

const styles = StyleSheet.create({
  // Generous bottom padding: the tab bar is translucent, and content is meant
  // to scroll under it rather than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 16 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
});
