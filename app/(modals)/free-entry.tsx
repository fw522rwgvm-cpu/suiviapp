import { useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate, parseLocalDate } from '@/core/date';
import type { JournalEntryId } from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel } from '@/core/ui/overlay-panel';
import { FreeEntryScreen } from '@/features/nutrition/screens/free-entry-screen';

/**
 * Route wiring only (D10): read the parameters, hand them to the domain screen.
 *
 * THIS ROUTE IS THE EDITING PATH. Adding a free entry never comes through
 * here — it is a step inside the add modal, next to the quantity step, so the
 * whole "add something" journey stays in one screen.
 *
 * Which is why it is an overlay rather than a full-screen modal: correcting
 * four numbers on a line already in the journal is done ON the day, not
 * instead of it, and the panel says so by leaving the day visible behind.
 *
 * Route parameters are strings from outside — the application puts them there,
 * but so could a deep link, the scheme being registered. They are validated
 * rather than asserted (conventions, section 4), and a malformed one falls
 * back instead of throwing: nothing on the critical path may be a blocking
 * message.
 */
export default function FreeEntryRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    date?: string;
    mealPosition?: string;
    entryId?: string;
  }>();

  const date = params.date === undefined ? null : parseLocalDate(params.date);
  const position =
    params.mealPosition === undefined ? Number.NaN : Number.parseInt(params.mealPosition, 10);

  return (
    <OverlayPanel
      onDismiss={() => router.back()}
      right={<GlassButton label="Fermer" onPress={() => router.back()} />}
    >
      <FreeEntryScreen
        date={date ?? currentLocalDate()}
        mealPosition={Number.isInteger(position) && position >= 0 ? position : null}
        entryId={
          params.entryId === undefined ? null : toEntityId<JournalEntryId>(params.entryId)
        }
      />
    </OverlayPanel>
  );
}
