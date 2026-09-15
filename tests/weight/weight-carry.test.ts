import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import {
  readLastWeightBefore,
  readWeightPrefill,
} from '../../src/features/weight/data/weight-reads';
import { setWeight } from '../../src/features/weight/data/weight-writes';
import {
  prefillValue,
  stepWeight,
  weightPrefill,
} from '../../src/features/weight/domain/weight-prefill';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Carrying the previous weighing forward (specs 9.1, amended — specs 14.15).
 *
 * > Par défaut la valeur du poids du jour doit être la même que celle de la
 * > journée précédente.
 */

const TODAY = toLocalDate('2026-03-01');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('the last weighing before a date', () => {
  it('is null on an empty database', () => {
    expect(readLastWeightBefore(database.db, TODAY)).toBeNull();
  });

  it('is the nearest one behind, not the oldest', () => {
    setWeight(database.db, addDays(TODAY, -30), 82);
    setWeight(database.db, addDays(TODAY, -3), 79.4);
    setWeight(database.db, addDays(TODAY, -10), 80.1);

    expect(readLastWeightBefore(database.db, TODAY)).toEqual({
      date: addDays(TODAY, -3),
      valueKg: 79.4,
    });
  });

  it('is STRICTLY before, never the date itself', () => {
    /**
     * `<` and not `<=`. A date that has its own measurement is not carrying
     * anything, and including it would collapse weightPrefill's two cases into
     * one — the card would then have no way to say whether the figure it shows
     * was measured or proposed.
     */
    setWeight(database.db, TODAY, 78);
    setWeight(database.db, addDays(TODAY, -1), 79);

    expect(readLastWeightBefore(database.db, TODAY)?.valueKg).toBe(79);
  });

  it('never looks FORWARD, even though later measurements exist', () => {
    /**
     * Specs 9.1 allows weighing on any past date, so a database routinely holds
     * measurements AFTER the date being looked at — correcting last Tuesday
     * from today's Journal is ordinary. Carrying one backwards would propose a
     * later weight as an earlier day's default, which is the opposite of what a
     * default is for.
     */
    const tuesday = addDays(TODAY, -6);
    setWeight(database.db, addDays(tuesday, -2), 81);
    setWeight(database.db, TODAY, 78);

    expect(readLastWeightBefore(database.db, tuesday)?.valueKg).toBe(81);
  });

  it('reaches back weeks when that is the nearest there is', () => {
    setWeight(database.db, addDays(TODAY, -21), 80.2);

    expect(readLastWeightBefore(database.db, TODAY)).toEqual({
      date: addDays(TODAY, -21),
      valueKg: 80.2,
    });
  });
});

describe('what a date proposes, read from a real database', () => {
  it('proposes its own measurement, marked as measured', () => {
    setWeight(database.db, addDays(TODAY, -1), 79);
    setWeight(database.db, TODAY, 78.4);

    expect(readWeightPrefill(database.db, TODAY)).toEqual({
      kind: 'measured',
      valueKg: 78.4,
    });
  });

  it('carries the previous one, marked as carried and dated', () => {
    setWeight(database.db, addDays(TODAY, -1), 79);

    expect(readWeightPrefill(database.db, TODAY)).toEqual({
      kind: 'carried',
      valueKg: 79,
      from: addDays(TODAY, -1),
    });
  });

  it('proposes nothing before the first weighing ever', () => {
    setWeight(database.db, TODAY, 78.4);

    expect(readWeightPrefill(database.db, addDays(TODAY, -1))).toEqual({ kind: 'none' });
  });

  it('agrees with the pure function it is built from', () => {
    // The read joins two queries; the decision is weightPrefill's alone. Pinned
    // so the read can never grow a rule of its own.
    setWeight(database.db, addDays(TODAY, -2), 80.5);

    const fromDatabase = readWeightPrefill(database.db, TODAY);
    const fromPure = weightPrefill(null, { date: addDays(TODAY, -2), valueKg: 80.5 });

    expect(fromDatabase).toEqual(fromPure);
  });
});

describe('the figure shown IS the figure a step writes', () => {
  it('holds from a measured date', () => {
    /**
     * THE PROPERTY SLICE 4 PAID FOR ONCE ALREADY.
     *
     * The card shows `prefillValue`, the "+" writes `stepWeight` of the same
     * value, and the window opens on it. Two paths to "the current figure"
     * would agree almost always — and the day they diverged, the row would lie
     * about what its own button does, both numbers being plausible.
     *
     * Asserted against the functions, never against a literal.
     */
    setWeight(database.db, TODAY, 78.4);

    const shown = prefillValue(readWeightPrefill(database.db, TODAY));
    expect(shown).not.toBeNull();
    if (shown === null) return;

    setWeight(database.db, TODAY, stepWeight(shown, 1));

    expect(prefillValue(readWeightPrefill(database.db, TODAY))).toBe(stepWeight(shown, 1));
  });

  it('holds from a CARRIED date — the first tap writes the proposal, stepped', () => {
    /**
     * The case that decides. Yesterday says 78,4 and today says nothing; one tap
     * on "−" must store 78,3 and not 78,4, nor an empty measurement, nor
     * nothing at all.
     */
    setWeight(database.db, addDays(TODAY, -1), 78.4);

    const shown = prefillValue(readWeightPrefill(database.db, TODAY));
    expect(shown).toBe(78.4);
    if (shown === null) return;

    setWeight(database.db, TODAY, stepWeight(shown, -1));

    const after = readWeightPrefill(database.db, TODAY);
    expect(after).toEqual({ kind: 'measured', valueKg: 78.3 });
    // And yesterday is untouched: a step writes the date it was tapped on.
    expect(prefillValue(readWeightPrefill(database.db, addDays(TODAY, -1)))).toBe(78.4);
  });

  it('turns a carried figure into a measurement, once', () => {
    // Before: a proposal. After one tap: a measurement, so the card stops
    // drawing it muted and the window stops calling it a reprise.
    setWeight(database.db, addDays(TODAY, -1), 78.4);
    expect(readWeightPrefill(database.db, TODAY).kind).toBe('carried');

    setWeight(database.db, TODAY, stepWeight(78.4, 1));
    expect(readWeightPrefill(database.db, TODAY).kind).toBe('measured');
  });

  it('stores exactly what a run of taps displays', () => {
    // Twelve taps down from 78,4 is 77,2 — not 77.19999999999999, which would
    // export into the archive as a weight with fourteen decimals while showing
    // as 77,2 on screen.
    setWeight(database.db, TODAY, 78.4);

    let value = 78.4;
    for (let tap = 0; tap < 12; tap += 1) {
      value = stepWeight(value, -1);
      setWeight(database.db, TODAY, value);
    }

    const stored = database.raw
      .prepare('SELECT value_kg AS v FROM weight_measure WHERE date = ?')
      .get(TODAY);

    expect(stored).toEqual({ v: 77.2 });
  });
});
