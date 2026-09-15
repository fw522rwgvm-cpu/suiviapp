import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate } from '../../src/core/date';
import { formatWeight } from '../../src/core/format';
import {
  canWeighOn,
  MIN_WEIGHT_KG,
  prefillValue,
  stepWeight,
  WEIGHT_STEP_KG,
  weightPrefill,
} from '../../src/features/weight/domain/weight-prefill';

const TODAY = toLocalDate('2026-03-01');

describe('what a date proposes', () => {
  it('proposes its own measurement when it has one', () => {
    const prefill = weightPrefill(78.4, { date: addDays(TODAY, -1), valueKg: 79 });

    expect(prefill).toEqual({ kind: 'measured', valueKg: 78.4 });
  });

  it('carries the last weighing forward when this date has none', () => {
    const prefill = weightPrefill(null, { date: addDays(TODAY, -1), valueKg: 78.4 });

    expect(prefill).toEqual({ kind: 'carried', valueKg: 78.4, from: addDays(TODAY, -1) });
  });

  it('carries one from WEEKS back, not only from yesterday', () => {
    /**
     * INTERPRETATION, FLAGGED. "La journée précédente" read literally is the
     * civil day before, which would leave the default empty on any date whose
     * eve was missed — on a history that deliberately has holes, most of them.
     *
     * The useful reading is the one specs 8.4's quantity chain already uses:
     * the last one there was, whenever it was.
     */
    const threeWeeksBack = addDays(TODAY, -21);
    const prefill = weightPrefill(null, { date: threeWeeksBack, valueKg: 80.2 });

    expect(prefill).toEqual({ kind: 'carried', valueKg: 80.2, from: threeWeeksBack });
  });

  it('keeps the DATE it came from, so the card can say so', () => {
    // A weight carried from three weeks ago is worth proposing and worth
    // labelling; the same figure with no date beside it is a claim.
    const prefill = weightPrefill(null, { date: addDays(TODAY, -21), valueKg: 80.2 });

    expect(prefill.kind === 'carried' && prefill.from).toBe(addDays(TODAY, -21));
  });

  it('proposes nothing when nothing was ever weighed before', () => {
    expect(weightPrefill(null, null)).toEqual({ kind: 'none' });
    expect(prefillValue(weightPrefill(null, null))).toBeNull();
  });

  it('never confuses a measurement with a carried figure', () => {
    /**
     * THE DISTINCTION THE THREE KINDS EXIST FOR.
     *
     * Both carry 78.4. One is a weight someone stood on a scale for; the other
     * is a proposal. A card drawing them alike would state a measurement nobody
     * made — plausible, wrong, invisible, which is the only kind of wrong this
     * project treats as serious.
     */
    const measured = weightPrefill(78.4, null);
    const carried = weightPrefill(null, { date: addDays(TODAY, -1), valueKg: 78.4 });

    expect(prefillValue(measured)).toBe(prefillValue(carried));
    expect(measured.kind).not.toBe(carried.kind);
  });
});

describe('one tap on the step buttons', () => {
  it('moves by exactly one tenth, up and down', () => {
    expect(stepWeight(78.4, 1)).toBe(78.5);
    expect(stepWeight(78.4, -1)).toBe(78.3);
  });

  it('survives binary floating point, which is the whole reason it rounds', () => {
    /**
     * 78.4 - 0.1 is 78.30000000000001. Stored as such it would be a weight with
     * fourteen decimals in the database, carried into the archive, and
     * DISPLAYED as 78,3 — so the figure on screen and the figure in the file
     * would stop being the same number after the very first tap.
     */
    expect(78.4 - WEIGHT_STEP_KG).not.toBe(78.3);
    expect(stepWeight(78.4, -1)).toBe(78.3);

    // And it stays exact over a run of taps, rather than drifting.
    let value = 78.4;
    for (let tap = 0; tap < 12; tap += 1) value = stepWeight(value, -1);
    expect(value).toBe(77.2);
  });

  it('keeps the stored figure identical to the displayed one', () => {
    // The property the rounding actually buys, asserted as such.
    for (const start of [78.4, 80, 66.6, 101.9]) {
      const stepped = stepWeight(start, -1);
      expect(formatWeight(stepped)).toBe(formatWeight(Math.round(stepped * 10) / 10));
      expect(stepped * 10).toBeCloseTo(Math.round(stepped * 10), 10);
    }
  });

  it('refuses to step below the smallest legal weight', () => {
    /**
     * ck_weight_value refuses anything at or below zero, and a CHECK violation
     * is a THROWN SQLite error, not a disabled button. Nobody will step down
     * from 0.1 kg — but "nobody will" is not a reason to leave a crash
     * reachable.
     */
    expect(stepWeight(MIN_WEIGHT_KG, -1)).toBe(MIN_WEIGHT_KG);
    expect(stepWeight(0.15, -1)).toBe(MIN_WEIGHT_KG);
    expect(stepWeight(MIN_WEIGHT_KG, -50)).toBeGreaterThan(0);
  });

  it('has no ceiling, for the reason the CHECK has none', () => {
    // Inventing a maximum is legislating on what a body may weigh.
    expect(stepWeight(400, 1)).toBe(400.1);
  });
});

describe('which dates may be weighed', () => {
  it('allows today and every date before it', () => {
    expect(canWeighOn(TODAY, TODAY)).toBe(true);
    expect(canWeighOn(addDays(TODAY, -1), TODAY)).toBe(true);
    expect(canWeighOn(addDays(TODAY, -400), TODAY)).toBe(true);
  });

  it('refuses tomorrow and beyond', () => {
    /**
     * A DIVERGENCE FROM SPECS 9.1, requested and recorded (specs 14.15). The
     * specs said "passée comme future, sans limite"; that sentence is amended
     * rather than quietly ignored.
     */
    expect(canWeighOn(addDays(TODAY, 1), TODAY)).toBe(false);
    expect(canWeighOn(addDays(TODAY, 400), TODAY)).toBe(false);
  });

  it('turns over with the cutoff, because `today` is a parameter', () => {
    // Before the cutoff hour, useToday still answers yesterday — so the day
    // that becomes weighable moves with it, rather than with the wall clock.
    const yesterday = addDays(TODAY, -1);

    expect(canWeighOn(TODAY, yesterday)).toBe(false);
    expect(canWeighOn(yesterday, yesterday)).toBe(true);
  });
});
