import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseGate } from '@/core/db/database-gate';
import { QueryProvider } from '@/core/query';
import { ThemeProvider, useTheme } from '@/core/theme';
import { useSweepOffCacheOnce } from '@/features/nutrition/off/off-queries';
import { usePreferences } from '@/features/settings/data/settings-queries';

// Route wiring only. No logic, no queries (D10).
//
// The database gate sits above the router: a refusal to start on a database
// newer than the binary (D6/G3) has to be reachable when there is no usable
// application behind it.
//
// The query layer sits below the gate, for the same reason in reverse: it must
// only ever talk to a database that has been opened, checked and migrated.
//
// ## THE THEME MOVED BELOW BOTH, IN SLICE 7, AND IT HAD TO
//
// It used to wrap everything, which was right while it only followed the
// system. The stored preference (specs 8.8) is a row in `setting`, so nothing
// above the gate can read it: a provider there would have had to start on a
// default and correct itself once the database opened, which is a flash of the
// wrong theme on every cold start.
//
// Below the gate it mounts with the preference already in hand — the read is
// synchronous, see usePreferences — so the first painted frame is the right
// colour. The price is that the gate's own three screens have no theme, which
// is written up where they are.
//
// GestureHandlerRootView wraps everything because swipe to delete and the
// day-to-day swipe (specs 8.3) are gesture handlers, and they are inert
// outside it.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DatabaseGate>
        <QueryProvider>
          <ThemeFromPreference>
            <RootStack />
          </ThemeFromPreference>
        </QueryProvider>
      </DatabaseGate>
    </GestureHandlerRootView>
  );
}

/**
 * Reads the stored preference and hands it to the theme.
 *
 * Wiring, which is what this folder is for: one value read, one prop passed,
 * no decision taken. ThemeProvider keeps knowing nothing about the database
 * and settings-queries keeps knowing nothing about the tree.
 */
function ThemeFromPreference({ children }: { children: ReactNode }) {
  const { theme } = usePreferences();
  return <ThemeProvider preference={theme}>{children}</ThemeProvider>;
}

/**
 * Split out only so it can read the theme: RootLayout is the component that
 * renders ThemeProvider, so it sits outside its own context.
 *
 * The modal headers are transparent like the Journal stack's — see the note in
 * app/(tabs)/(journal)/_layout.tsx for the whole reasoning. Doing it to one
 * stack and not the other would be worse than either choice on its own, and
 * these screens are the easy case: one ScrollView each, rather than the three
 * side by side that the day carousel mounts.
 */
function RootStack() {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  // Once per launch, after the first paint. Mounting it is wiring; what it
  // does and why it is not in the startup sequence is written where it lives.
  useSweepOffCacheOnce();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: theme.colors.accent,
        headerTitleStyle: { color: theme.colors.text },
        ...(glass
          ? { scrollEdgeEffects: { top: 'soft' as const } }
          : { headerBlurEffect: 'systemChromeMaterial' as const }),
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/*
        ALL FOUR ARE OVERLAYS, and siblings rather than a nested stack.

        Specs 7 calls the add screen a full-screen modal; it is a window over
        the Journal instead, and the rest of the slice went the same way. What
        the four have in common is that none of them is a place: adding to a
        day, correcting a line, setting a goal, picking a date are all things
        done ON the day.
        An opaque screen says you left it.

        Siblings because the fast path never navigates between them — choosing
        a food swaps the content of the add panel — so nesting would buy an
        animation nobody sees and cost a second dismissal on the way out.

        animation 'none' throughout: OverlayPanel raises the window itself, so
        that the backdrop can darken where it is instead of rising with it.
      */}
      <Stack.Screen
        name="(modals)/add-entry"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
        }}
      />
      {/*
        THE EDITING ROUTES ARE OVERLAYS, not full-screen modals.

        Correcting a line already in the journal — a quantity, or four typed
        numbers — is done ON the day rather than instead of it. A transparent
        modal keeps the Journal mounted and visible behind, and OverlayPanel
        draws the window over it; an opaque screen would read as going
        somewhere else, which is the wrong thing to say about an edit.

        Adding comes through neither: both are steps inside the add modal
        above, so the whole "add something" journey stays in one screen.

        No header, because the panel carries its own way out — a bar above a
        floating window would make it look like a page again.
      */}
      <Stack.Screen
        name="(modals)/quantity"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          // NOTHING, because OverlayPanel does it. The window has to rise
          // from the bottom while the backdrop darkens where it is, and every
          // built-in presentation moves the whole screen as one — which is
          // what made the veil rise along with the window.
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="(modals)/free-entry"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          // NOTHING, because OverlayPanel does it. The window has to rise
          // from the bottom while the backdrop darkens where it is, and every
          // built-in presentation moves the whole screen as one — which is
          // what made the veil rise along with the window.
          animation: 'none',
        }}
      />
      {/*
        THE ONE THAT WAS MISSING, and its absence is why it behaved differently.
        An undeclared route falls back to the stack's default — an opaque card
        pushed in from the RIGHT — so adding a meal slid in sideways while every
        other window rose from the bottom. OverlayPanel was already raising it
        correctly; nothing ever saw that, because the screen carrying it was
        being pushed.

        Declaring it is the whole fix: same three options as its siblings, and
        animation 'none' so the panel does the moving.
      */}
      <Stack.Screen
        name="(modals)/meal"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
        }}
      />
    </Stack>
  );
}
