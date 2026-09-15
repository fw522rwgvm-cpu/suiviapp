import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS } from '@/features/notifications/domain/kinds';
import type { NotificationKind } from '@/features/notifications/domain/kinds';
import { NotificationDetailScreen } from '@/features/notifications/screens/notification-detail-screen';

/**
 * Route wiring only (D10).
 *
 * ## THE PARAMETER IS NARROWED HERE, AND THAT IS WIRING RATHER THAN LOGIC
 *
 * A route parameter is a string from outside: a deep link, a stale history
 * entry, a typo. NOTIFICATION_KINDS is the same constant the reads iterate over
 * and the export catalogue validates against, so checking against it is the one
 * check there is — and it hands the screen a value already narrowed, so nothing
 * downstream has to wonder.
 *
 * An unknown kind goes back rather than rendering an empty page, which would
 * be a screen with a title and nothing in it and no way to tell why.
 */
export default function NotificationKindRoute() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind: string }>();

  const known = (NOTIFICATION_KINDS as readonly string[]).includes(kind)
    ? (kind as NotificationKind)
    : null;

  useEffect(() => {
    // In an effect rather than during the render: navigating while rendering is
    // a side effect in the middle of a commit, and expo-router needs the
    // navigator mounted before it will listen.
    if (known === null) router.back();
  }, [known, router]);

  if (known === null) return null;

  return (
    <>
      <Stack.Screen options={{ title: NOTIFICATION_LABELS[known] }} />
      <NotificationDetailScreen kind={known} />
    </>
  );
}
