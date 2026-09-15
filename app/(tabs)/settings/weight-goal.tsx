import { Stack } from 'expo-router';
import { WeightGoalScreen } from '@/features/weight/screens/weight-goal-screen';

/**
 * Route wiring only (D10).
 *
 * Pushed inside the Settings stack, beside the templates and the planning: the
 * goal is configuration, and specs 9.2 puts it there in as many words —
 * "modifiable et désactivable depuis les Réglages". Browsing is a push; the
 * windows are for acting on a day.
 */
export default function WeightGoalRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Objectif de poids' }} />
      <WeightGoalScreen />
    </>
  );
}
