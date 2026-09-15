import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { NotificationPermission } from '../domain/host';
import { getNotificationHost } from '../host-registry';

/**
 * What iOS currently says, and the one place that asks it to say more.
 *
 * ## READING IS NOT ASKING, AND THE DIFFERENCE IS THE WHOLE RULE
 *
 * Specs 9.3 and D14: authorisation is requested on activation in the Settings,
 * never at first launch, because "un refus au démarrage est définitif". So this
 * reads the status on mount — which shows nothing and costs nothing — and
 * `request` is called from exactly one place, the toggle.
 *
 * ## IT RE-READS ON EVERY FOREGROUND, AND THAT IS NOT DECORATION
 *
 * The permission can change while the application is not running: the user goes
 * to iOS Settings and grants what they refused. Without this, the banner saying
 * "iOS refuses notifications" would still be on the screen after they had
 * fixed it, which reads as the application not noticing — and the settings are
 * deliberately left ON through a refusal precisely so that granting it later
 * needs no further action here.
 */
export function useNotificationPermission(): {
  permission: NotificationPermission;
  request: () => Promise<NotificationPermission>;
} {
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');

  useEffect(() => {
    let alive = true;

    function read(): void {
      void getNotificationHost()
        .getPermission()
        .then((status) => {
          if (alive) setPermission(status);
        })
        .catch(() => {
          // A host that refuses to answer is reported as never asked, which is
          // the state in which the screen offers the prompt rather than a dead
          // end. iOS decides whether the prompt actually appears.
          if (alive) setPermission('undetermined');
        });
    }

    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const request = useCallback(async () => {
    // iOS shows the system prompt once per installation; asking again returns
    // the standing answer without showing anything, which is why this is safe
    // to call on every activation rather than only the first.
    const answer = await getNotificationHost().requestPermission();
    setPermission(answer);
    return answer;
  }, []);

  return { permission, request };
}
