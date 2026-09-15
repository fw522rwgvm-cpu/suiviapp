import { Stack } from 'expo-router';
import { AppearanceScreen } from '@/features/settings/screens/appearance-screen';

/** Route wiring only (D10). */
export default function AppearanceScreenRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Apparence' }} />
      <AppearanceScreen />
    </>
  );
}
