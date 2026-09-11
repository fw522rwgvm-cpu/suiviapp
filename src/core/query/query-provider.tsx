import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { startChangeBus } from '@/core/db/change-bus';

/**
 * The single query layer, local and network alike (D8).
 *
 * Defaults are set for an application whose data cannot change without it
 * running. There is no server, no other writer, no synchronisation: the only
 * source of change is this process, and the change bus reports every one of
 * them. So nothing ever goes stale on its own.
 *
 *  - staleTime Infinity: no refetch on a timer. Invalidation from the bus
 *    still refetches active queries, which is the only event that matters.
 *  - no refetch on focus or on reconnect: both exist to catch changes made
 *    elsewhere, and there is no elsewhere.
 *  - no retry: a failing SQL query fails again. The network client of slice 4
 *    carries its own policy, where retrying means something (D11).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = useMemo(createQueryClient, []);

  useEffect(() => startChangeBus(queryClient), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
