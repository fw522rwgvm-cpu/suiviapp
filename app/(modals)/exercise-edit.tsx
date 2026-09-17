import { useRouter } from 'expo-router';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { ExerciseEditorScreen } from '@/features/strength/screens/exercise-editor-screen';

/**
 * Route wiring only (D10).
 *
 * CREATION ONLY, like its routine sibling. Editing an exercise happens on its
 * own page, which flips into an editable state rather than being covered by a
 * window — the window was hiding exactly the exercise it was changing, so slice
 * 3's rule argued against itself there (specs 14.27).
 *
 * Creation has no page to flip, so it keeps the window, opening over the list
 * the new exercise will join.
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
