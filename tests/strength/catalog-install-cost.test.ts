import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultCatalogKeys,
  installDefaultCatalogOnce,
} from '../../src/features/strength/data/catalog-writes';
import { listExercises } from '../../src/features/strength/data/exercise-reads';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * What the first launch actually costs (D16).
 *
 * `useDefaultCatalogOnce` runs on the JS thread, after the first paint, and
 * writes five hundred and fifty-two exercises with their secondary muscles —
 * about eleven hundred statements in one transaction. D16 budgets 1.5 s for a
 * cold start to a readable figure, and this write is deliberately OUTSIDE that
 * budget because it happens after the Journal is on screen.
 *
 * ## THIS IS A RECORD, NOT A BUDGET, AND THE DIFFERENCE MATTERS
 *
 * better-sqlite3 on a laptop is not expo-sqlite on a phone, so the number here
 * cannot be a promise about the device. What it CAN do is notice a change of
 * ORDER: if somebody makes the install per-exercise-query again, or adds a read
 * inside the loop, this goes from milliseconds to seconds and the assertion
 * says so instead of the phone saying it.
 *
 * The bound is deliberately loose for the reason seed.test.ts had to learn the
 * hard way — a tight timing assertion under sixty-six parallel workers is a
 * test that fails at random, and a suite that goes red for no reason teaches
 * you to rerun instead of to read.
 */

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

describe('installing the default catalogue', () => {
  it('writes every default exercise in one pass', () => {
    const started = Date.now();
    const report = installDefaultCatalogOnce(fixture.db, 2.5, started);
    const elapsed = Date.now() - started;

    expect(report?.installed).toBe(defaultCatalogKeys().length);
    expect(listExercises(fixture.db)).toHaveLength(defaultCatalogKeys().length);

    // Loose on purpose — see the note above. It catches an order-of-magnitude
    // regression, never a slow machine.
    expect(elapsed).toBeLessThan(5_000);
    console.log(
      `      default catalogue: ${report?.installed} exercises in ${elapsed} ms (better-sqlite3)`,
    );
  });

  it('costs nothing at all on the second launch', () => {
    installDefaultCatalogOnce(fixture.db, 2.5, 1_789_600_000_000);

    const started = Date.now();
    const again = installDefaultCatalogOnce(fixture.db, 2.5, 1_789_600_000_001);
    const elapsed = Date.now() - started;

    // The flag is read and the function returns. Nothing is scanned, nothing is
    // compared — which is what makes it safe to call on every launch.
    expect(again).toBeNull();
    expect(elapsed).toBeLessThan(100);
  });
});
