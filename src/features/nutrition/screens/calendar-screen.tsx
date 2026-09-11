import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { GlassButton } from '@/core/ui/glass-button';
import { MonthCalendar } from '../components/month-calendar';
import { useRequestDate } from '../hooks/requested-date';

/**
 * Direct access to a date (specs 8.3).
 *
 * ## Why this is a screen and not a window drawn in place
 *
 * It was a Modal, morphing out of the calendar button by interpolating its own
 * geometry. That looked close but it was an imitation, and iOS has the real
 * thing: the zoom transition, where a control genuinely becomes the view it
 * presents, with an interactive dismissal that follows the finger back into it.
 *
 * expo-router exposes it as Link.AppleZoom on the source and
 * Link.AppleZoomTarget on the destination — and it animates a NAVIGATION, so
 * the destination has to be a route. Hence this screen, and hence the request
 * context that carries the chosen day back (see hooks/requested-date.tsx: a
 * route parameter would outlive the visit, and specs 7 wants the Journal on
 * today at every launch).
 *
 * ## THE PANEL CARRIES ITS OWN SIZE, and that is not a detail
 *
 * Link.AppleZoomTarget wraps its child in a native detector view styled
 * `display: 'contents'` — meant to take part in no layout at all. When that
 * resolves as intended the child measures against the screen; when it does
 * not, the child measures against nothing, and `flex: 1` inside nothing is
 * zero. That is exactly what a blank page looks like.
 *
 * So the panel is sized from the window rather than from its parent. It cannot
 * collapse, whatever the wrapper turns out to do — and it is what makes the
 * screen reach the very top, up past the status bar to the island, rather than
 * starting below a safe area it never asked for.
 *
 * The safe area then comes back as PADDING, so the background runs to the edge
 * while nothing readable hides under the island.
 */
export function CalendarScreen({ date }: { date: LocalDate }) {
  const theme = useTheme();
  const router = useRouter();
  const requestDate = useRequestDate();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Read once, here, through the single function that decides what today is
  // (D3). The Journal holds its own copy from its own mount; they can only
  // differ across a midnight, and then both are right about their own moment.
  const [today] = useState<LocalDate>(() => currentLocalDate());
  const [month, setMonth] = useState<LocalDate>(date);

  function choose(chosen: LocalDate): void {
    // Asked for first, then dismissed: the Journal applies it while this screen
    // is still on its way out, so the day underneath is already the right one
    // when the transition finishes.
    requestDate(chosen);
    router.back();
  }

  return (
    /*
      The target of the zoom: the thing that should appear to BE the button,
      grown. A single child, which is all this component accepts.
    */
    <Link.AppleZoomTarget>
      <View
        style={[
          styles.panel,
          {
            width,
            height,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <View style={styles.actions}>
          <GlassButton label="Aujourd’hui" onPress={() => choose(today)} />
          <GlassButton label="Fermer" onPress={() => router.back()} />
        </View>

        <MonthCalendar
          month={month}
          selected={date}
          today={today}
          onMonthChange={setMonth}
          onSelect={choose}
        />
      </View>
    </Link.AppleZoomTarget>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // The calendar needs air under the buttons: side by side they read as one
    // block, and the grid below starts being mistaken for part of it.
    marginBottom: 22,
  },
});
