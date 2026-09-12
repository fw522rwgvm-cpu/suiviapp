import { useLocalSearchParams, useRouter } from 'expo-router';
import type { JournalEntryId } from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { EmptyState } from '@/core/ui/empty-state';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel } from '@/core/ui/overlay-panel';
import { QuantityScreen } from '@/features/nutrition/screens/quantity-screen';

/**
 * Route wiring only (D10).
 *
 * The quantity screen of section 3, reached when an already-logged food is
 * tapped in the Journal. The ADD path does not come through here: it renders
 * the same screen inside the add modal, as state, so that choosing a food
 * costs a render rather than a modal presentation (D16 budgets 0,2 s for that
 * step, and the slice's exit criterion is two taps).
 *
 * An overlay rather than a full-screen modal, for the same reason as free
 * entry: correcting how much of something was eaten is done ON the day, not
 * instead of it, and leaving the day visible behind says so.
 *
 * The identifier is validated, never asserted (conventions section 4). A
 * malformed one is a dead end rather than a crash — nothing on this path may
 * be a blocking message, and there is nothing sensible to fall back to.
 */
export default function QuantityRoute() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();

  const id = entryId === undefined ? null : toEntityId<JournalEntryId>(entryId);

  return (
    <OverlayPanel
      onDismiss={() => router.back()}
      right={<GlassButton label="Fermer" onPress={() => router.back()} />}
    >
      {id === null ? (
        <EmptyState
          symbol="questionmark.circle"
          title="Entrée introuvable"
          message="Cette entrée n’existe plus, ou le lien est incorrect."
        />
      ) : (
        <QuantityScreen mode="edit" entryId={id} onDone={() => router.back()} />
      )}
    </OverlayPanel>
  );
}
