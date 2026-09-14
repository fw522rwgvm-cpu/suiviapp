import { Stack } from 'expo-router';
import { WeightHistoryScreen } from '@/features/weight/screens/weight-history-screen';

/**
 * Route wiring only (D10).
 *
 * Pushed inside the Stats stack rather than the Journal's, and specs 9.1 names
 * no place for it at all — consulting is a push, and the push belongs next to
 * the curve, because correcting a measurement follows seeing it look wrong
 * there. Recorded as an amendment (specs 14.14).
 */
export default function WeightHistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Historique des pesées' }} />
      <WeightHistoryScreen />
    </>
  );
}
