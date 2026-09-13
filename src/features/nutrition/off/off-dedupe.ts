import type { OffProduct } from './off-product';

/**
 * Deduplicating the unified search by barcode (specs 8.5).
 *
 * > Automatic copy into the personal database
 * > - EVERY product added to the journal is systematically copied into the
 * >   personal database, barcode and origin kept.
 * > - Compulsory corollary: the unified search DEDUPLICATES BY BARCODE.
 *
 * ## HIDE, RATHER THAN MERGE OR OFFER A CHOICE
 *
 * A remote result whose barcode is already in the personal library is removed
 * from the remote list outright. The personal row — which specs 8.4b already
 * puts first — is the single representative.
 *
 * That is not a display convenience, it is respect for a correction. Specs 8.5
 * makes local editing "the main mechanism for compensating for the uneven
 * quality of the source": showing the uncorrected remote version beside the
 * corrected local one would re-offer, on every single search, exactly the
 * values the user deliberately replaced. And the alternative — a screen that
 * compares the two and asks which is right — is a conflict resolution dialog
 * on a path D16 budgets in taps, whose answer is always "the one I corrected".
 *
 * A product whose remote macros now DIFFER from the local ones is hidden like
 * any other. Nothing is said and nothing is proposed. Re-fetching a corrected
 * food is a deliberate act, and if it is ever wanted it belongs on the food's
 * own page, never on the logging path.
 *
 * ## AND THE DUPLICATES WITHIN THE REMOTE LIST ITSELF
 *
 * Open Food Facts can return the same barcode twice — the database is
 * crowd-edited and entries get duplicated before they get merged. Two
 * identical rows in a result list read as a bug, and tapping either would
 * write the same food. The first wins, because the endpoint returns them in
 * relevance order.
 */

export interface LibraryBarcode {
  barcode: string | null;
}

/**
 * The barcodes the personal library holds.
 *
 * Built from the SAME cached list the local search runs over (D16: one query,
 * searched in memory), so this costs a pass over a few hundred rows and no SQL
 * at all.
 */
export function libraryBarcodes(foods: readonly LibraryBarcode[]): Set<string> {
  const barcodes = new Set<string>();
  for (const food of foods) {
    // An empty string is not a barcode. It cannot arrive from the parser,
    // which treats blank as absent, but it can arrive from a hand-repaired
    // archive (D7 expects those), and it would then hide every remote product
    // that happens to have no barcode.
    if (food.barcode !== null && food.barcode.trim() !== '') {
      barcodes.add(food.barcode);
    }
  }
  return barcodes;
}

/**
 * Remote results, minus anything the library already represents.
 *
 * Order is preserved: the endpoint returns them by relevance, and re-sorting
 * them here would throw away the only ranking available — unlike the personal
 * list, which is ranked by domain/food-search.ts against what was typed.
 */
export function dedupeRemote(
  remote: readonly OffProduct[],
  known: ReadonlySet<string>,
): OffProduct[] {
  const seen = new Set<string>(known);
  const kept: OffProduct[] = [];

  for (const product of remote) {
    if (seen.has(product.barcode)) continue;
    seen.add(product.barcode);
    kept.push(product);
  }

  return kept;
}
