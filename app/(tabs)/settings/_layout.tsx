import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';

/**
 * A native stack inside the Settings tab, so templates and the planning can be
 * pushed on top of it.
 *
 * The reason is the one that produced (journal) in slice 0, applied a second
 * time: NativeTabs supplies no header, and a leaf route pushes nothing. Specs
 * 8.8 and 12 put "day templates, planning, default template" in the Settings,
 * and those are screens you go INTO — browsing is a push, adding is a modal.
 *
 * A PLAIN DIRECTORY, NOT A GROUP, and that is the difference from (journal).
 * The Journal must stay the tabs group's index route, so its folder may not
 * add a path segment and has to be parenthesised. The Settings must NOT be
 * that index — so a second parenthesised group here would have made
 * settings/index.tsx claim "/" for a second time, alongside the Journal's.
 * A plain folder gives /settings, /settings/templates and /settings/planning,
 * and the tab trigger keeps naming it exactly as it always did.
 *
 * Header options are copied from the Journal's stack rather than shared: two
 * stacks with the same options are not yet a component, and the rule is that
 * something moves to core/ui at its second REAL user. This is the second, so
 * the next one settles it.
 *
 * Route wiring only (D10): this reads the theme and declares screen options.
 */
export default function SettingsLayout() {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: theme.colors.accent,
        headerTitleStyle: { color: theme.colors.text, fontSize: 20 },
        // Never a backgroundColor here: headerTransparent only clears the
        // background if headerStyle does not set one, and opacity is exactly
        // what cancels the glass.
        ...(glass
          ? { scrollEdgeEffects: { top: 'soft' as const } }
          : { headerBlurEffect: 'systemChromeMaterial' as const }),
      }}
    >
      {/* The Settings screen carries its own large title, as it always has. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
