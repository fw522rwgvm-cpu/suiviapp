import { useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate, parseLocalDate } from '@/core/date';
import { GlassButton } from '@/core/ui/glass-button';
import { OverlayPanel, useDismiss } from '@/core/ui/overlay-panel';
import { MealEditorScreen } from '@/features/nutrition/screens/meal-editor-screen';

/**
 * Route wiring only (D10): read the parameters, hand them to the domain screen.
 *
 * An overlay rather than a full-screen modal, like free entry: adding a meal to
 * a day, or correcting its goals, is done ON the day — which stays visible
 * behind the panel rather than being replaced by a screen that says you left.
 *
 * Route parameters are strings from outside — the application puts them there,
 * but so could a deep link, the scheme being registered. They are validated
 * rather than asserted (conventions, section 4), and a malformed one falls back
 * to creating rather than throwing.
 */
function CancelAction() {
  const dismiss = useDismiss();
  return <GlassButton label="Annuler" onPress={dismiss} />;
}

export default function MealRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; mealPosition?: string }>();

  const date = params.date === undefined ? null : parseLocalDate(params.date);
  const position =
    params.mealPosition === undefined ? Number.NaN : Number.parseInt(params.mealPosition, 10);

  return (
    <OverlayPanel onDismiss={() => router.back()} right={<CancelAction />}>
      <MealEditorScreen
        date={date ?? currentLocalDate()}
        mealPosition={Number.isInteger(position) && position >= 0 ? position : null}
      />
    </OverlayPanel>
  );
}
