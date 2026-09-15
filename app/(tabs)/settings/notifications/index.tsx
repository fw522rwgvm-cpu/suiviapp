import { Stack } from 'expo-router';
import { NotificationsScreen } from '@/features/notifications/screens/notifications-screen';

/**
 * Route wiring only (D10).
 *
 * A folder with an index rather than a leaf file, on the precedent
 * settings/templates set: the four kinds are pushed on top of this one, and a
 * leaf route pushes nothing.
 */
export default function NotificationsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <NotificationsScreen />
    </>
  );
}
