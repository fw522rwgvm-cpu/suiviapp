import type { AppDatabase } from '@/core/db/database';
import { readCachedProduct, writeCachedProduct } from './off-cache';
import type { OffClient } from './off-client';
import type { OffProduct } from './off-product';

/**
 * Looking a barcode up: cache, then network, then the cache again as a fallback
 * (specs 8.5, D11).
 *
 * > Chain: scan -> search (personal, then cache, then Open Food Facts) ->
 * > quantity screen -> validation. Target: under 5 seconds.
 *
 * The personal database is consulted BEFORE this function is ever called — a
 * product already copied into `food` is a personal food, found by barcode, and
 * no request goes out at all. What is left here is the two remote-ish steps.
 *
 * ## WHY A FRESH CACHE HIT SKIPS THE NETWORK ENTIRELY
 *
 * D16 budgets the whole scan at five seconds and specs 8.5 calls the refresh
 * "opportunistic ... never blocking". A product fetched this month has not
 * changed in a way worth a network round trip in a shop, and the fallback for
 * a missing macro is a form the user fills in anyway.
 *
 * ## AND WHY A CACHED ANSWER BEATS EVERY FAILURE, notFound INCLUDED
 *
 * When the network fails, a stale product is returned rather than an error:
 * D11 asks for a "silent fallback to local with a discreet banner", and a
 * product cached five weeks ago beats nothing at all at the till.
 *
 * The same applies to `notFound`, which is less obvious. A barcode that this
 * phone has cached but Open Food Facts no longer serves has not stopped
 * existing — a contributor deleted or merged an entry. Letting the network
 * overrule the cache there would make a product the user has already scanned
 * suddenly unscannable, which is a worse answer than a slightly old one. The
 * cache is a fallback, never an authority on what exists; `notFound` is
 * authoritative only when there is nothing to fall back to.
 *
 * ## NOTHING HERE WRITES TO `food`
 *
 * The refresh rewrites the cache row and stops. A food copied into the
 * personal library is the user's, correctable, and never overwritten by a
 * later fetch (specs 8.5). That is structural: there is no code path from here
 * to that table.
 */

/** Why the answer is not as fresh as it could be. Drives the discreet banner. */
export type Degradation = 'offline' | 'throttled' | 'badResponse';

export type LookupResult =
  | {
      status: 'found';
      product: OffProduct;
      /** Where the answer actually came from, for the banner and for tests. */
      from: 'cache' | 'network';
      /**
       * Null when the answer is current. Set when the network was tried and
       * could not answer, so the screen can say why a figure may be old —
       * discreetly for 'offline', explicitly for a server-side 'throttled'.
       */
      degraded: Degradation | null;
    }
  | { status: 'notFound' }
  | {
      /** No answer anywhere: the network failed and the cache was empty. */
      status: 'unavailable';
      reason: Degradation;
      /** Set when the refusal came with a time, so the message can say when. */
      retryAtMs: number | null;
      /** True only when the SERVER refused — the one loud message of specs 8.5. */
      fromServer: boolean;
    };

export async function lookupProduct(
  db: AppDatabase,
  client: OffClient,
  barcode: string,
  now: number,
): Promise<LookupResult> {
  const cached = readCachedProduct(db, barcode, now);

  // Fresh enough: answer now, spend no request, stay inside the five seconds.
  if (cached !== null && !cached.stale) {
    return { status: 'found', product: cached.product, from: 'cache', degraded: null };
  }

  const outcome = await client.lookup(barcode);

  if (outcome.status === 'ok') {
    // Written before returning: the application can be killed at any moment
    // (specs 2.2), and a request already paid for should not have to be paid
    // for twice.
    writeCachedProduct(db, outcome.value, now);
    return { status: 'found', product: outcome.value, from: 'network', degraded: null };
  }

  if (outcome.status === 'notFound') {
    // Authoritative only with nothing to fall back on — see the header.
    return cached === null
      ? { status: 'notFound' }
      : { status: 'found', product: cached.product, from: 'cache', degraded: null };
  }

  const reason: Degradation =
    outcome.status === 'offline'
      ? 'offline'
      : outcome.status === 'throttled'
        ? 'throttled'
        : 'badResponse';

  if (cached !== null) {
    return { status: 'found', product: cached.product, from: 'cache', degraded: reason };
  }

  return {
    status: 'unavailable',
    reason,
    retryAtMs: outcome.status === 'throttled' ? outcome.retryAtMs : null,
    fromServer: outcome.status === 'throttled' && outcome.source === 'server',
  };
}
