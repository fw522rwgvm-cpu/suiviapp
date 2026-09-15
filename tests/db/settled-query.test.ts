import { describe, expect, it } from 'vitest';
import { isSettleable } from '../../src/core/query/use-settled';

/**
 * The decision a form makes before freezing on a query's value.
 *
 * Reported from use: edit a food, save, reopen it — the form showed what it
 * said BEFORE the edit, and only a second visit was right.
 *
 * The hook itself does not run from Node. What is pinned here is the rule it
 * applies, which is the half that was wrong: a value the change bus has already
 * flagged must not be the one a form freezes on.
 */

describe('what a form may freeze on', () => {
  it('accepts a value nothing has flagged', () => {
    expect(isSettleable({ data: { name: 'Pain' }, isStale: false })).toBe(true);
  });

  it('REFUSES a value the bus has flagged as changed', () => {
    /**
     * THE BUG, IN ONE ASSERTION.
     *
     * With staleTime Infinity nothing goes stale on a timer, so `isStale` means
     * exactly "the bus reported a change to a table this query reads, and it
     * has not been re-read since". React Query hands the cached value over
     * first and refetches behind it; freezing on that first value is what made
     * the editor show yesterday's macros.
     */
    expect(isSettleable({ data: { name: 'Pain' }, isStale: true })).toBe(false);
  });

  it('refuses a read that has not answered', () => {
    // undefined is "not yet", and it has never been an answer.
    expect(isSettleable({ data: undefined, isStale: false })).toBe(false);
    expect(isSettleable({ data: undefined, isStale: true })).toBe(false);
  });

  it('ACCEPTS null, because "no such row" is a real answer', () => {
    /**
     * The distinction this project keeps paying for. A food that was deleted
     * reads as null, and an editor has to be able to tell that from a read
     * still in flight — folding the two together is what once left a screen on
     * loading dots for ever.
     */
    expect(isSettleable({ data: null, isStale: false })).toBe(true);
    expect(isSettleable({ data: null, isStale: true })).toBe(false);
  });

  it('follows the sequence a reopened editor actually goes through', () => {
    /**
     * The three renders that produced the report, in order:
     *
     *  1. remount — React Query serves the CACHED value, already flagged;
     *  2. the refetch lands with the current value, no longer flagged;
     *  3. anything after that is the same value again.
     *
     * Only the second may be frozen on, and it is the one the form used to
     * ignore.
     */
    const cached = { data: { kcal: 250 }, isStale: true };
    const refetched = { data: { kcal: 310 }, isStale: false };

    expect(isSettleable(cached)).toBe(false);
    expect(isSettleable(refetched)).toBe(true);
  });

  it('would fill from nothing if staleTime were finite — which is why it is not', () => {
    /**
     * A COUPLING WORTH STATING RATHER THAN DISCOVERING.
     *
     * This rule only works because the query client sets staleTime: Infinity,
     * so that `isStale` means "the bus spoke" and not "time passed". With a
     * finite staleTime every query would eventually be stale and no form would
     * ever fill.
     */
    const everythingStale = { data: { kcal: 250 }, isStale: true };

    expect(isSettleable(everythingStale)).toBe(false);
  });
});
