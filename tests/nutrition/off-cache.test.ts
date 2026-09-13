import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_RETENTION_MS,
  CACHE_TTL_MS,
  readCachedProduct,
  sweepCache,
  writeCachedProduct,
} from '../../src/features/nutrition/off/off-cache';
import type { OffProduct } from '../../src/features/nutrition/off/off-product';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The Open Food Facts cache, against a real SQLite file (D15, fifth by value).
 *
 * The property that carries the most weight here is not that a cache caches.
 * It is that the cache NEVER TOUCHES `food` — which is the whole answer to
 * "what happens to a correction when the cache refreshes opportunistically",
 * and the kind of thing that is true by construction until someone helpfully
 * makes the refresh "keep the library up to date".
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

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('storing and reading back', () => {
  it('round-trips a product', () => {
    writeCachedProduct(database.db, NUTELLA, T0);

    const cached = readCachedProduct(database.db, NUTELLA.barcode, T0);
    expect(cached?.product).toEqual(NUTELLA);
    expect(cached?.fetchedAt).toBe(T0);
    expect(cached?.stale).toBe(false);
  });

  it('keeps an absent macro absent', () => {
    // The property the whole parser exists to protect, asserted one layer
    // further out: a cache that turned null into 0 on the way back would
    // resurrect the bug one binary upgrade later, and send a user down the
    // fast path with a number nobody declared.
    const incomplete: OffProduct = { ...NUTELLA, kcal100: null, brand: null };
    writeCachedProduct(database.db, incomplete, T0);

    expect(readCachedProduct(database.db, incomplete.barcode, T0)?.product).toEqual(
      incomplete,
    );
  });

  it('answers nothing for a barcode it has never seen', () => {
    expect(readCachedProduct(database.db, '0000000000000', T0)).toBeNull();
  });

  it('keys on the barcode asked for, one row per product', () => {
    writeCachedProduct(database.db, NUTELLA, T0);
    writeCachedProduct(database.db, { ...NUTELLA, name: 'Nutella (corrigé)' }, T0 + 1000);

    expect(countRows(database.raw, 'off_cache')).toBe(1);
    const cached = readCachedProduct(database.db, NUTELLA.barcode, T0 + 1000);
    expect(cached?.product.name).toBe('Nutella (corrigé)');
    expect(cached?.fetchedAt).toBe(T0 + 1000);
  });

  it('treats a row it can no longer read as absent, rather than throwing', () => {
    // A row written by an older binary under a shape that has since changed.
    // The cache is rebuildable, so drift is a miss and a refetch — never a
    // crash on the critical path, and never a half-built product.
    database.raw
      .prepare('INSERT INTO off_cache (barcode, payload, fetched_at) VALUES (?, ?, ?)')
      .run('123', '{"barcode":"123","nom":"ancienne forme"}', T0);

    expect(readCachedProduct(database.db, '123', T0)).toBeNull();
  });
});

describe('the thirty days of specs 8.5', () => {
  it('is fresh inside the window and stale outside it', () => {
    writeCachedProduct(database.db, NUTELLA, T0);

    expect(readCachedProduct(database.db, NUTELLA.barcode, T0 + CACHE_TTL_MS - 1)?.stale).toBe(
      false,
    );
    expect(readCachedProduct(database.db, NUTELLA.barcode, T0 + CACHE_TTL_MS)?.stale).toBe(
      true,
    );
  });

  it('STILL RETURNS a stale product rather than discarding it', () => {
    // The difference between a cache and an expiry, and it is specified: specs
    // 8.5 calls the refresh "opportunistic, never blocking" and D11 wants a
    // silent fallback to local when the network is absent. A product cached
    // thirty-one days ago beats nothing at all in a shop with no signal.
    writeCachedProduct(database.db, NUTELLA, T0);

    const cached = readCachedProduct(database.db, NUTELLA.barcode, T0 + CACHE_TTL_MS * 10);
    expect(cached?.product).toEqual(NUTELLA);
    expect(cached?.stale).toBe(true);
  });
});

describe('sweeping', () => {
  it('keeps a merely stale entry, and drops a long-dead one', () => {
    // Swept at twice the TTL rather than at the TTL: a stale entry still saves
    // an offline scan on day thirty-one, so deleting at exactly thirty days
    // would throw away the answer the fallback is for.
    writeCachedProduct(database.db, NUTELLA, T0);
    writeCachedProduct(database.db, { ...NUTELLA, barcode: '999' }, T0 - CACHE_RETENTION_MS);

    sweepCache(database.db, T0);

    expect(readCachedProduct(database.db, NUTELLA.barcode, T0)).not.toBeNull();
    expect(readCachedProduct(database.db, '999', T0)).toBeNull();
  });

  it('does nothing at all on an empty cache', () => {
    expect(() => sweepCache(database.db, T0)).not.toThrow();
    expect(countRows(database.raw, 'off_cache')).toBe(0);
  });
});

describe('the cache and the personal library are separate, permanently', () => {
  it('WRITES NOTHING TO food, which is the answer to the refresh question', () => {
    // A food copied from Open Food Facts is freely correctable (specs 8.5),
    // and the correction must survive the opportunistic refresh. It does,
    // because the refresh writes here and nothing here writes there — it is
    // structural rather than careful, and this is the assertion that keeps it
    // that way when someone later decides the refresh should "keep the library
    // up to date".
    database.raw
      .prepare(
        `INSERT INTO food (id, name, barcode, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('f1', 'Nutella corrigé', ?, 'off', 'g', 6.3, 57.5, 30.9, 539)`,
      )
      .run(NUTELLA.barcode);

    // A refresh arrives with different values, the way a crowd-edited database
    // does.
    writeCachedProduct(
      database.db,
      { ...NUTELLA, name: 'Nutella', protein100: 99 },
      T0 + CACHE_TTL_MS + 1,
    );

    const food = database.raw.prepare("SELECT * FROM food WHERE id = 'f1'").get() as Record<
      string,
      unknown
    >;
    expect(food['name']).toBe('Nutella corrigé');
    expect(food['protein_100']).toBe(6.3);
  });

  it('survives the food being deleted, and vice versa', () => {
    // No foreign key between them, deliberately: they are keyed differently —
    // a ULID against a barcode — and they answer different questions.
    database.raw
      .prepare(
        `INSERT INTO food (id, name, barcode, source, base_unit,
                           protein_100, carbs_100, fat_100, kcal_100)
         VALUES ('f1', 'Nutella', ?, 'off', 'g', 6.3, 57.5, 30.9, 539)`,
      )
      .run(NUTELLA.barcode);
    writeCachedProduct(database.db, NUTELLA, T0);

    database.raw.prepare("DELETE FROM food WHERE id = 'f1'").run();

    expect(readCachedProduct(database.db, NUTELLA.barcode, T0)).not.toBeNull();
  });
});
