import { describe, expect, it } from 'vitest';
import { formatQuantity, formatRate, formatWeight } from '../../src/core/format';

/**
 * Display of a weight and of a rate (specs 6.2, 9.2).
 *
 * The non-breaking space between the figure and its unit is the one the rest of
 * core/format already uses, so it is spelled out here rather than matched
 * loosely: a plain space would let "78,4" and "kg" land on two lines.
 */
const NBSP = ' ';

describe('a weight', () => {
  it('always shows the tenth, even when it is zero', () => {
    /**
     * WHERE formatQuantity DROPS IT AND THIS DOES NOT.
     *
     * A quantity is typed and rarely fractional, so "120 g" beats "120,0 g". A
     * weight is measured: "78 kg" beside "78,4 kg" in a list would read as a
     * rounder, less certain figure rather than as the same kind of reading.
     */
    expect(formatWeight(78)).toBe(`78,0${NBSP}kg`);
    expect(formatWeight(78.4)).toBe(`78,4${NBSP}kg`);

    // The two really do differ, which is what makes this a decision.
    expect(formatQuantity(120, 'g')).toBe(`120${NBSP}g`);
  });

  it('rounds to the tenth rather than printing what the float holds', () => {
    expect(formatWeight(78.44)).toBe(`78,4${NBSP}kg`);
    expect(formatWeight(78.45)).toBe(`78,5${NBSP}kg`);
    expect(formatWeight(0.1 + 0.2 + 78)).toBe(`78,3${NBSP}kg`);
  });

  it('uses the French decimal separator', () => {
    expect(formatWeight(78.4)).toContain(',');
    expect(formatWeight(78.4)).not.toContain('.');
  });
});

describe('a rate', () => {
  it('keeps two decimals, because a tenth would collapse the subject', () => {
    // 0,35 and 0,25 a week differ by two kilos over three months. Rounded to a
    // tenth they would both read "0,3".
    expect(formatRate(-0.35)).toBe(`-0,35${NBSP}kg/sem`);
    expect(formatRate(-0.25)).toBe(`-0,25${NBSP}kg/sem`);
  });

  it('writes the plus sign, because direction IS the meaning', () => {
    // An unsigned "0,35 kg/sem" beside a target of "-0,35" would read as
    // agreement rather than as the opposite of it.
    expect(formatRate(0.35)).toBe(`+0,35${NBSP}kg/sem`);
    expect(formatRate(-0.35)).toBe(`-0,35${NBSP}kg/sem`);
  });

  it('gives maintenance no sign at all', () => {
    // A rate that rounds to zero is maintenance; "+0,00" would invent a
    // direction nobody is travelling in.
    expect(formatRate(0)).toBe(`0,00${NBSP}kg/sem`);
    expect(formatRate(0.001)).toBe(`0,00${NBSP}kg/sem`);
    expect(formatRate(-0.001)).toBe(`0,00${NBSP}kg/sem`);
  });

  it('never prints a negative zero', () => {
    // -0 is what a regression on a flat series produces, and "-0,00 kg/sem" is
    // the kind of thing that makes a figure look broken.
    expect(formatRate(-0)).toBe(`0,00${NBSP}kg/sem`);
    expect(formatRate(-0.0001)).not.toContain('-');
  });
});
