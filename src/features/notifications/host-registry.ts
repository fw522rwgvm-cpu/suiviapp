import { inertNotificationHost, type NotificationHost } from './domain/host';

/**
 * Which notification host the application is running against.
 *
 * The same shape core/db/app-database.ts has for the database: one module holds
 * the instance, everything else asks for it. Nothing here imports
 * expo-notifications — that import happens once, in native/, and app/_layout
 * hands the result in.
 *
 * ## THIS IS WHAT KEEPS THE CI CYCLE TO ONE
 *
 * expo-notifications is a NATIVE dependency, so the JS bundle does not carry
 * its native module: `npm run bundle:ios` stays green while the screen crashes
 * on the device. Both @react-native-picker/picker and expo-camera cost a cycle
 * to learn that. With the registry, every screen, every query and the whole
 * scheduler are written and exercised over Metro against the inert host on the
 * binary already installed, and only the final wiring line needs a rebuild.
 *
 * It starts inert rather than undefined, so nothing has to check: a host that
 * holds nothing and grants nothing is the truthful state of a build that cannot
 * schedule.
 */

let current: NotificationHost = inertNotificationHost;

export function setNotificationHost(host: NotificationHost): void {
  current = host;
}

export function getNotificationHost(): NotificationHost {
  return current;
}
