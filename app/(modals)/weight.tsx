import { useLocalSearchParams, useRouter } from 'expo-router';
import { parseLocalDate } from '@/core/date';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { useToday } from '@/features/settings/data/settings-queries';
import { WeightEntryScreen } from '@/features/weight/screens/weight-entry-screen';

/**
 * Route wiring only (D10): read the parameter, hand it to the domain screen.
 *
 * AN OVERLAY, like every other window in this application. Recording a weight
 * is done ON the day — specs 9.1 puts the field "sous la liste des repas de
 * l'écran Journal, sur la date consultée" — so the Journal stays visible
 * behind it. An opaque screen would say the day had been left.
 *
 * The date is a string from outside: the application puts it there, but so
 * could a deep link, the scheme being registered. It is validated rather than
 * asserted (conventions, section 4), and a malformed one falls back to today
 * instead of throwing, because nothing on this path may be a blocking message.
 */
function CancelAction() {
  // Inside the panel, so its dismissal folds the window away first.
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

export default function WeightRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = useToday();

  const date = params.date === undefined ? null : parseLocalDate(params.date);

  return (
    <OverlayPanel onDismiss={() => router.back()} right={<CancelAction />}>
      <WeightEntryScreen date={date ?? today} />
    </OverlayPanel>
  );
}
