import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel } from '@/core/ui/overlay-panel';
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
 * The route is presented as a TRANSPARENT MODAL and the panel is drawn by
 * OverlayPanel, which carries the geometry and the reasoning — the Journal
 * stays visible underneath, because choosing a date is not leaving the day.
 */
export function CalendarScreen({ date }: { date: LocalDate }) {
  const router = useRouter();
  const requestDate = useRequestDate();

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
    <OverlayPanel
      onDismiss={() => router.back()}
      left={<GlassButton label="Aujourd’hui" onPress={() => choose(today)} />}
      right={<GlassButton label="Fermer" onPress={() => router.back()} />}
    >
      <View style={styles.grid}>
        <MonthCalendar
          month={month}
          selected={date}
          today={today}
          onMonthChange={setMonth}
          onSelect={choose}
        />
      </View>
    </OverlayPanel>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: 16 },
});
