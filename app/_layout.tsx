import { Stack } from 'expo-router';
import { DatabaseGate } from '@/core/db/database-gate';
import { ThemeProvider } from '@/core/theme';

// Route wiring only. No logic, no queries (D10).
// The database gate sits above the router: a refusal to start on a database
// newer than the binary (D6/G3) has to be reachable when there is no usable
// application behind it.
export default function RootLayout() {
  return (
    <ThemeProvider>
      <DatabaseGate>
        <Stack screenOptions={{ headerShown: false }} />
      </DatabaseGate>
    </ThemeProvider>
  );
}
