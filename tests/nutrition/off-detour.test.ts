import { describe, expect, it } from 'vitest';
import { detourFor } from '../../src/features/nutrition/off/off-detour';
import type { LookupResult } from '../../src/features/nutrition/off/off-lookup';
import type { OffProduct } from '../../src/features/nutrition/off/off-product';

/**
 * Where a scan lands when it cannot be resolved (specs 8.5, D11).
 *
 * The taxonomy is the whole of it: four ways a barcode fails to become a
 * product, and until now only one of them led anywhere. The others left the
 * user on the list holding a barcode that went nowhere — which looks, from the
 * outside, exactly like a scan that did not register.
 */

const BARCODE = '3017620422003';

function product(over: Partial<OffProduct> = {}): OffProduct {
  return {
    barcode: BARCODE,
    name: 'Pâte à tartiner',
    brand: 'Une marque',
    protein100: 6.3,
    carbs100: 57.5,
    fat100: 30.9,
    kcal100: 539,
    ...over,
  };
}

function found(p: OffProduct): LookupResult {
  return { status: 'found', product: p, from: 'network', degraded: null };
}

describe('a product that answers everything', () => {
  it('takes no detour: that is the five-second path', () => {
    expect(detourFor(found(product()), BARCODE)).toBeNull();
  });
});

describe('a product that answers partly', () => {
  it('detours, carrying what Open Food Facts did give', () => {
    const detour = detourFor(found(product({ fat100: null })), BARCODE);
    expect(detour?.reason).toBe('incomplete');
    expect(detour?.product.name).toBe('Pâte à tartiner');
    expect(detour?.product.protein100).toBe(6.3);
    // The hole stays a hole all the way to the form. Number(null) is 0, and a
    // product with no declared fat must not become a fat-free product.
    expect(detour?.product.fat100).toBeNull();
  });

  it('detours on a missing name too, which is not a macro', () => {
    expect(detourFor(found(product({ name: null })), BARCODE)?.reason).toBe('incomplete');
  });
});

describe('a barcode that resolves to nothing', () => {
  it('detours with the barcode and nothing else', () => {
    const detour = detourFor({ status: 'notFound' }, BARCODE);

    expect(detour?.reason).toBe('notFound');
    expect(detour?.product.barcode).toBe(BARCODE);
    expect(detour?.product.name).toBeNull();
    expect(detour?.product.kcal100).toBeNull();
  });
});

describe('a scan the network could not answer', () => {
  it.each(['offline', 'badResponse', 'throttled'] as const)(
    'detours on %s, rather than leaving the barcode nowhere',
    (reason) => {
      const detour = detourFor(
        { status: 'unavailable', reason, retryAtMs: null, fromServer: false },
        BARCODE,
      );

      expect(detour?.reason).toBe(reason);
      // The one thing certainly known, and the thing that makes the food
      // created here answer the NEXT scan.
      expect(detour?.product.barcode).toBe(BARCODE);
      expect(detour?.product.name).toBeNull();
    },
  );

  it('keeps the three reasons apart, so the form can say which', () => {
    // badResponse must never be phrased as offline: the server answered, so
    // the phone is demonstrably connected (D11, slice 4).
    const offline = detourFor(
      { status: 'unavailable', reason: 'offline', retryAtMs: null, fromServer: false },
      BARCODE,
    );
    const bad = detourFor(
      { status: 'unavailable', reason: 'badResponse', retryAtMs: null, fromServer: false },
      BARCODE,
    );
    expect(offline?.reason).not.toBe(bad?.reason);
  });
});

describe('nothing to decide on', () => {
  it('answers null while the lookup has not run', () => {
    expect(detourFor(undefined, BARCODE)).toBeNull();
  });

  it('answers null with no barcode, rather than inventing an empty one', () => {
    // An empty string is not a barcode: NULLs are distinct in a unique index
    // and empty strings are not, so one would take the slot and refuse every
    // later food that has none.
    expect(detourFor({ status: 'notFound' }, null)).toBeNull();
  });
});
