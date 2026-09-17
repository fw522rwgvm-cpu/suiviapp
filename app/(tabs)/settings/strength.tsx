import { Stack } from 'expo-router';
import { StrengthSettingsScreen } from '@/features/strength/screens/strength-settings-screen';

/** Route wiring only (D10). */
export default function StrengthSettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Musculation' }} />
      <StrengthSettingsScreen />
    </>
  );
}
