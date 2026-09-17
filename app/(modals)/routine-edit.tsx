import { useRouter } from 'expo-router';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { RoutineEditorScreen } from '@/features/strength/screens/routine-editor-screen';

/**
 * Route wiring only (D10).
 *
 * CREATION ONLY. Editing a routine happens on its own page, which flips into
 * an editable state rather than being covered by a window — the window was
 * hiding exactly the routine it was changing, so slice 3's rule argued against
 * itself there.
 *
 * Creation has no page to flip, so it keeps the window, opening over the list
 * the new routine will join. Choosing an exercise is a STEP inside it rather
 * than a second window, which is also why no exercise has to travel back
 * through a route parameter.
 */
function CancelAction() {
  // Inside the panel, so its dismissal folds the window away first.
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

export default function RoutineEditRoute() {
  const router = useRouter();

  return (
    <OverlayPanel onDismiss={() => router.back()} right={<CancelAction />}>
      <RoutineEditorScreen />
    </OverlayPanel>
  );
}
