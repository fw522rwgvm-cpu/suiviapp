import { Stack } from 'expo-router';

// Route wiring only. No logic, no queries (D10).
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
