import { useRouter } from 'expo-router';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { RoutineEditorScreen } from '@/features/strength/screens/routine-editor-screen';

/**
 * Route wiring only (D10).
 *
 * A window over the list, like every other editor: consulting is a push and
 * ACTING on something is a window over it (slice 3). Choosing an exercise is a
 * STEP inside this window rather than a second one — see the screen — which is
 * also why no exercise has to travel back through a route parameter.
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
