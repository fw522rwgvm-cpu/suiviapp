/**
 * Rules of the change bus (D8) — pure, importing nothing.
 *
 * Kept clear of expo-sqlite and of React Query on purpose, the way
 * version-rules.ts and backup-rules.ts are: the part that decides what gets
 * invalidated is testable in Node, and only the wiring needs a device.
 */

/**
 * Reads the tables a query declared it depends on.
 *
 * React Query types `meta` as an open record, so this arrives as unknown and
 * is validated rather than asserted (conventions, section 4). A query with no
 * declaration is never invalidated by the bus — silently showing stale figures
 * would be worse than a refetch, so declaring is mandatory in practice and the
 * absence of a declaration is a programming error the screens make obvious.
 */
export function readDeclaredTables(meta: unknown): readonly string[] | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const declared = (meta as Record<string, unknown>)['tables'];
  if (!Array.isArray(declared)) return null;
  return declared.every((table): table is string => typeof table === 'string')
    ? declared
    : null;
}

/** Does a query read any of the tables that just changed? */
export function isAffected(meta: unknown, changed: ReadonlySet<string>): boolean {
  const declared = readDeclaredTables(meta);
  if (declared === null) return false;
  return declared.some((table) => changed.has(table));
}

export interface Coalescer {
  add(table: string): void;
  cancel(): void;
}

/**
 * Groups a burst of row changes into one invalidation — the "light temporal
 * grouping" D8 asks for.
 *
 * SQLite's update hook fires once per row. Without grouping, logging a meal
 * that materialises a day would fire six times: one day, four meals, one
 * entry. Every open screen would recompute six times over, and slice 11 writes
 * a row per set during a live session.
 *
 * The delay restarts on each change, so a transaction is flushed once, after
 * it has gone quiet.
 */
export function createCoalescer(
  delayMs: number,
  flush: (tables: ReadonlySet<string>) => void,
): Coalescer {
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    add(table: string): void {
      pending.add(table);
      stop();
      timer = setTimeout(() => {
        timer = null;
        const batch = pending;
        pending = new Set<string>();
        flush(batch);
      }, delayMs);
    },
    cancel(): void {
      stop();
      pending = new Set<string>();
    },
  };
}
