import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The Open Food Facts cache (schema 2.4, D11, slice 4).
 *
 * > Cache. A dedicated table in the same database — same transaction, same
 * > backup, same migration — but EXCLUDED FROM THE EXPORT. Only barcode
 * > lookups are cached durably, for 30 days, refreshed opportunistically. Text
 * > searches are cached in memory only.
 *
 * ## IT IS NOT EXPORTED, AND IT IS NOT A TABLE OF RECORD
 *
 * The exclusion was declared in slice 2, with its reason, before this table
 * existed (see features/backup/domain/table-catalog.ts). It holds because the
 * contents are entirely rebuildable from the network: specs 5.4 says so in as
 * many words. Two consequences nobody writes down, so they are written here:
 * after an import the cache is EMPTY, and a product that was findable offline
 * yesterday is not findable today. Harmless, and surprising if unexpected.
 *
 * ## WHAT THE REFRESH MAY AND MAY NOT TOUCH
 *
 * The opportunistic refresh rewrites `payload` HERE. It never writes to
 * `food`. That is the whole answer to "what happens to a correction when the
 * cache refreshes": nothing, because nothing writes to a personal food after
 * the copy except the user. Specs 8.5 places the refresh under "Open Food
 * Facts" and the free correctability of a copied food under "Base personnelle",
 * and the two rubrics never meet. It is structural rather than careful.
 *
 * Corollary that resizes this table: once a product is copied into `food`, the
 * copy is authoritative forever, and the deduplication of specs 8.5 means the
 * search no longer even consults the cache for it. What is left for the cache
 * is the product scanned and then ABANDONED, and the latency of a second scan
 * before confirming. Real, useful, and much narrower than it looks.
 */
export const offCache = sqliteTable('off_cache', {
  /**
   * The barcode AS ASKED FOR, not as Open Food Facts echoed it back.
   *
   * Observed on 13/09/2026: the API normalises what it is given, and a lookup
   * for 0000000000017 answers with code "00000017". Keying on the echo would
   * store rows under a code the scanner never produces, and the cache would
   * never hit. So the key is the question, not the answer.
   */
  barcode: text('barcode').primaryKey(),
  /**
   * OUR normalised shape, serialised — never the raw response (schema 2.4:
   * "normalised response, restricted fields").
   *
   * Two reasons, and the second was found by probing the API rather than by
   * reading about it:
   *
   *  - the raw response is large, and D11 requires each request to restrict
   *    the fields it asks for;
   *  - Open Food Facts returns `nutriments_estimated` WHETHER OR NOT it was
   *    asked for, a sizeable block of values estimated from the ingredient
   *    list. Storing the raw response would carry that block into our own
   *    database, where a later reader could mistake it for declared data. It
   *    is exactly the "plausible but wrong" D15 exists to guard against.
   *
   * Consequence, accepted: a change to the normalised shape makes existing
   * rows unreadable. That is why the reader validates on the way OUT as well
   * as on the way in — this column survives a binary upgrade, so it is a
   * boundary in time — and an unreadable row is treated as absent. The cache
   * is rebuildable; that is its whole licence.
   *
   * Only products that were FOUND are stored. Caching a "no such product" for
   * thirty days would hide a product added to Open Food Facts in between, and
   * the cost of not caching it is one request, capped by the rate limiter.
   */
  payload: text('payload').notNull(),
  /** Epoch ms (D3). The 30-day validity of specs 8.5 is measured from here. */
  fetchedAt: integer('fetched_at').notNull(),
});

export type OffCacheRow = typeof offCache.$inferSelect;
