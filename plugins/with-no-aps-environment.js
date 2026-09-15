const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Removes the APNs entitlement expo-notifications adds on its own.
 *
 * ## WHY THIS FILE EXISTS, AND WHY THE OBVIOUS ANSWER WAS WRONG
 *
 * Slice 9 planned NOT to declare the expo-notifications config plugin,
 * reasoning from the expo-sharing precedent recorded in slice 2: a package
 * plugin that is not listed in `plugins` does not run, while its native module
 * autolinks through expo-module.config.json.
 *
 * THAT PRECEDENT IS WRONG, and the preflight caught it. On SDK 57 a package's
 * config plugin IS auto-applied. `expo prebuild` with nothing declared produced
 * Suivi.entitlements carrying `aps-environment: development`. The reason
 * expo-sharing never added its share extension target is not that it was
 * unlisted — it is that withShareExtension does nothing unless
 * props.ios.enabled is passed, and it defaults to false. The effect was
 * attributed to the wrong cause, and acting on it here would have cost a CI
 * cycle and, most likely, an installation iOS refuses.
 *
 * ## WHY THE ENTITLEMENT MUST GO
 *
 * aps-environment is the push notification capability. This project signs with
 * a FREE Apple account through SideStore, which cannot carry it — the exact
 * shape of the failure test B had with HealthKit, and the reason D14 refused to
 * bet on anything the signature could shave off.
 *
 * And nothing here needs it. Read in the package source rather than assumed:
 * registerForRemoteNotifications appears only in PushTokenModule.swift, reached
 * only from getDevicePushTokenAsync, which this project never calls. The
 * autolinked AppDelegate subscriber implements callbacks and triggers nothing.
 * Local notifications go through UNUserNotificationCenter, which asks for
 * permission at runtime and no capability at build time.
 *
 * ## DELETING RATHER THAN OVERWRITING
 *
 * withNotificationsIOS writes the key only `if (!config.modResults[...])`, so
 * setting it to something else would merely choose the value. The key itself is
 * what must not be there, so this deletes it.
 *
 * Declared LAST in app.config.ts, so it runs after the plugin it undoes. The
 * ordering is verified by the preflight, not assumed:
 *
 *     APP_VARIANT=production npx expo prebuild --platform ios --clean --no-install
 *     grep -r aps-environment ios/        # must find nothing
 */
module.exports = function withNoApsEnvironment(config) {
  return withEntitlementsPlist(config, (inner) => {
    delete inner.modResults['aps-environment'];
    return inner;
  });
};
