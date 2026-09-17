import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseGate } from '@/core/db/database-gate';
import { QueryProvider } from '@/core/query';
import { ThemeProvider, useTheme } from '@/core/theme';
import { useNotificationScheduling } from '@/features/notifications/hooks/use-notification-scheduling';
import { setNotificationHost } from '@/features/notifications/host-registry';
import { expoNotificationHost } from '@/features/notifications/native/expo-host';
import { RequestedDateProvider } from '@/features/nutrition/hooks/requested-date';
import { useSweepOffCacheOnce } from '@/features/nutrition/off/off-queries';
import { usePreferences } from '@/features/settings/data/settings-queries';

// THE ONE LINE THAT MAKES NOTIFICATIONS REAL, and it is wiring.
//
// Everything in features/notifications runs against an inert host until this
// runs. Module scope rather than an effect, because the registry has to hold
// the real host before the first render reads it — a screen that asked for the
// permission status one tick early would get the inert 'undetermined' and show
// the wrong banner.
//
// This import is what puts expo-notifications in the bundle, and it is the
// reason slice 9 needs exactly one CI cycle: the JS bundle does not carry a
// native module, so nothing below this line can be trusted on the device until
// GitHub Actions has rebuilt the development binary.
setNotificationHost(expoNotificationHost);

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
            {/*
              ABOVE THE TABS, because two things ask now: the calendar screen,
              which has asked since slice 3, and the Journal tab trigger, which
              returns to today when pressed. The trigger is declared in the tabs
              layout, so the provider cannot live on the Journal's own stack any
              more. Mounting a provider is wiring, which is all app/ does.
            */}
            <RequestedDateProvider>
              <RootStack />
            </RequestedDateProvider>
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

  // For the lifetime of the application, on the same precedent: the scheduler
  // has to re-read on every foreground (D14), so it cannot live on a screen —
  // a screen that is not mounted schedules nothing, and the Settings screen is
  // the least visited one there is. Everything it decides is written where it
  // lives; mounting it here is wiring.
  useNotificationScheduling();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: theme.colors.accent,
        // Only the library's screens show a header on this stack; the tabs
        // and the windows show none. Same size as the other three stacks'.
        headerTitleStyle: { color: theme.colors.text, fontSize: 20 },
        ...(glass
          ? { scrollEdgeEffects: { top: 'soft' as const } }
          : { headerBlurEffect: 'systemChromeMaterial' as const }),
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/*
        THE LIBRARY, OVER THE TAB BAR (specs 14.24).

        Siblings of (tabs) rather than screens of the Journal's stack, which is
        what makes them cover the bar. Requested, and it reverses slice 3: the
        library is not a page of the Journal, it is where the food and recipe
        records live, and every one of its screens is a task with a way out of
        its own. What it costs is that the bar is gone while browsing, so
        leaving for another tab costs a back first.

        "Browsing is a push, adding is a modal" survives intact: these are still
        pushes, with the system's back gesture. Only the stack changed.

        ## DECLARED HERE RATHER THAN UNDER A STACK OF THEIR OWN

        A nested stack was the first shape, on the precedent of settings/,
        stats/ and training/, and it took the back button away: the ROOT SCREEN
        OF A STACK DRAWS NONE — within its own stack there is nothing behind it
        — and the parent that does have something behind it shows no header at
        all. The library opened with an empty bar and only the swipe to leave.

        Flat, each screen is pushed on THIS stack, so the first of them has the
        tab group behind it and the navigator draws its back button. That button
        is a UIBarButtonItem, which is what gets Liquid Glass from UIKit on iOS
        26 — a GlassButton in a header would be glass inside glass, the mistake
        the iOS 26 direction names.
      */}
      <Stack.Screen
        name="library/index"
        options={{
          headerShown: true,
          title: 'Bibliothèque',
          // What the back button SAYS. Without it the label falls back to the
          // previous screen's title, and the previous screen is the tab group,
          // which has none — the navigator would offer "(tabs)".
          headerBackTitle: 'Journal',
        }}
      />
      {/*
        The two editors carry their own titles and their own header buttons; all
        they need from here is a bar to put them on. Their back button is
        labelled from the screen behind them, which is the library.
      */}
      <Stack.Screen name="library/food/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="library/recipe/[id]" options={{ headerShown: true }} />
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
      {/*
        Recording a weight (specs 9.1), declared for the reason the meal route
        above had to be: an undeclared route under (modals)/ takes the stack's
        default — an opaque card pushed in from the RIGHT — and the oversight
        produces neither an error nor a warning. OverlayPanel would raise it
        correctly and nobody would ever see that.

        Same three options as its siblings, and animation 'none' so the panel
        does the moving.
      */}
      <Stack.Screen
        name="(modals)/weight"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
        }}
      />
      {/*
        THE TWO SLICE 10 ADDED AND NEVER DECLARED, found while moving the
        library into this file.

        Same trap, third time: an undeclared route under (modals)/ takes the
        stack's default — an opaque card pushed in from the RIGHT — and the
        oversight produces neither an error nor a warning. OverlayPanel was
        raising both of them correctly and nobody could ever see it, because the
        screen carrying the panel was being pushed sideways.

        Creating an exercise and creating a routine are windows over the list
        they will join, exactly like their five siblings above.
      */}
      <Stack.Screen
        name="(modals)/exercise-edit"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="(modals)/routine-edit"
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
