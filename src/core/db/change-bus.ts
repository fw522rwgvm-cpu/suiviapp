import type { QueryClient } from '@tanstack/react-query';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { createCoalescer, isAffected } from './change-bus-rules';

/**
 * The change bus (D8).
 *
 * > A single subscription to table changes, written once, turns "table
 * > modified" into "query keys invalidated". No invalidation list is
 * > maintained by hand.
 *
 * The translation needs no lookup table at all, because the knowledge lives
 * where it is true: each query declares, next to its SQL, the tables it reads
 * (see core/query/meta.ts). The bus then invalidates by predicate. No write
 * site enumerates anything, which is precisely what a hand-written cache
 * invalidation gets wrong — forget one, and a screen quietly shows yesterday's
 * figures. In a tracking application, doubting the numbers means no longer
 * using it.
 *
 * Two consequences, accepted:
 *
 *  - SQLite's update hook fires while a transaction is still open, including
 *    one that will be rolled back. The bus can therefore invalidate over a
 *    write that never happened. The cost is a refetch for nothing; it is never
 *    a wrong figure, since the refetch reads the committed state.
 *  - The hook only fires when the connection was opened with
 *    enableChangeListener, which is why client.ts sets it.
 */

/**
 * Long enough to swallow the row-by-row burst of one transaction, short enough
 * to stay imperceptible: the budget from validation to an up-to-date Journal
 * is 300 ms (D16).
 */
export const CHANGE_GROUPING_MS = 60;

/**
 * Subscribes to database changes for the lifetime of the application.
 * Returns the unsubscribe function.
 */
export function startChangeBus(
  queryClient: QueryClient,
  delayMs: number = CHANGE_GROUPING_MS,
): () => void {
  const coalescer = createCoalescer(delayMs, (tables) => {
    void queryClient.invalidateQueries({
      predicate: (query) => isAffected(query.meta, tables),
    });
  });

  const subscription = addDatabaseChangeListener((event) => {
    coalescer.add(event.tableName);
  });

  return () => {
    subscription.remove();
    coalescer.cancel();
  };
}
