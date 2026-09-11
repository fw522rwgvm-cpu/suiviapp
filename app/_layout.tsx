import { Stack } from 'expo-router';
import { DatabaseGate } from '@/core/db/database-gate';
import { QueryProvider } from '@/core/query';
import { ThemeProvider } from '@/core/theme';

// Route wiring only. No logic, no queries (D10).
// The database gate sits above the router: a refusal to start on a database
// newer than the binary (D6/G3) has to be reachable when there is no usable
// application behind it.
// The query layer sits below the gate, for the same reason in reverse: it must
// only ever talk to a database that has been opened, checked and migrated.
export default function RootLayout() {
  return (
    <ThemeProvider>
      <DatabaseGate>
        <QueryProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryProvider>
      </DatabaseGate>
    </ThemeProvider>
  );
}
