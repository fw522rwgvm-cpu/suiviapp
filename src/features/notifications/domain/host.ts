import type { PlannedNotification } from './plan';

/**
 * The one door to iOS, declared here and implemented in native/ (D14).
 *
 * ## WHY THE INTERFACE EXISTS, AND IT IS NOT FOR TESTING
 *
 * expo-notifications is a NATIVE dependency. The JS bundle does not carry its
 * native module, so `npm run bundle:ios` stays green while the screen crashes
 * on the device — the consequence @react-native-picker/picker and expo-camera
 * both had, each costing a CI cycle to diagnose. Slice 5's rule: before adding
 * native, ask which screen mounts it first, and import it only at the last
 * step so one CI cycle is paid instead of several.
 *
 * This interface is what makes that possible. Everything above it — the plan,
 * the diff, the settings screen, the scheduling hook — is written and verified
 * over Metro against an inert host, on the binary already installed. Only the
 * final step swaps in the implementation that imports the package, and that is
 * the single moment a rebuild becomes necessary.
 *
 * A convention test keeps it that way: expo-notifications may be imported from
 * features/notifications/native and nowhere else.
 *
 * Testability comes along for free, and is worth being honest about: exercising
 * the scheduler against a fake host fixes the TAXONOMY of what we ask iOS, not
 * that iOS honours it — the same limit the Open Food Facts client has against
 * an injected fetch. iOS fires nothing in Node.
 */

/** What iOS says about permission. Narrower than the package's own enum. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/** One notification iOS currently holds pending, as the diff needs to see it. */
export interface PendingNotification {
  id: string;
  title: string;
  body: string;
}

export interface NotificationHost {
  /**
   * What the current permission is, WITHOUT asking for it.
   *
   * Separate from request() because specs 9.3 is explicit: authorisation is
   * asked for on activation in the Settings, never at first launch — "un refus
   * au démarrage est définitif" (D14). A hook that read the status on mount
   * would be fine; one that asked would burn the only chance there is.
   */
  getPermission(): Promise<NotificationPermission>;

  /** Shows the system prompt. Called from one place: the activation toggle. */
  requestPermission(): Promise<NotificationPermission>;

  getPending(): Promise<PendingNotification[]>;

  schedule(notification: PlannedNotification): Promise<void>;

  /**
   * A one-shot notification a fixed number of seconds from now.
   *
   * ## A COUNTDOWN IS A DELAY; A REMINDER IS A DATE. THEY ARE NOT THE SAME CALL
   *
   * Slice 9 read the package source and found that expo's `DATE` trigger is a
   * UNTimeIntervalNotificationTrigger built from timeIntervalSinceNow — a delay
   * in seconds frozen at scheduling time. That made it the WRONG tool for the
   * four daily kinds: a delay computed today drifts across a daylight saving
   * change and means the wrong wall-clock time by the end of a seven-day
   * horizon. Hence CALENDAR everywhere, matched on components, which is D3 at
   * the native boundary.
   *
   * The rest timer of specs 10.3 is the opposite case, and the same fact makes
   * a frozen delay exactly right: ninety seconds from now IS ninety seconds
   * from now, there is no civil date in the question at all, and nothing can
   * drift inside a window shorter than a set.
   *
   * A separate method rather than a flag on schedule(), so neither can be
   * reached by the other's caller: the planner has no business asking for a
   * delay, and a countdown has no components to state.
   */
  scheduleAfter(input: {
    id: string;
    title: string;
    body: string;
    seconds: number;
  }): Promise<void>;

  cancel(id: string): Promise<void>;
}

/**
 * The host used until the native one lands, and on any platform without it.
 *
 * Reports 'undetermined' and holds nothing. Everything above keeps working:
 * the settings are stored, the plan is computed, the diff is computed, and
 * applying it schedules nothing. Which is exactly what should happen when
 * there is nothing to schedule onto.
 */
export const inertNotificationHost: NotificationHost = {
  getPermission: () => Promise.resolve('undetermined'),
  requestPermission: () => Promise.resolve('undetermined'),
  getPending: () => Promise.resolve([]),
  schedule: () => Promise.resolve(),
  scheduleAfter: () => Promise.resolve(),
  cancel: () => Promise.resolve(),
};
