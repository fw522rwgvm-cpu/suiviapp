import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';
import { useStackHeaderOptions } from '@/core/ui/stack-header';

/**
 * A native stack inside the Entrainement tab, so an exercise can be pushed.
 *
 * The fourth application of the reason that produced (journal) in slice 0,
 * settings/ in slice 5 and stats/ in slice 8: NativeTabs supplies no header,
 * and a leaf route pushes nothing. Specs 10.1 wants a page per exercise, and
 * slice 3's rule makes consulting a push.
 *
 * A PLAIN DIRECTORY, not a group, for the reason settings/ and stats/ are: only
 * the Journal must stay the tabs group's index route, so only its folder is
 * parenthesised. This gives /training and /training/exercise/[id], and the tab
 * trigger keeps naming it exactly as it always did.
 *
 * ## THE SPECS PUT THESE ROUTES AT THE ROOT, AND THAT WOULD HAVE BEEN WRONG
 *
 * Section 3 of the architecture draws app/exercise/[id].tsx beside app/(tabs)/.
 * Pushed from there they would be SIBLINGS of the tab group and would cover the
 * tab bar, taking the iOS 26 minimisation with them. Section 3 is amended in
 * those terms.
 *
 * The library made the opposite move in the other direction (specs 14.24) and
 * that is not a contradiction: an exercise is CONSULTED beside the routines
 * that use it, so the bar has to stay reachable, where the library is where the
 * records themselves live and every screen in it is a task. The question is
 * never where section 3 draws a route, it is whether leaving the tab is the
 * point of going there.
 *
 * Route wiring only (D10).
 */
export default function TrainingLayout() {
  const theme = useTheme();
  // Called at the top of the component, never inside the options object: a hook
  // spread inline still obeys the rules of hooks, and still reads as though it
  // might not.
  const header = useStackHeaderOptions();

  return (
    <Stack
      screenOptions={{
        ...header,
        headerTitleStyle: { color: theme.colors.text, fontSize: 20 },
      }}
    >
      {/*
        Named, because `title` is what a pushed screen writes on its back
        button: without it the navigator falls back to the route name, and
        returning from an exercise offered a chevron labelled "index".
      */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Entraînement' }} />
    </Stack>
  );
}
