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
});
