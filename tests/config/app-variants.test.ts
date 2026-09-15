import type { ExpoConfig } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The two application identifiers of D1 are the one thing in this project that
 * cannot be repaired after the fact: changing the daily identifier empties its
 * container without warning (specs 2.2), and making both variants share one
 * identifier would have the development build overwrite the real data.
 *
 * Nothing about that failure is visible on screen until the data is gone, which
 * is exactly the criterion of D15 for deserving a test.
 */

const BUNDLE_ID_PRODUCTION = 'com.billjackpot.suiviapp';
const BUNDLE_ID_DEV = 'com.billjackpot.suiviapp.dev';

async function loadConfig(variant: string | undefined): Promise<ExpoConfig> {
  vi.resetModules();
  if (variant === undefined) {
    delete process.env.APP_VARIANT;
  } else {
    process.env.APP_VARIANT = variant;
  }
  const loaded = (await import('../../app.config')) as { default: ExpoConfig };
  return loaded.default;
}

afterEach(() => {
  delete process.env.APP_VARIANT;
  delete process.env.BUILD_NUMBER;
});

describe('application variants', () => {
  it('gives the daily installation its own identifier', async () => {
    const config = await loadConfig('production');
    expect(config.ios?.bundleIdentifier).toBe(BUNDLE_ID_PRODUCTION);
    expect(config.name).toBe('Suivi');
  });

  it('gives the development installation a different one', async () => {
    const config = await loadConfig('dev');
    expect(config.ios?.bundleIdentifier).toBe(BUNDLE_ID_DEV);
    expect(config.name).toBe('Suivi dev');
  });

  it('never lets the two variants collide', async () => {
    const production = await loadConfig('production');
    const dev = await loadConfig('dev');
    expect(production.ios?.bundleIdentifier).not.toBe(dev.ios?.bundleIdentifier);
    expect(production.scheme).not.toBe(dev.scheme);
  });

  it('defaults to dev when the variable is missing', async () => {
    // Forgetting the variable must never target the container that holds
    // real data. A wrong dev build costs a CI cycle, a wrong production
    // build costs the container.
    const config = await loadConfig(undefined);
    expect(config.ios?.bundleIdentifier).toBe(BUNDLE_ID_DEV);
  });

  it('refuses an unknown variant instead of guessing', async () => {
    await expect(loadConfig('prod')).rejects.toThrow(/APP_VARIANT/);
  });

  it('exposes the file sharing keys the pre-migration backup depends on', async () => {
    // D2: the data folder must be reachable from the Files app, otherwise the
    // backup named by a G3 refusal cannot be retrieved.
    const config = await loadConfig('production');
    expect(config.ios?.infoPlist?.['UIFileSharingEnabled']).toBe(true);
    expect(config.ios?.infoPlist?.['LSSupportsOpeningDocumentsInPlace']).toBe(true);
  });

  /**
   * THE expo-notifications PLUGIN MUST NOT BE DECLARED, and this is the one
   * thing in slice 9 that could break the build chain rather than a feature.
   *
   * Read in the package source, not assumed: withNotificationsIOS writes
   * `aps-environment` into the entitlements as its FIRST action,
   * unconditionally, with no option to decline. That is the APNs capability — a
   * free Apple account does not have it, and SideStore strips what it cannot
   * sign. It is the exact shape of the failure test B had with HealthKit, which
   * is why D14 refused to bet on anything the signature could shave off.
   *
   * A LOCAL notification needs none of it: registerForRemoteNotifications lives
   * only in PushTokenModule, reached only from getDevicePushTokenAsync, which
   * nothing in this project calls. The native module autolinks through
   * expo-module.config.json, the way expo-sharing's does.
   *
   * So the plugin is absent for a THIRD reason, distinct from both precedents:
   * expo-camera is declared because its plugin writes an Info.plist key iOS
   * kills the app without; expo-sharing is absent because its plugin adds an
   * extension target that would cost a second identifier; this one is absent
   * because its plugin writes an entitlement the signing chain cannot honour.
   *
   * The tempting wrong move is one line — "the plugin is missing" — and its
   * consequence would appear a full CI cycle later, as a build or an install
   * that fails for reasons nothing connects to notifications.
   */
  it('strips the APNs entitlement expo-notifications adds on its own', async () => {
    const config = await loadConfig('production');
    const names = (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );

    // The removal plugin must be present, and LAST — it undoes something that
    // runs before it. Removing it is a one-line change whose consequence
    // appears a whole CI cycle later, as an installation iOS refuses for
    // reasons nothing connects to notifications.
    expect(names).toContain('./plugins/with-no-aps-environment');
    expect(names[names.length - 1]).toBe('./plugins/with-no-aps-environment');
  });

  it('declares no iOS entitlements of its own', async () => {
    // The broader property, asserted from the other side: this project ships
    // plain Info.plist keys and nothing that needs a capability. An entitlement
    // arriving here is a decision to take deliberately, against a signing chain
    // that has already refused one (test B, HealthKit).
    //
    // NOTE what this cannot see: a package's config plugin is auto-applied on
    // SDK 57, so it can add an entitlement without ever appearing in this
    // object. That is exactly how aps-environment arrived, and why the only
    // real check is the preflight — prebuild, then grep the generated
    // .entitlements. No test in Node can replace it.
    const config = await loadConfig('production');
    expect(config.ios?.entitlements).toBeUndefined();
  });
});
