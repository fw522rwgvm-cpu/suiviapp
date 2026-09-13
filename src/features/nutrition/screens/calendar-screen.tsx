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
 * So the screen animates nothing of its own now. It draws a sheet and lets the
 * transition own both directions, which is the whole reason it is a route.
 * OverlayPanel stays right for the other windows — add, quantity, free entry,
 * meal — because none of those has a source view to come out of.
 *
 * ## NO BACKDROP, AND NO TRANSPARENCY EITHER
 *
 * OverlayPanel darkens what is behind it. Under a zoom transition the whole
 * presented screen is what grows out of the button, dimming included — which
 * would be a small dark square swelling from the header.
 *
 * The screen was then transparent for a while, so the Journal showed through.
 * That cost more than it bought: a transparent MODAL is presented on the
 * window, iOS scales the presenting screen back behind it, and the strips
 * above and below filled with the window's own white. The dim backdrop had
 * been hiding exactly that for as long as there was one.
 *
 * It is an ordinary pushed screen now, opaque, filling everything. The sheet
 * runs to the bottom edge and covers what the transparency used to reveal, so
 * nothing was lost by giving it a ground of its own.
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
   * is uncovered behind the shrinking sheet is already the right date rather
   * than the old one changing under the eye.
   */
  function choose(chosen: LocalDate): void {
    requestDate(chosen);
    router.back();
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + 12 },
      ]}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingBottom: insets.bottom + 16,
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
  /**
   * Top-aligned rather than centred: the sheet comes out of a button in the
   * header, and a shape that grows downward from where it was touched reads as
   * one movement.
   */
  screen: { flex: 1 },
  /**
   * A SHEET, NOT A CARD. It was a card sized to its contents with a margin all
   * round, and it read as a window floating over the Journal — which is what
   * OverlayPanel used to draw and what this screen is no longer.
   *
   * `flex: 1` is what carries it to the bottom edge: without it the view takes
   * the height of the calendar grid and stops there. Full width, so only the
   * top corners are rounded and only the top edge is ruled — a shape that
   * reaches three sides of the screen has no business drawing them.
   *
   * The grid keeps its own side padding; the BACKGROUND runs to the edges and
   * the content does not.
   */
  sheet: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
});
