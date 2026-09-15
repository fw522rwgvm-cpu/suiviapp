import { useRouter } from 'expo-router';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { ExerciseEditorScreen } from '@/features/strength/screens/exercise-editor-screen';

/**
 * Route wiring only (D10).
 *
 * AN OVERLAY, like every other window in this application: slice 3's rule is
 * that consulting is a push and ACTING on something is a window over it.
 * Creating an exercise acts on the library, editing one acts on the exercise,
 * and both leave what they act on visible behind.
 *
 * The screen reads its own `id` parameter rather than being handed one, because
 * the two cases differ in more than a value: with an id it loads a draft and
 * waits for it, without one it states a starting draft from the settings. A
 * route that resolved that would be doing the screen's job.
 *
 * ## THE WAY OUT IS DECLARED HERE, AND IT HAS TO BE
 *
 * A window's navigator draws no back button — the trap slice 3 found when free
 * entry had shipped since slice 1 with no way to cancel at all, because "Ajouter"
 * and "Supprimer" both happened to close it. OverlayPanel carries the exit for
 * every window now, and this is where it is named.
 */
function CancelAction() {
  // Inside the panel, so its dismissal folds the window away first.
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

export default function ExerciseEditRoute() {
  const router = useRouter();

  return (
    <OverlayPanel onDismiss={() => router.back()} right={<CancelAction />}>
      <ExerciseEditorScreen />
    </OverlayPanel>
  );
}
