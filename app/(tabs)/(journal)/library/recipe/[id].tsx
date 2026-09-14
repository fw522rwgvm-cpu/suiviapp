import { useLocalSearchParams } from 'expo-router';
import type { RecipeId } from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { RecipeEditorScreen } from '@/features/nutrition/screens/recipe-editor-screen';

/**
 * Route wiring only (D10): read the parameter, hand it to the domain screen.
 *
 * 'new' is the creation path, and anything else is read as an identifier —
 * validated, never asserted (conventions section 4). A malformed one falls
 * back to creation rather than throwing: route parameters come from outside,
 * the scheme being registered, and nothing on this path may be a blocking
 * message. The food route next door does exactly this.
 */
export default function RecipeEditorRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <RecipeEditorScreen
      recipeId={id === undefined || id === 'new' ? null : toEntityId<RecipeId>(id)}
    />
  );
}
