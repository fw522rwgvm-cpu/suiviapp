import { Stack } from 'expo-router';
import { NutritionSettingsScreen } from '@/features/settings/screens/nutrition-settings-screen';

/** Route wiring only (D10). */
export default function NutritionSettingsScreenRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Nutrition' }} />
      <NutritionSettingsScreen />
    </>
  );
}
