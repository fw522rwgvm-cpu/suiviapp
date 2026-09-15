import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';
import { useStackHeaderOptions } from '@/core/ui/stack-header';

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
 * Header options come from core/ui/stack-header. They were copied from the
 * Journal's stack for three slices — two stacks with the same options are not
 * yet a component — and the Stats stack of slice 8 is the third user, which is
 * what the rule says settles it. The title style stays here: this bar wants an
 * ordinary title where the Journal's wants extra-bold Nunito, and that is a
 * decision rather than a mechanism.
 *
 * Route wiring only (D10): this reads the theme and declares screen options.
 */
export default function SettingsLayout() {
  const theme = useTheme();
  const header = useStackHeaderOptions();

  return (
    <Stack
      screenOptions={{
        ...header,
        headerTitleStyle: { color: theme.colors.text, fontSize: 20 },
      }}
    >
      {/*
        The Settings screen carries its own large title, as it always has — and
        it is ALSO named here, which is a different thing.
        `title` is what the pushed screens put on their back button. Without it
        the navigator falls back to the route's own name, so every sub-page of
        the Settings had a chevron labelled "index". `headerShown: false` still
        wins, so nothing is drawn on this screen; the name is only for the
        screens above it.
        Deeper pushes are unaffected: templates/[id] still says "Modèles de
        journée", because a back button names the screen it returns TO.
      */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Réglages' }} />
    </Stack>
  );
}
