import { Stack } from 'expo-router';
import { DataSettingsScreen } from '@/features/settings/screens/data-settings-screen';

/** Route wiring only (D10). */
export default function DataSettingsScreenRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Données' }} />
      <DataSettingsScreen />
    </>
  );
}
