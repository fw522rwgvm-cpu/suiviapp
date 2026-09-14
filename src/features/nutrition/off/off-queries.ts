import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getAppDatabase } from '@/core/db/app-database';
import { CACHE_TTL_MS, sweepCache } from './off-cache';
import { getOffClient } from './off-gateway';
import { lookupProduct, type LookupResult } from './off-lookup';
import type { OffOutcome } from './off-client';
import type { OffProduct } from './off-product';

/**
 * The Open Food Facts query layer (D8, D11).
 *
 * ## THE SEARCH FIRES ON SUBMIT, NEVER ON A KEYSTROKE
 *
 * > [v2.2] The remote search is EXPLICITLY TRIGGERED. Open Food Facts limits
 * > searches to ten per minute per IP address and explicitly prohibits
 * > search-as-you-type. (Specs 8.4b)
 *
 * Which is expressed here as a query key over the SUBMITTED term rather than
 * the typed one, with `enabled` gating it. The screen holds two pieces of
 * state — what is being typed, and what was last submitted — and only the
 * second reaches this file. There is no debounce anywhere, deliberately: a
 * debounce is a way of searching as you type slowly, and the prohibition is
 * not about frequency, it is about intent.
 *
 * ## REACT QUERY IS THE IN-MEMORY CACHE D11 ASKS FOR
 *
 * > Only barcode lookups are cached durably. TEXT SEARCHES ARE CACHED IN
 * > MEMORY ONLY.
 *
 * That is exactly what a query cache is, so there is no second cache to write:
 * submitting the same term twice in a session costs no request, and nothing
 * survives the application closing. Stated because the absence of an
 * `off_search_cache` table is a decision, not an omission.
 *
 * ## NO META, AND THAT IS THE POINT
 *
 * Every local query declares the tables it reads so the change bus can
 * invalidate it (D8). These declare nothing: their answers come from the
 * network, and no database write makes a remote search result wrong. The
 * lookup does touch `off_cache` on its way through — but invalidating on that
 * would mean a query re-running because of a row it wrote itself, which is a
 * loop, not an invalidation.
 */

export const offKeys = {
  search: (term: string) => ['off', 'search', term] as const,
  lookup: (barcode: string) => ['off', 'lookup', barcode] as const,
};

/**
 * How long a submitted search stays good without being asked again.
 *
 * Generous on purpose. The results of "crème" do not change in an afternoon,
 * and every avoided request is one left in a budget of ten per minute that the
 * user shares with nothing else.
 */
const SEARCH_FRESH_MS = 10 * 60_000;

/**
 * Remote results for a submitted term, or null while nothing was submitted.
 *
 * The whole outcome is returned rather than just the products, because the
 * screen has to tell apart an empty result set ("Open Food Facts has nothing
 * for this"), a network failure (a discreet banner, D11) and a server-side
 * throttle (the one explicit message of specs 8.5). Collapsing them into an
 * empty array would make all three look like the first.
 */
export function useOffSearch(submittedTerm: string | null) {
  return useQuery<OffOutcome<OffProduct[]>>({
    queryKey: offKeys.search(submittedTerm ?? ''),
    queryFn: () => getOffClient().search(submittedTerm ?? ''),
    enabled: submittedTerm !== null && submittedTerm.trim() !== '',
    staleTime: SEARCH_FRESH_MS,
    // A failed search is a VALUE here, never a rejection, so React Query's own
    // retry would be retrying a success. D11 allows exactly one retry and the
    // client already owns that decision — including the part where a timeout
    // does not get one.
    retry: false,
  });
}

/**
 * One product by barcode: personal cache, then network, then the cache as a
 * fallback (specs 8.5).
 *
 * `staleTime` matches the durable cache's own window, so React Query does not
 * re-ask within a session for something off_cache would answer anyway.
 */
export function useOffLookup(barcode: string | null) {
  return useQuery<LookupResult>({
    queryKey: offKeys.lookup(barcode ?? ''),
    queryFn: () =>
      lookupProduct(getAppDatabase(), getOffClient(), barcode ?? '', Date.now()),
    enabled: barcode !== null && barcode !== '',
    staleTime: CACHE_TTL_MS,
    retry: false,
  });
}

/**
 * Drops expired cache entries, once per launch (D11, specs 8.5).
 *
 * ## WHY IT HAD NO CALL SITE FOR THREE SLICES
 *
 * sweepCache has existed and been tested since slice 4, and nothing ever
 * called it: there is nothing to sweep on a phone that is not being used, and
 * running it while someone is scanning spends milliseconds that were promised
 * to the five-second target. Slice 4 predicted "probably at startup, after the
 * migration". This is that, with one correction.
 *
 * ## NOT IN prepareDatabase, AND THE REASON IS TWOFOLD
 *
 * That sequence is normative at five steps (D6, D7), and it runs inside the
 * 1.5 s cold-start budget D16 sets for a legible remaining figure. Adding a
 * DELETE to it would put a sixth step on the critical path to save nothing —
 * and core/db would have to import features/nutrition, which is the wrong way
 * round.
 *
 * An effect after the first paint costs the budget nothing, leaves the startup
 * sequence exactly as it is documented, and keeps the DELETE in the domain that
 * owns the table.
 *
 * ## ONCE PER LAUNCH, AND SAFE IF IT RUNS TWICE
 *
 * The ref is what makes it once: in development React mounts effects twice,
 * and this must not become a habit of sweeping on every remount. Not that it
 * would matter — the rows it removes are rebuildable by construction, which is
 * why it is safe to call whenever.
 *
 * It is deliberately not a mutation: nothing awaits it, nothing shows a
 * spinner for it, and nothing has to be told when it is done. The rows it
 * deletes are reported by SQLite like any others, so the bus invalidates
 * whatever declared reading off_cache — which is correct and, on a launch,
 * nothing.
 */
export function useSweepOffCacheOnce(): void {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    try {
      sweepCache(getAppDatabase(), Date.now());
    } catch {
      // Swallowed, exactly as the backup rotation of G1 swallows its own: a
      // failure to tidy up is never a reason for the application not to work.
    }
  }, []);
}
