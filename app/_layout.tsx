import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseGate } from '@/core/db/database-gate';
import { QueryProvider } from '@/core/query';
import { ThemeProvider, useTheme } from '@/core/theme';

// Route wiring only. No logic, no queries (D10).
//
// The database gate sits above the router: a refusal to start on a database
// newer than the binary (D6/G3) has to be reachable when there is no usable
// application behind it.
//
// The query layer sits below the gate, for the same reason in reverse: it must
// only ever talk to a database that has been opened, checked and migrated.
//
// GestureHandlerRootView wraps everything because swipe to delete and the
// day-to-day swipe (specs 8.3) are gesture handlers, and they are inert
// outside it.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <DatabaseGate>
          <QueryProvider>
            <RootStack />
          </QueryProvider>
        </DatabaseGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
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
        The add screen is a full-screen modal (specs 7). All three are siblings
        rather than a nested stack: the fast path never navigates between them —
        choosing a food swaps the content of the add modal — so nesting would
        buy an animation nobody sees and cost a second dismissal on the way out.
      */}
      <Stack.Screen
        name="(modals)/add-entry"
        options={{ presentation: 'fullScreenModal', headerShown: true }}
      />
      {/*
        THE TWO EDITING ROUTES ARE OVERLAYS, not full-screen modals.

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
        }}
      />
      <Stack.Screen
        name="(modals)/free-entry"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
