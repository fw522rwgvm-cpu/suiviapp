import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
 * ## IT NO LONGER USES OverlayPanel, AND THAT WAS THE BUG
 *
 * It did, and the two were animating the same thing in opposite ways. The zoom
 * presented the screen out of the button, which looked right; but OverlayPanel
 * dismisses by folding its window DOWN and only then calling router.back(), so
 * by the time the navigation left there was nothing on screen for the native
 * transition to shrink back into the button. The way out slid to the bottom
 * while the way in had come from the header — the one place a transition must
 * not disagree with itself.
 *
 * So the screen animates nothing of its own now. It draws a card and lets the
 * transition own both directions, which is the whole reason it is a route.
 * OverlayPanel stays right for the other windows — add, quantity, free entry,
 * meal — because none of those has a source view to come out of.
 *
 * ## NO BACKDROP EITHER, FOR THE SAME REASON
 *
 * OverlayPanel darkens what is behind it. Under a zoom transition the whole
 * presented screen is what grows out of the button, dimming included — which
 * would be a small dark square swelling from the header. A transparent screen
 * carrying one card means the card alone comes out of the control, which is
 * exactly what the transition is for.
 *
 * ## THERE IS NO Link.AppleZoomTarget HERE, AND THAT IS DELIBERATE
 *
 * It looked like the name for "the view the button becomes", so it once went
 * round the whole screen. It is not that. It marks the ALIGNMENT RECT — which
 * part of the destination corresponds to the source — and the library's own
 * example puts it round a 200-point image inside an ordinary screen, never
 * round the screen itself. As a screen root it removes the root from layout,
 * and everything inside then measures against nothing.
 */
export function CalendarScreen({ date }: { date: LocalDate }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const requestDate = useRequestDate();

  // Read through the single function that decides what today is (D3). The
  // Journal holds its own copy from its own mount; they can only differ across
  // a midnight, and then both are right about their own moment.
  const [today] = useState<LocalDate>(() => currentLocalDate());
  const [month, setMonth] = useState<LocalDate>(date);

  /**
   * Asked for first, then dismissed.
   *
   * The Journal applies the day while the transition is still running, so what
   * is uncovered behind the shrinking card is already the right date rather
   * than the old one changing under the eye.
   */
  function choose(chosen: LocalDate): void {
    requestDate(chosen);
    router.back();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
          },
          theme.shadow,
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
  // Top-aligned rather than centred: the card comes out of a button in the
  // header, and a shape that grows downward from where it was touched reads as
  // one movement.
  screen: { flex: 1, paddingHorizontal: 16 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
});
