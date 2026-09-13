import { describe, expect, it } from 'vitest';
import { dedupeRemote, libraryBarcodes } from '../../src/features/nutrition/off/off-dedupe';
import type { OffProduct } from '../../src/features/nutrition/off/off-product';

/**
 * The deduplication specs 8.5 calls a compulsory corollary of the automatic
 * copy.
 *
 * Worth testing because its failure is invisible in the wrong direction: too
 * little deduplication shows a product twice, which anyone would notice and
 * report. Too MUCH hides a product entirely, and a product that never appears
 * in a search looks exactly like a product Open Food Facts does not have.
 */

function product(barcode: string, name = 'Produit'): OffProduct {
  return {
    barcode,
    name,
    brand: null,
    protein100: 1,
    carbs100: 1,
    fat100: 1,
    kcal100: 20,
  };
}

describe('the barcodes the library holds', () => {
  it('collects them, ignoring foods that have none', () => {
    const known = libraryBarcodes([
      { barcode: '3017620422003' },
      { barcode: null },
      { barcode: '3033710065967' },
    ]);

    expect([...known].sort()).toEqual(['3017620422003', '3033710065967']);
  });

  it('refuses an empty string as a barcode', () => {
    // It cannot come from the parser, which reads blank as absent. It CAN come
    // from an archive repaired by hand, which D7 expects — and one empty
    // string in this set would hide every remote product with no barcode,
    // which is most of them.
    expect(libraryBarcodes([{ barcode: '' }, { barcode: '   ' }]).size).toBe(0);
  });
});

describe('hiding what the library already represents', () => {
  it('drops a remote result whose barcode is already personal', () => {
    // The personal row is the single representative, and specs 8.4b already
    // puts it first.
    const kept = dedupeRemote(
      [product('3017620422003'), product('3033710065967')],
      new Set(['3017620422003']),
    );

    expect(kept.map((p) => p.barcode)).toEqual(['3033710065967']);
  });

  it('hides it EVEN WHEN the remote macros now differ', () => {
    // The case the question always comes back to. Specs 8.5 makes local
    // editing "the main mechanism for compensating for the uneven quality of
    // the source", so re-offering the uncorrected remote version on every
    // search would re-offer exactly what the user deliberately replaced.
    // Nothing is said and nothing is proposed.
    const corrected = { ...product('3017620422003'), protein100: 99, name: 'Autre' };
    expect(dedupeRemote([corrected], new Set(['3017620422003']))).toEqual([]);
  });

  it('keeps everything when the library knows no barcodes at all', () => {
    const remote = [product('1'), product('2')];
    expect(dedupeRemote(remote, new Set())).toEqual(remote);
  });

  it('never hides a product for having no barcode in common with nothing', () => {
    // Guards the direction that fails silently: over-hiding looks like a
    // product Open Food Facts does not have.
    expect(dedupeRemote([product('1')], new Set(['2', '3']))).toHaveLength(1);
  });
});

describe('duplicates inside the remote list itself', () => {
  it('keeps the first of two hits sharing a barcode', () => {
    // Open Food Facts is crowd-edited and entries get duplicated before they
    // get merged. Two identical rows read as a bug, and tapping either writes
    // the same food. First wins: the endpoint returns them by relevance.
    const kept = dedupeRemote(
      [product('1', 'Nutella'), product('1', 'Nutella (doublon)'), product('2')],
      new Set(),
    );

    expect(kept.map((p) => p.name)).toEqual(['Nutella', 'Produit']);
  });

  it('preserves relevance order, which is the only ranking there is', () => {
    // Unlike the personal list, which domain/food-search.ts ranks against what
    // was typed, a remote list arrives already ordered and re-sorting it here
    // would throw that away.
    const kept = dedupeRemote([product('3'), product('1'), product('2')], new Set());
    expect(kept.map((p) => p.barcode)).toEqual(['3', '1', '2']);
  });
});
