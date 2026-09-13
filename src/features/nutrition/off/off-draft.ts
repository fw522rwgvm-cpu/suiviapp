import type { FoodDraft } from '../domain/food-draft';
import type { OffProduct } from './off-product';

/**
 * The pre-filled form an incomplete product diverts to (specs 8.5).
 *
 * > [v2.2] Product found but incomplete: the absence of a SINGLE ONE of the
 * > four — protein, carbs, fat, kcal — takes you out of the fast path and
 * > switches to creating a personal food, PRE-FILLED with everything Open Food
 * > Facts supplied (name, brand, barcode, present macros). Only the missing
 * > fields are left to complete. This path assumedly leaves the 5-second
 * > target: the food is then copied into the personal database, so the cost is
 * > paid only once.
 *
 * ## WHAT "PRE-FILLED" HAS TO MEAN, AND WHAT IT MUST NOT
 *
 * Everything supplied is carried across — including the barcode, which is what
 * makes the food created here deduplicate against later searches exactly as a
 * copied one does. Leaving it out would produce a personal food that the
 * search then shows a second time, from Open Food Facts, for ever.
 *
 * A MISSING MACRO ARRIVES AS ZERO IN THE FORM, and that is the one place in
 * this slice where absent legitimately becomes a number — because a form field
 * cannot hold "absent", and because the user is about to type over it. It is
 * safe precisely here and nowhere else: everything upstream kept it null, so
 * the decision to divert was taken on the truth, and nothing downstream can
 * mistake this zero for a declared value since the user has to look at the
 * field to leave the form.
 *
 * The origin stays 'off'. It records where the food came from, not who last
 * touched it — specs 8.5 keeps "barcode and origin" on the copy, and a food
 * completed by hand came from Open Food Facts all the same.
 */
export function draftFromProduct(product: OffProduct): FoodDraft {
  return {
    name: product.name ?? '',
    brand: product.brand,
    barcode: product.barcode,
    source: 'off',
    /**
     * Grams, always. Open Food Facts publishes per 100 g for everything it
     * holds, liquids included; reading that as millilitres would apply a
     * density of 1, which specs 5.1 forbids in as many words. The unit toggle
     * is right there if the user disagrees.
     */
    baseUnit: 'g',
    macros: {
      protein: product.protein100 ?? 0,
      carbs: product.carbs100 ?? 0,
      fat: product.fat100 ?? 0,
      kcal: product.kcal100 ?? 0,
    },
    /** Per 100, which is both what the source publishes and the canonical form. */
    refQty: 100,
    isFavorite: false,
    /**
     * No portions. Open Food Facts serving sizes are free text, wildly
     * inconsistent, and the eight names of specs 6.1 are a closed list: mapping
     * "1 pot (125g)" onto one of them would be guessing. They are added by hand
     * afterwards, which is one tap on a food already in the library.
     */
    portions: [],
  };
}
