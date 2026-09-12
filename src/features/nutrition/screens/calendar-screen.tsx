import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
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
 * expo-router exposes it as Link.AppleZoom on the source — and it animates a
 * NAVIGATION, so the destination has to be a route. Hence this screen, and
 * hence the request context that carries the chosen day back (see
 * hooks/requested-date.tsx: a route parameter would outlive the visit, and
 * specs 7 wants the Journal on today at every launch).
 *
 * ## THERE IS NO Link.AppleZoomTarget HERE, AND THAT IS THE FIX
 *
 * It looked like the name for "the view the button becomes", so it went round
 * the whole screen. It is not that. It marks the ALIGNMENT RECT — which part of
 * the destination corresponds to the source — and the library's own example
 * puts it round a 200-point image sitting inside an ordinary screen, never
 * round the screen itself.
 *
 * The cost of the mistake was total: the component wraps its child in a native
 * view styled `display: 'contents'`, meant to take part in no layout. As a
 * screen root that removes the root from layout, so everything inside measured
 * against nothing and the page came up blank twice over.
 *
 * The transition does not need it. The zoom is asked for by Link.AppleZoom on
 * the source; the target only refines where the two line up. Without it the
 * system picks its own alignment, which is the right default here — the
 * destination is a whole panel, not a picture with a counterpart.
 *
 * ## A window over the Journal, not a page instead of it
 *
 * The route is presented as a TRANSPARENT MODAL, so the Journal stays mounted
 * and visible underneath. A pushed screen would be opaque by definition and
 * would read as going somewhere else; this reads as something opening on top,
 * which is what choosing a date actually is — you have not left the day, you
 * are picking another one.
 *
 * The panel then draws itself: full width, top edge at the island, down to the
 * bottom, with the Journal showing through a dimmed backdrop in the strip
 * above. That is the same geometry the hand-written window had, now carried by
 * a real route with the system's own transition.
 *
 * Sized from the window rather than from its parent, so it cannot collapse
 * whatever a wrapper or a presentation does — a lesson from this screen coming
 * up blank twice.
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
    <View style={{ width, height }}>
      {/* Tapping the Journal showing above closes, as tapping outside should. */}
      <Pressable
        style={styles.fill}
        onPress={() => router.back()}
        accessibilityLabel="Fermer"
      >
        <View style={[styles.fill, styles.backdrop]} />
      </Pressable>

      <View
        style={[
          styles.panel,
          {
            // Top edge at the island, bottom at the screen edge. The bottom
            // corners are therefore off screen and only the top two are
            // rounded — the panel hangs from the top rather than floating.
            top: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            ...theme.shadow,
            // It floats over the Journal rather than sitting on the page, so it
            // carries its own lift even in the dark, where cards have none.
            shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.18,
            shadowRadius: 24,
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { backgroundColor: '#000000', opacity: 0.28 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // The calendar needs air under the buttons: side by side they read as one
    // block, and the grid below starts being mistaken for part of it.
    marginBottom: 22,
  },
});
