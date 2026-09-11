import { Stack } from 'expo-router';
import { DatabaseGate } from '@/core/db/database-gate';

// Route wiring only. No logic, no queries (D10).
export default function RootLayout() {
  return (
    <DatabaseGate>
      <Stack screenOptions={{ headerShown: false }} />
    </DatabaseGate>
  );
}
