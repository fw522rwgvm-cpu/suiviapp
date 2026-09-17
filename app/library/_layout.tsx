import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';
import { useStackHeaderOptions } from '@/core/ui/stack-header';

/**
 * The library's own stack, now that it sits OUTSIDE the tab group.
 *
 * ## IT COVERS THE TAB BAR, AND THAT REVERSES SLICE 3
 *
 * Section 3 of the architecture drew this at app/library/ from the start.
 * Slice 3 moved it into the Journal's stack on purpose, and wrote the reason
 * down: pushed from the root it is a sibling of (tabs), so it covers the tab
 * bar and takes the iOS 26 minimise-on-scroll behaviour with it, where specs 7
 * describes the library as a place the Journal leads to.
 *
 * Requested the other way (specs 14.24), and section 3 turns out to have been
 * right: the library is not a page of the Journal, it is where the food and
 * recipe records live, and every one of its screens is a task with a way out of
 * its own. Covering the bar is what says so. What that costs is stated rather
 * than discovered — the tab bar is gone while browsing, so leaving for another
 * tab costs a back first, and the bar's minimisation does not apply to these
 * screens.
 *
 * "Browsing is a push, adding is a modal" survives intact: this is still a
 * push, with the system's back gesture. What changed is which stack it is
 * pushed onto.
 *
 * A stack of its own rather than three screens declared at the root, on the
 * precedent of settings/, stats/ and training/: the root stack shows no header
 * at all, and these three screens each carry a title and a back button.
 *
 * Route wiring only (D10).
 */
export default function LibraryLayout() {
  const theme = useTheme();
  // At the top of the component, never spread inline inside the options object:
  // a hook called there still obeys the rules of hooks and still reads as
  // though it might not.
  const header = useStackHeaderOptions();

  return (
    <Stack
      screenOptions={{
        ...header,
        headerTitleStyle: { color: theme.colors.text, fontSize: 20 },
        /**
         * The chevron alone on the way back to the tabs.
         *
         * A back button is labelled with the PREVIOUS screen's title, and the
         * previous screen here is the tab group, which has none — the navigator
         * would fall back to the route name and offer a chevron labelled
         * "(tabs)". That is the defect the training stack names for its own
         * index route. Nothing to name here, so nothing is written.
         */
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      {/*
        Titled even though it shows its own header options: `title` is what the
        screens pushed on top of it write on their back button, and without it
        returning from a food editor offers a chevron labelled "index".
      */}
      <Stack.Screen name="index" options={{ title: 'Bibliothèque' }} />
    </Stack>
  );
}
