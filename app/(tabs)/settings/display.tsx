import { Stack } from 'expo-router';
import { DisplayScreen } from '@/features/settings/screens/display-screen';

/** Route wiring only (D10). */
export default function DisplayScreenRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Heure de bascule' }} />
      <DisplayScreen />
    </>
  );
}
