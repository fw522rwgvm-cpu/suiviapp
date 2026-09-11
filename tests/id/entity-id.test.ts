import { isValid } from 'ulid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, type EntityId } from '../../src/core/id';

/**
 * Identifier generation (D4).
 *
 * Two failures here are invisible on screen and therefore deserve a test by
 * the criterion of D15: identifiers that collide, and identifiers that stop
 * sorting by creation date. Both produce a plausible result and a wrong one.
 *
 * The third test is the important one. It pins down a device behaviour that no
 * amount of running the suite in Node would otherwise surface.
 */

type ProbeId = EntityId<'probe'>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('newId', () => {
  it('mints valid ULIDs', () => {
    const id = newId<ProbeId>();
    expect(id).toHaveLength(26);
    expect(isValid(id)).toBe(true);
  });

  it('never collides and never stops increasing, even within one millisecond', () => {
    // A tight loop of a thousand lands many identifiers in the same
    // millisecond, which is exactly the case the monotonic factory exists for:
    // it increments the random field rather than drawing a new one.
    const ids = Array.from({ length: 1000 }, () => newId<ProbeId>());

    expect(new Set(ids).size).toBe(ids.length);

    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('generates without any global crypto, as on the device', async () => {
    // ulid looks for crypto.getRandomValues on the global object and throws
    // when it finds nothing. Node has it; Hermes does not, and neither React
    // Native 0.86 nor the Expo winter polyfills add it. Without the PRNG this
    // module injects, the first entry logged on the iPhone would throw while
    // every test here kept passing.
    vi.stubGlobal('crypto', undefined);
    vi.resetModules();

    const freshModule = await import('../../src/core/id');

    expect(() => freshModule.newId<ProbeId>()).not.toThrow();
    expect(isValid(freshModule.newId<ProbeId>())).toBe(true);
  });
});
