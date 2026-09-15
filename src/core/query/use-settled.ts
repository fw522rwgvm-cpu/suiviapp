import { useState } from 'react';

/**
 * The first value of a query that is safe to fill a form from.
 *
 * ## THE BUG THIS ENDS, REPORTED FROM USE AND SHARED BY SIX SCREENS
 *
 * Edit a food, save, reopen it: the form shows what it said BEFORE the edit.
 * Leave and open it again and it is finally right.
 *
 * Three pieces, and no one of them is wrong on its own:
 *
 *  1. saving navigates back inside the mutation's onSuccess, so the screen is
 *     UNMOUNTED at once;
 *  2. the change bus groups for 60 ms (CHANGE_GROUPING_MS), so it invalidates
 *     AFTER that — on a query that is now inactive. React Query marks such a
 *     query stale and does not refetch it, there being nobody watching;
 *  3. on reopening, React Query hands over the CACHED value first and starts a
 *     refetch. The form freezes on that first value — "reapplying on every
 *     render would overwrite what is being typed" — and ignores the fresh one
 *     when it lands a moment later.
 *
 * So the screen shows the stale value, and the refetch quietly makes the cache
 * correct, which is why the second visit looks fine.
 *
 * ## IT IS NOT A DISPLAY BUG
 *
 * A form opened on a stale value and then SAVED writes that stale value back
 * over the current one. Change a food's name today, reopen it and correct its
 * brand, and its macros go back to what they were this morning. Nothing says
 * so, and the export carries the result.
 *
 * ## WHY isStale IS THE RIGHT QUESTION, AND WHAT IT DEPENDS ON
 *
 * The query client sets `staleTime: Infinity` — deliberately, because "there is
 * no server, no other writer, no synchronisation: the only source of change is
 * this process, and the change bus reports every one of them". Nothing goes
 * stale on a timer.
 *
 * So `isStale` here does not mean "old". It means EXACTLY "the bus has reported
 * a change to a table this query reads, and it has not been re-read since" —
 * which is precisely the question a form needs answered before it freezes.
 *
 * THAT COUPLING IS REAL AND WORTH STATING: with a finite staleTime everything
 * would be stale eventually and no form would ever fill. This hook belongs
 * beside the client that makes it true, which is why it lives in core/query.
 *
 * ## THE STATE IS ADJUSTED DURING THE RENDER, NOT IN AN EFFECT
 *
 * An effect runs after its render has been painted, so the form would show
 * nothing for a frame and then fill — the flicker this project removed from the
 * carousel and from the quantity wheels. Adjusting state during the render is
 * React's own answer to that, and the update is applied before anything reaches
 * the screen.
 *
 * ## WHAT IT DELIBERATELY DOES NOT DO
 *
 * It never changes its mind. Once a fresh value has been handed over, that is
 * the value for the life of the screen — otherwise a write made from this very
 * form would flow back in and overwrite what is being typed, which is the
 * behaviour the `loaded` flags were protecting in the first place.
 *
 * And it stays `undefined` if the refetch never lands. That is the same
 * outcome the screens already had when a read failed — `data` undefined, form
 * empty — so it adds no new failure, on a local synchronous database where the
 * alternative would be filling a form from a value known to be wrong.
 */
export function useSettled<T>(query: {
  data: T | undefined;
  isStale: boolean;
}): T | undefined {
  const [settled, setSettled] = useState<T | undefined>(undefined);

  if (settled === undefined && isSettleable(query)) {
    setSettled(query.data);
  }

  return settled;
}

/**
 * Whether a query result may be frozen on — the decision, as a pure function.
 *
 * Split out because the hook cannot run from Node and this can: what matters is
 * not that useState works but that a value the bus has flagged is refused, and
 * that a fresh one is not.
 *
 * `undefined` data is "not read yet" and is never settleable. `null` is a real
 * answer — "no such food" — and is, which is what lets an editor tell a missing
 * row from a pending read.
 */
export function isSettleable(query: { data: unknown; isStale: boolean }): boolean {
  return query.data !== undefined && !query.isStale;
}
