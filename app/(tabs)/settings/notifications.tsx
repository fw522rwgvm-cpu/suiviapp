import { Stack } from 'expo-router';
import { NotificationsScreen } from '@/features/notifications/screens/notifications-screen';

/**
 * Route wiring only (D10).
 *
 * Pushed inside the Settings stack, beside the templates, the planning and the
 * weight goal. Specs 12 puts "Activation et heure des quatre notifications"
 * there, and specs 9.3 attaches the authorisation prompt to activation in the
 * Settings — so this screen is the only place the prompt can come from.
 */
export default function NotificationsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <NotificationsScreen />
    </>
  );
}
