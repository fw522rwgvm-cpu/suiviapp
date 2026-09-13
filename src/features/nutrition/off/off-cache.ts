import { eq, lte } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { offCache } from '@/core/db/schema';
import { parseCachedProduct, serialiseProduct } from './off-parse';
import type { OffProduct } from './off-product';

/**
 * Reading and writing the Open Food Facts cache (schema 2.4, D11).
 *
 * > Only barcode lookups are cached durably, for 30 days, refreshed
 * > opportunistically. Text searches are cached in memory only.
 *
 * Takes its database as an argument like every access function since slice 1,
 * so the whole of it runs in Node against a real SQLite file (D15). No native
 * import, no clock of its own: `now` is passed in, which is what makes a
 * thirty-day expiry testable in a millisecond.
 *
 * ## WHAT THIS CACHE IS ACTUALLY FOR, WHICH IS NARROWER THAN IT LOOKS
 *
 * Specs 8.5 copies every logged product into `food`, and the deduplication by
 * barcode then means the search stops consulting the cache for it entirely.
 * So the cache does not serve the habitual product at all — the personal copy
 * does, faster and correctable.
 *
 * What is left is real and worth having: the product scanned and then
 * ABANDONED rather than confirmed, and the second scan of the same item before
 * the basket is committed. Stating the scope keeps anyone from over-investing
 * here later.
 */

/** Specs 8.5, resolved in specs 13.2: thirty days. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedProduct {
  product: OffProduct;
  fetchedAt: number;
  /** Past its 30 days. Still usable — see readCachedProduct. */
  stale: boolean;
}

/**
 * Reads a product out of the cache.
 *
 * A STALE ENTRY IS RETURNED RATHER THAN DISCARDED, with its age attached. That
 * is the difference between a cache and an expiry: specs 8.5 calls the refresh
 * "opportunistic, never blocking", and D11 wants a "silent fallback to local"
 * when the network is absent. A product cached thirty-one days ago is far
 * better than nothing in a shop with no signal, and the caller decides — it
 * refreshes when it can and shows what it has when it cannot.
 *
 * An entry that no longer parses is reported as ABSENT rather than as an
 * error. The stored shape belongs to the binary that wrote it, and a binary
 * upgrade may have moved it; the cache is rebuildable, which is its whole
 * licence. Treating drift as a miss costs one request and cannot fail.
 */
export function readCachedProduct(
  db: AppDatabase,
  barcode: string,
  now: number,
): CachedProduct | null {
  const rows = db.select().from(offCache).where(eq(offCache.barcode, barcode)).all();
  const row = rows[0];
  if (row === undefined) return null;

  const product = parseCachedProduct(row.payload);
  if (product === null) return null;

  return {
    product,
    fetchedAt: row.fetchedAt,
    stale: now - row.fetchedAt >= CACHE_TTL_MS,
  };
}

/**
 * Stores a product, replacing whatever was there.
 *
 * ONLY PRODUCTS THAT WERE FOUND reach here. Caching a "no such barcode" for
 * thirty days would hide a product added to Open Food Facts in the meantime,
 * and the cost of not caching it is one request, capped by the rate limiter.
 *
 * Keyed on the barcode AS ASKED FOR, carried on the product itself: the API
 * normalises what it is given — a lookup for 0000000000017 answers with code
 * "00000017" — so keying on the echo would file rows under a code the scanner
 * never produces.
 *
 * THIS NEVER TOUCHES `food`, and that is the whole answer to what becomes of a
 * correction when the cache refreshes: nothing. Specs 8.5 puts the refresh
 * under "Open Food Facts" and the free correctability of a copied food under
 * "Base personnelle", and the two never meet.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one.
 */
export function writeCachedProduct(
  db: AppDatabase,
  product: OffProduct,
  now: number,
): void {
  db.insert(offCache)
    .values({
      barcode: product.barcode,
      payload: serialiseProduct(product),
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: offCache.barcode,
      set: { payload: serialiseProduct(product), fetchedAt: now },
    })
    .run();
}

/**
 * Drops entries older than the retention window.
 *
 * Not called on the critical path, and not on a timer either: there is nothing
 * to sweep on a phone that is not being used, and an expiry that runs while
 * someone is scanning spends milliseconds they were promised. It exists so the
 * table cannot grow without bound over years, and it is safe to call whenever
 * — the rows it removes are, by construction, rebuildable.
 *
 * Uses a window twice the TTL rather than the TTL itself: a stale entry is
 * still served when the network is absent (see readCachedProduct), so deleting
 * at exactly thirty days would throw away the answer that saves an offline
 * scan on day thirty-one.
 */
export const CACHE_RETENTION_MS = CACHE_TTL_MS * 2;

export function sweepCache(db: AppDatabase, now: number): void {
  // `lte`, matching the `>=` that decides staleness: one boundary rule for
  // the whole module, rather than two off-by-one arguments to have twice.
  db.delete(offCache).where(lte(offCache.fetchedAt, now - CACHE_RETENTION_MS)).run();
}
