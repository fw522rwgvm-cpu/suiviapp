import * as Notifications from 'expo-notifications';
import type {
  NotificationHost,
  NotificationPermission,
  PendingNotification,
} from '../domain/host';
import type { PlannedNotification } from '../domain/plan';

/**
 * THE ONLY MODULE IN THE PROJECT THAT IMPORTS expo-notifications.
 *
 * A convention test enforces it (tests/conventions/notifications-boundary), for
 * the reason the zod boundary is a test rather than a note: the cheapest wrong
 * move available is to reach for the package from a screen, and that would
 * scatter a NATIVE dependency across files the JS bundle happily builds and the
 * device cannot run.
 *
 * Everything above this file is exercised over Metro against the inert host,
 * on the binary already installed. Only this one needs a rebuild.
 *
 * ## WHAT WAS READ IN THE PACKAGE SOURCE RATHER THAN ASSUMED
 *
 * Four things, none of them in the documentation, all checked in
 * expo-notifications@57.0.18 itself:
 *
 * 1. THE CONFIG PLUGIN WRITES `aps-environment` INTO THE ENTITLEMENTS,
 *    unconditionally, as the first thing withNotificationsIOS does, with no
 *    option to decline. That is the APNs capability — which a free Apple
 *    account does not have and SideStore would strip, exactly the shape of the
 *    failure test B had with HealthKit. So the plugin is NOT declared in
 *    app.config.ts, and a test refuses to let it be added. This is a THIRD
 *    reason distinct from expo-camera's (declared, because its plugin writes an
 *    Info.plist key iOS kills the app without) and expo-sharing's (not
 *    declared, because its plugin adds an extension target that would cost a
 *    second identifier).
 *
 * 2. A LOCAL NOTIFICATION NEEDS NO ENTITLEMENT. registerForRemoteNotifications
 *    appears in exactly one file, PushTokenModule.swift, reached only from
 *    getDevicePushTokenAsync. The autolinked AppDelegate subscriber implements
 *    callbacks only and triggers nothing. Nothing here calls that function, so
 *    APNs is never touched.
 *
 * 3. THE PACKAGE RUNS AN AUTO-REGISTRATION EFFECT ON IMPORT
 *    (DevicePushTokenAutoRegistration.fx). It returns immediately when there is
 *    no stored registration info, and only setAutoServerRegistrationEnabledAsync
 *    arms it. Nothing here calls that either.
 *
 * 4. THE `DATE` TRIGGER IS NOT A DATE. DateTriggerRecord builds
 *    UNTimeIntervalNotificationTrigger from timeIntervalSinceNow — a delay in
 *    seconds frozen at scheduling time, which drifts across a daylight saving
 *    change and throws if the instant has passed. Only CALENDAR produces a real
 *    UNCalendarNotificationTrigger, matched on wall-clock components. That is
 *    why an Occurrence carries year/month/day/hour/minute and not just an
 *    instant: D3 at the native boundary.
 */

/**
 * How a notification behaves while the application is in the foreground.
 *
 * Without a handler iOS delivers it silently to a running app, which for the
 * summary means the one notification most likely to arrive while the phone is
 * in your hand is the one you never see. Set at module scope so it is in place
 * before anything can be delivered.
 *
 * No badge: the application has no unread count, and a number on the icon that
 * nothing clears is a defect that outlives the notification.
 */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

function toPermission(
  status: Notifications.PermissionStatus,
  canAskAgain: boolean,
): NotificationPermission {
  if (status === 'granted') return 'granted';
  // UNDETERMINED means never asked. A denial the user can still be asked about
  // is reported as undetermined too, so the screen offers the prompt rather
  // than a dead end — iOS decides whether the prompt actually appears.
  if (status === 'undetermined' || canAskAgain) return 'undetermined';
  return 'denied';
}

export const expoNotificationHost: NotificationHost = {
  async getPermission() {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return toPermission(status, canAskAgain);
  },

  async requestPermission() {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
      // Only what is used. Asking for something unused is how an application
      // gets refused, and the badge is not set by the handler above.
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return toPermission(status, canAskAgain);
  },

  async getPending(): Promise<PendingNotification[]> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map((item) => ({
      id: item.identifier,
      title: item.content.title ?? '',
      body: item.content.body ?? '',
    }));
  },

  async schedule(notification: PlannedNotification) {
    await Notifications.scheduleNotificationAsync({
      // OUR identifier, not one iOS mints. It is what makes applying a plan a
      // diff: the same occurrence is the same identifier on every run, so a
      // reschedule replaces instead of duplicating.
      identifier: notification.id,
      content: {
        title: notification.content.title,
        body: notification.content.body,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        year: notification.year,
        month: notification.month,
        day: notification.day,
        hour: notification.hour,
        minute: notification.minute,
        second: 0,
        // NEVER repeating. D14 asks for repeating triggers where possible, for
        // the 64 ceiling — but a repeating trigger is ONE pending entry, so
        // tomorrow's occurrence could not be cancelled without killing every
        // one after it, which is the conditional cancellation the same decision
        // requires. Four kinds over seven days is twenty-eight against
        // sixty-four, so the ceiling is not what is binding here.
        repeats: false,
      },
    });
  },

  async cancel(id: string) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
