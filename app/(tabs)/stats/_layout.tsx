import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';
import { useStackHeaderOptions } from '@/core/ui/stack-header';

/**
 * A native stack inside the Stats tab, so the weight history can be pushed.
 *
 * The third application of the reason that produced (journal) in slice 0 and
 * settings/ in slice 5: NativeTabs supplies no header, and a leaf route pushes
 * nothing. Specs 9.1 wants the weight history "consultable et corrigeable", and
 * correcting a measurement follows seeing it look wrong on the curve — so it
 * belongs one push away from the curve.
 *
 * A PLAIN DIRECTORY, not a group, for the reason settings/ is one: only the
 * Journal must stay the tabs group's index route, so only its folder has to be
 * parenthesised. This gives /stats and /stats/weight-history, and the tab
 * trigger keeps naming it exactly as it always did.
 *
 * ## THE SCREEN ITSELF IS UNCHANGED, AND THAT IS DELIBERATE
 *
 * headerShown: false on the index, so the Stats screen keeps the large title it
 * carries itself and looks exactly as it did on the device in slice 7. A stack
 * added underneath is wiring; it must not be a visual change nobody asked for.
 *
 * Route wiring only (D10).
 */
export default function StatsLayout() {
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
        Named for the same reason the Settings index is: `title` is what a
        pushed screen writes on its back button, and without it the navigator
        falls back to the route name — so returning from the weight history
        offered a chevron labelled "index". Found while fixing the Settings;
        same defect, same line.
      */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Stats' }} />
    </Stack>
  );
}
