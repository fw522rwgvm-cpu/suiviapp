import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type LocalDate } from '@/core/date';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { useToday } from '@/features/settings/data/settings-queries';
import { MonthCalendar } from '../components/month-calendar';
import { useRequestDate } from '../hooks/requested-date';

/**
 * Direct access to a date (specs 8.3).
 *
 * ## IT WAS A ZOOM TRANSITION, AND IT IS NOT ANY MORE
 *
 * iOS 18 has a transition where a control genuinely becomes the view it
 * presents, and expo-router exposes it as Link.AppleZoom. It was used here, and
 * the anchoring worked: the sheet came out of the calendar button and the
 * interactive dismissal took it back in.
 *
 * It was dropped for one thing it carries and cannot be separated from:
 * Apple's transition SCALES THE PRESENTING SCREEN BACK while the sheet is up.
 * Verified in the API rather than assumed — LinkZoomTransitionSource takes
 * `identifier`, `alignment` and `animateAspectRatioChange`, and nothing that
 * turns the scale-back off. The Journal shrinking behind, with the window
 * showing white above and below it, was worse to look at than the anchoring
 * was good.
 *
 * The reason it HAD to be a route goes with the transition — that animated a
 * NAVIGATION. It stays one anyway: the request context that carries the chosen
 * day back is built round that shape, and specs 7 wants the Journal on today at
 * every launch, which a route parameter outliving the visit would break.
 *
 * ## THE PANEL IS THE APPLICATION'S OWN IDIOM, AND IT ALREADY DOES ALL OF IT
 *
 * Full width, running to the bottom edge, rounded at the top only, rising from
 * the bottom and falling back, with a drag on the actions row that follows the
 * finger. Every other window uses it. The calendar spent several turns being
 * the exception and gained nothing by it.
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
  const today = useToday();

  return (
    <GlassButton
      label="Aujourd’hui"
      onPress={() => {
        // Asked for first, then dismissed: the Journal applies it while the
        // window is still folding away, so the day underneath is already the
        // right one by the time it is uncovered.
        requestDate(today);
        dismiss();
      }}
    />
  );
}

function CancelAction() {
  const dismiss = useDismiss();
  return <GlassButton label="Fermer" onPress={dismiss} />;
}

function Grid({ date }: { date: LocalDate }) {
  const requestDate = useRequestDate();
  const dismiss = useDismiss();

  // Read through the single function that decides what today is, cutoff
  // included (D3). The Journal holds its own copy from its own mount; they can
  // only differ across a midnight, and then both are right about their own
  // moment.
  const today = useToday();
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
