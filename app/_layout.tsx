import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseGate } from '@/core/db/database-gate';
import { QueryProvider } from '@/core/query';
import { ThemeProvider } from '@/core/theme';

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
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              {/*
                The add screen is a full-screen modal (specs 7). All three are
                siblings rather than a nested stack: the fast path never
                navigates between them — choosing a food swaps the content of
                the add modal — so nesting would buy an animation nobody sees
                and cost a second dismissal on the way out.
              */}
              <Stack.Screen
                name="(modals)/add-entry"
                options={{ presentation: 'fullScreenModal', headerShown: true }}
              />
              <Stack.Screen
                name="(modals)/quantity"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: true,
                  title: 'Quantité',
                }}
              />
              <Stack.Screen
                name="(modals)/free-entry"
                options={{
                  presentation: 'fullScreenModal',
                  headerShown: true,
                  title: 'Saisie libre',
                }}
              />
            </Stack>
          </QueryProvider>
        </DatabaseGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
