import { useLocalSearchParams } from 'expo-router';
import type { DayTemplateId } from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { TemplateEditorScreen } from '@/features/nutrition/screens/template-editor-screen';

/**
 * Route wiring only (D10): read the parameter, hand it to the domain screen.
 *
 * 'new' is the creation path, and anything else is read as an identifier —
 * validated, never asserted (conventions section 4). A malformed one falls
 * back to creation rather than throwing, exactly as the food editor's route
 * does: route parameters come from outside, the scheme being registered.
 */
export default function TemplateEditorRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <TemplateEditorScreen
      templateId={id === undefined || id === 'new' ? null : toEntityId<DayTemplateId>(id)}
    />
  );
}
