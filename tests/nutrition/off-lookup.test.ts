import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, writeCachedProduct } from '../../src/features/nutrition/off/off-cache';
import type { OffClient, OffOutcome } from '../../src/features/nutrition/off/off-client';
import { lookupProduct } from '../../src/features/nutrition/off/off-lookup';
import type { OffProduct } from '../../src/features/nutrition/off/off-product';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Cache, then network, then the cache again as a fallback (specs 8.5, D11).
 *
 * The interesting assertions here are all about which source wins, because
 * every one of them produces a screen that looks correct. A product shown from
 * a five-week-old cache and a product shown from the network are the same
 * screen; the difference only appears in whether a request went out, whether a
 * banner is shown, and — the one that would really hurt — whether a product
 * the user has already scanned stays scannable when a contributor deletes it
 * from Open Food Facts.
 */

const T0 = 1_789_000_000_000;

const NUTELLA: OffProduct = {
  barcode: '3017620422003',
  name: 'Nutella',
  brand: 'Nutella',
  protein100: 6.3,
  carbs100: 57.5,
  fat100: 30.9,
  kcal100: 539,
};

/** The same product as the network would send it back, slightly changed. */
const REFRESHED: OffProduct = { ...NUTELLA, protein100: 6.5 };

let database: TestDatabase;
let calls: string[];

beforeEach(() => {
  database = openTestDatabase();
  calls = [];
});

afterEach(() => {
  database.close();
});

function clientReturning(outcome: OffOutcome<OffProduct>): OffClient {
  return {
    async lookup(barcode: string) {
      calls.push(barcode);
      return outcome;
    },
    async search() {
      return { status: 'ok', value: [] };
    },
  };
}

describe('a fresh cache hit', () => {
  it('answers without spending a request', () => {
    // D16 budgets the whole scan at five seconds, and specs 8.5 calls the
    // refresh opportunistic rather than compulsory.
    writeCachedProduct(database.db, NUTELLA, T0);

    return lookupProduct(
      database.db,
      clientReturning({ status: 'ok', value: REFRESHED }),
      NUTELLA.barcode,
      T0 + CACHE_TTL_MS - 1,
    ).then((result) => {
      expect(result).toEqual({
        status: 'found',
        product: NUTELLA,
        from: 'cache',
        degraded: null,
      });
      expect(calls).toEqual([]);
    });
  });
});

describe('a stale cache hit', () => {
  it('refreshes from the network and stores what it got', async () => {
    writeCachedProduct(database.db, NUTELLA, T0);
    const now = T0 + CACHE_TTL_MS + 1;

    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'ok', value: REFRESHED }),
      NUTELLA.barcode,
      now,
    );

    expect(result).toEqual({
      status: 'found',
      product: REFRESHED,
      from: 'network',
      degraded: null,
    });
    expect(calls).toEqual([NUTELLA.barcode]);

    // Stored before returning: the application can be killed at any moment,
    // and a request already paid for should not be paid for twice.
    const again = await lookupProduct(
      database.db,
      clientReturning({ status: 'offline' }),
      NUTELLA.barcode,
      now,
    );
    expect(again.status).toBe('found');
    if (again.status !== 'found') return;
    expect(again.product).toEqual(REFRESHED);
  });

  it('falls back to the stale product when the network is gone', async () => {
    // D11: "silent fallback to local with a discreet banner". A product cached
    // five weeks ago beats nothing at all at the till.
    writeCachedProduct(database.db, NUTELLA, T0);

    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'offline' }),
      NUTELLA.barcode,
      T0 + CACHE_TTL_MS * 2,
    );

    expect(result).toEqual({
      status: 'found',
      product: NUTELLA,
      from: 'cache',
      // Carried so the screen can say why a figure may be old.
      degraded: 'offline',
    });
  });

  it('distinguishes a bad response from being offline, all the way out', async () => {
    // The server answered with rubbish, so the phone is online. A banner
    // saying otherwise would be a lie the user cannot check — and this is the
    // last place the distinction could still be lost.
    writeCachedProduct(database.db, NUTELLA, T0);

    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'badResponse' }),
      NUTELLA.barcode,
      T0 + CACHE_TTL_MS * 2,
    );

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.degraded).toBe('badResponse');
  });
});

describe('when Open Food Facts says the barcode is unknown', () => {
  it('reports it as not found when there is nothing cached', async () => {
    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'notFound' }),
      '0000000000017',
      T0,
    );

    // Which is what offers to create a personal food, pre-filled (specs 8.5).
    expect(result).toEqual({ status: 'notFound' });
  });

  it('KEEPS the cached product when there is one', async () => {
    // The non-obvious one. A barcode this phone has cached but Open Food Facts
    // no longer serves has not stopped existing — a contributor deleted or
    // merged the entry. Letting the network overrule the cache would make a
    // product the user has already scanned suddenly unscannable, which is a
    // worse answer than a slightly old one.
    writeCachedProduct(database.db, NUTELLA, T0);

    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'notFound' }),
      NUTELLA.barcode,
      T0 + CACHE_TTL_MS * 3,
    );

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.product).toEqual(NUTELLA);
  });
});

describe('when there is nothing anywhere', () => {
  it('reports being offline, with nothing to show', async () => {
    const result = await lookupProduct(
      database.db,
      clientReturning({ status: 'offline' }),
      '123',
      T0,
    );

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'offline',
      retryAtMs: null,
      fromServer: false,
    });
  });

  it('carries the time and the SOURCE of a throttle', async () => {
    // specs 8.5 reserves the one loud message in the application for an
    // overrun reported by the SERVER. Our own preventive window is a different
    // fact and must stay discreet, so the distinction survives this far.
    const server = await lookupProduct(
      database.db,
      clientReturning({ status: 'throttled', retryAtMs: T0 + 300_000, source: 'server' }),
      '123',
      T0,
    );
    expect(server).toEqual({
      status: 'unavailable',
      reason: 'throttled',
      retryAtMs: T0 + 300_000,
      fromServer: true,
    });

    const window = await lookupProduct(
      database.db,
      clientReturning({ status: 'throttled', retryAtMs: T0 + 4_000, source: 'window' }),
      '123',
      T0,
    );
    expect(window.status).toBe('unavailable');
    if (window.status !== 'unavailable') return;
    expect(window.fromServer).toBe(false);
  });
});

describe('the personal library is never touched', () => {
  it('writes nothing to food, whatever the network says', async () => {
    // The structural half of "a correction is never overwritten": there is no
    // code path from this function to that table. Asserted because the
    // tempting change — "the refresh should keep the library up to date" —
    // would be one line and would silently undo specs 8.5.
    database.raw
      .prepare(
        `INSERT INTO food (id, name, barcode, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('f1', 'Nutella corrigé', ?, 'off', 'g', 6.3, 57.5, 30.9, 539)`,
      )
      .run(NUTELLA.barcode);

    await lookupProduct(
      database.db,
      clientReturning({ status: 'ok', value: { ...REFRESHED, name: 'Nutella' } }),
      NUTELLA.barcode,
      T0,
    );

    const food = database.raw.prepare("SELECT * FROM food WHERE id = 'f1'").get() as Record<
      string,
      unknown
    >;
    expect(food['name']).toBe('Nutella corrigé');
    expect(food['protein_100']).toBe(6.3);
  });
});
