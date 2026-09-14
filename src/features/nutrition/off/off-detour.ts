import { isCompleteProduct, type OffProduct } from './off-product';
import type { Degradation, LookupResult } from './off-lookup';

/**
 * Whether a scan sends the user to the pre-filled creation form, and why.
 *
 * Pure — no React, no database, no network — so the rule that decides where a
 * scan lands is testable in Node. It is the last branch of the five-second
 * journey (specs 8.5) and the only one that leaves it.
 *
 * ## IT NOW COVERS EVERY WAY A SCAN CAN FAIL, NOT JUST ONE
 *
 * Specs 8.5 asks for the detour in one line, for one case:
 *
 * > Code-barres inconnu : proposition de créer un aliment personnel
 * > pré-rempli.
 *
 * And D11 answers a FAILED request with a discreet banner and nothing more.
 * Read together, that left a scan that could not be resolved — no network, an
 * unreadable answer, a quota — dropping the user back on the list holding a
 * barcode that went nowhere. They are standing in a shop with the product in
 * their hand; the one thing they certainly have is the barcode.
 *
 * So the detour is offered for all of them. Asked for explicitly, and recorded
 * as an amendment rather than left as a divergence.
 *
 * ## WHAT MAKES IT SAFE RATHER THAN MERELY HELPFUL
 *
 * Nothing is WRITTEN by getting here. The form is a step, and specs 8.5's own
 * rule holds: what the user saves explicitly is written, what they merely pass
 * through is not. A scan that fails and is abandoned leaves exactly nothing —
 * which is the property slice 4 built ensureOffFood around.
 *
 * And the barcode carried into the form is not a detail: it is what makes the
 * food created here answer the NEXT scan, and deduplicate against Open Food
 * Facts the day somebody adds the product there. A form with an empty barcode
 * would leave that shelf unscannable for ever.
 */
export type DetourReason =
  /** Found, but missing at least one of the four macros (specs 8.5). */
  | 'incomplete'
  /** Open Food Facts answered, and has no such product. */
  | 'notFound'
  /** The request never reached an answer, and the cache was empty. */
  | Degradation;

export interface OffDetour {
  /** What to pre-fill with. Barcode only, when that is all there is. */
  product: OffProduct;
  reason: DetourReason;
}

/**
 * A product carrying nothing but its barcode.
 *
 * Every field explicitly null rather than absent: ABSENT MUST NEVER BECOME
 * ZERO is the rule slice 4 is built on, and a shape with holes in it is one
 * refactor away from being filled with defaults.
 */
function barcodeOnly(barcode: string): OffProduct {
  return {
    barcode,
    name: null,
    brand: null,
    protein100: null,
    carbs100: null,
    fat100: null,
    kcal100: null,
  };
}

export function detourFor(
  lookup: LookupResult | undefined,
  barcode: string | null,
): OffDetour | null {
  if (lookup === undefined || barcode === null) return null;

  if (lookup.status === 'found') {
    // A complete product goes straight to the quantity step — the fast path
    // the five-second target is measured on. Only an incomplete one detours.
    return isCompleteProduct(lookup.product)
      ? null
      : { product: lookup.product, reason: 'incomplete' };
  }

  if (lookup.status === 'notFound') {
    return { product: barcodeOnly(barcode), reason: 'notFound' };
  }

  // 'unavailable' means the network failed AND the cache was empty: there is
  // no answer anywhere, so there is nothing to wait for.
  return { product: barcodeOnly(barcode), reason: lookup.reason };
}
