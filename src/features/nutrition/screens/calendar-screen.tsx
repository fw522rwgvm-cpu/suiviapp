import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
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
 * ## THERE IS NO Link.AppleZoomTarget HERE, AND THAT IS DELIBERATE
 *
 * It looked like the name for "the view the button becomes", so it once went
 * round the whole screen. It is not that. It marks the ALIGNMENT RECT — which
 * part of the destination corresponds to the source — and the library's own
 * example puts it round a 200-point image inside an ordinary screen, never
 * round the screen itself. As a screen root it removes the root from layout,
 * and everything inside then measures against nothing.
 *
 * ## Why the parts are separate components
 *
 * useDismiss() reads a context OverlayPanel publishes from INSIDE itself. A
 * hook called in the component that RENDERS the panel sits above that provider
 * and silently gets the fallback — a plain router.back() — so the window would
 * vanish instead of folding away. Anything that dismisses therefore lives as a
 * child, which is also why the actions are passed as elements rather than as
 * callbacks.
 */
export function CalendarScreen({ date }: { date: LocalDate }) {
  const router = useRouter();

  return (
    <OverlayPanel
      onDismiss={() => router.back()}
      left={<TodayAction />}
      right={<CancelAction />}
    >
      <Grid date={date} />
    </OverlayPanel>
  );
}

function TodayAction() {
  const requestDate = useRequestDate();
  const dismiss = useDismiss();

  return (
    <GlassButton
      label="Aujourd’hui"
      onPress={() => {
        // Asked for first, then dismissed: the Journal applies it while the
        // window is still folding away, so the day underneath is already the
        // right one by the time it is uncovered.
        requestDate(currentLocalDate());
        dismiss();
      }}
    />
  );
}

function CancelAction() {
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

function Grid({ date }: { date: LocalDate }) {
  const requestDate = useRequestDate();
  const dismiss = useDismiss();

  // Read through the single function that decides what today is (D3). The
  // Journal holds its own copy from its own mount; they can only differ across
  // a midnight, and then both are right about their own moment.
  const [today] = useState<LocalDate>(() => currentLocalDate());
  const [month, setMonth] = useState<LocalDate>(date);

  return (
    <View style={styles.grid}>
      <MonthCalendar
        month={month}
        selected={date}
        today={today}
        onMonthChange={setMonth}
        onSelect={(chosen) => {
          requestDate(chosen);
          dismiss();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: 16 },
});
