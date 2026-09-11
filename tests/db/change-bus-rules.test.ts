import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCoalescer,
  isAffected,
  readDeclaredTables,
} from '../../src/core/db/change-bus-rules';
import { readsFrom } from '../../src/core/query/meta';
import { day, dayMeal, journalEntry, setting } from '../../src/core/db/schema';

/**
 * The rules of the change bus (D8).
 *
 * A bus that invalidates too little shows yesterday's figures and says
 * nothing; a bus that invalidates too much recomputes a dashboard dozens of
 * times during a live session. Neither is visible on screen as a fault, which
 * is the criterion of D15.
 */

describe('readDeclaredTables', () => {
  it('reads a declaration built from the schema objects', () => {
    // Table names come from the schema, not from hand-written strings, so a
    // rename cannot leave a declaration matching nothing.
    expect(readsFrom(day, dayMeal)).toEqual({ tables: ['day', 'day_meal'] });
    expect(readDeclaredTables(readsFrom(journalEntry))).toEqual(['journal_entry']);
  });

  it('refuses anything that is not a list of table names', () => {
    // meta arrives as unknown from React Query: validated, never asserted.
    expect(readDeclaredTables(undefined)).toBeNull();
    expect(readDeclaredTables(null)).toBeNull();
    expect(readDeclaredTables({})).toBeNull();
    expect(readDeclaredTables({ tables: 'day' })).toBeNull();
    expect(readDeclaredTables({ tables: ['day', 42] })).toBeNull();
  });
});

describe('isAffected', () => {
  it('matches a query against the tables that just changed', () => {
    const meta = readsFrom(day, dayMeal);
    expect(isAffected(meta, new Set(['day_meal']))).toBe(true);
    expect(isAffected(meta, new Set(['journal_entry']))).toBe(false);
    expect(isAffected(meta, new Set(['setting', 'day']))).toBe(true);
  });

  it('leaves an undeclared query alone rather than refetching everything', () => {
    expect(isAffected(undefined, new Set(['day']))).toBe(false);
  });

  it('does not confuse two tables sharing a prefix', () => {
    // 'day' and 'day_meal' would collide under any prefix matching scheme.
    expect(isAffected(readsFrom(day), new Set(['day_meal']))).toBe(false);
    expect(isAffected(readsFrom(dayMeal), new Set(['day']))).toBe(false);
    expect(isAffected(readsFrom(setting), new Set(['setting']))).toBe(true);
  });
});

describe('createCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns one transaction into a single flush', () => {
    // Logging a meal on a virtual day writes six rows: one day, four meals,
    // one entry. SQLite's update hook fires once per row. Without grouping,
    // every open screen would recompute six times over.
    const flushed: string[][] = [];
    const coalescer = createCoalescer(60, (tables) => flushed.push([...tables].sort()));

    coalescer.add('day');
    for (let index = 0; index < 4; index += 1) coalescer.add('day_meal');
    coalescer.add('journal_entry');

    expect(flushed).toHaveLength(0);
    vi.advanceTimersByTime(60);

    expect(flushed).toEqual([['day', 'day_meal', 'journal_entry']]);
  });

  it('waits for the burst to go quiet before flushing', () => {
    const flushed: string[][] = [];
    const coalescer = createCoalescer(60, (tables) => flushed.push([...tables]));

    coalescer.add('day');
    vi.advanceTimersByTime(50);
    coalescer.add('day');
    vi.advanceTimersByTime(50);
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(10);
    expect(flushed).toEqual([['day']]);
  });

  it('starts empty again after a flush', () => {
    const flushed: string[][] = [];
    const coalescer = createCoalescer(60, (tables) => flushed.push([...tables]));

    coalescer.add('day');
    vi.advanceTimersByTime(60);
    coalescer.add('journal_entry');
    vi.advanceTimersByTime(60);

    // The second flush must not carry the first one's tables along with it.
    expect(flushed).toEqual([['day'], ['journal_entry']]);
  });

  it('flushes nothing once cancelled', () => {
    const flushed: string[][] = [];
    const coalescer = createCoalescer(60, (tables) => flushed.push([...tables]));

    coalescer.add('day');
    coalescer.cancel();
    vi.advanceTimersByTime(1000);

    expect(flushed).toHaveLength(0);
  });
});
