import { describe, expect, it } from 'vitest';
import {
  fontFamilyFor,
  NUNITO_BOLD,
  NUNITO_REGULAR,
  NUNITO_SEMIBOLD,
} from '../../src/core/theme/font';

/**
 * Which face a weight asks for.
 *
 * Three static instances are bundled rather than one variable font, because
 * fontWeight does not drive a variable axis through React Native — iOS would
 * register the default instance and SYNTHESISE the bold. So the mapping is the
 * whole mechanism, and getting it wrong is a screen of fake bold that nobody
 * would think to look for.
 */

describe('fontFamilyFor', () => {
  it('answers nothing at all while the fonts are not registered', () => {
    // The first frames, and for ever if loading failed. Undefined means the
    // style is left alone and the system face renders — which is what shipped
    // for five slices, so it is a working state rather than a fallback.
    expect(fontFamilyFor('600', false)).toBeUndefined();
    expect(fontFamilyFor(undefined, false)).toBeUndefined();
  });

  it('maps the four weights the application actually uses', () => {
    expect(fontFamilyFor('400', true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor('500', true)).toBe(NUNITO_SEMIBOLD);
    expect(fontFamilyFor('600', true)).toBe(NUNITO_SEMIBOLD);
    expect(fontFamilyFor('700', true)).toBe(NUNITO_BOLD);
  });

  it('treats an unstated weight as regular', () => {
    expect(fontFamilyFor(undefined, true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor('normal', true)).toBe(NUNITO_REGULAR);
  });

  it('understands the two words as well as the numbers', () => {
    expect(fontFamilyFor('bold', true)).toBe(NUNITO_BOLD);
  });

  it('takes numbers as readily as strings', () => {
    // React Native accepts both, and a style copied from anywhere may carry
    // either.
    expect(fontFamilyFor(600, true)).toBe(NUNITO_SEMIBOLD);
    expect(fontFamilyFor(900, true)).toBe(NUNITO_BOLD);
    expect(fontFamilyFor(100, true)).toBe(NUNITO_REGULAR);
  });

  it('rounds every step of the scale onto a face that exists', () => {
    // Only three files are bundled, so the other six weights have to land
    // somewhere deliberate. A missing face is how you get synthetic type.
    expect(fontFamilyFor('100', true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor('300', true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor('800', true)).toBe(NUNITO_BOLD);
    expect(fontFamilyFor('900', true)).toBe(NUNITO_BOLD);
  });

  it('rounds a weight the type forbids but a flattened style can still carry', () => {
    // StyleSheet.flatten hands back whatever was written, and a value off the
    // scale must not fall through to undefined — that would be one Text in the
    // system face among a screen of Nunito.
    expect(fontFamilyFor(350 as never, true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor(650 as never, true)).toBe(NUNITO_SEMIBOLD);
  });

  it('falls back to regular on something that is not a weight at all', () => {
    expect(fontFamilyFor('ultra' as never, true)).toBe(NUNITO_REGULAR);
    expect(fontFamilyFor(null as never, true)).toBe(NUNITO_REGULAR);
  });

  it('never returns a family it has no file for', () => {
    const shipped = new Set([NUNITO_REGULAR, NUNITO_SEMIBOLD, NUNITO_BOLD]);
    const weights = ['100', '400', '500', '600', '700', '900', 'bold', 'normal'] as const;

    for (const weight of weights) {
      expect(shipped.has(fontFamilyFor(weight, true) ?? '')).toBe(true);
    }
  });
});
