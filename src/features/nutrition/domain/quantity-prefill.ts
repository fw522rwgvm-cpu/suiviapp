import { isUsableRefQty } from './food-macros';
import { baseQuantity, portionQuantity, type Portion, type QuantityChoice } from './portions';

/**
 * What the quantity screen opens on (specs 8.4, D16).
 *
 * > The quantity screen opens pre-filled with the LAST QUANTITY CONSUMED for
 * > this food, the value selected and the numeric keyboard already up. A
 * > habitual food is then logged in two taps, without the keyboard. This is
 * > the main lever on the 15-second target.
 *
 * So this function is the lever. It is pure, and it is tested, because "opens
 * on the wrong number" is the failure mode that is plausible rather than
 * visible: a quantity that is merely believable gets validated without being
 * read.
 *
 * THE FOUR STEPS, in order:
 *
 *   1. the last entry logged for this food, in the terms it was logged in;
 *   2. the same quantity in base units, when those terms no longer hold;
 *   3. the food's own display_ref_qty, when there is no last entry;
 *   4. 100, when even that is unusable.
 *
 * ON "LAST": the normative index is ix_entry_source_food(source_food_id,
 * created_at), so last means LAST RECORDED, not last eaten. Logging yesterday's
 * lunch this morning makes that the one that pre-fills. That is the
 * architecture's choice, read off the index rather than guessed at, and it is
 * also the better one: the most recent expression of intent is the most likely
 * to repeat.
 */

export interface LastEntry {
  /** Always in base units, as every stored quantity is. */
  quantity: number;
  /** How it was expressed, frozen at the time (D5/R1). Null if base units. */
  portionName: string | null;
  /** The size of ONE portion, as it was then. */
  portionQuantity: number | null;
}

export interface PrefillContext {
  portions: readonly Portion[];
  displayRefQty: number;
}

export function prefillQuantity(
  last: LastEntry | null,
  context: PrefillContext,
): QuantityChoice {
  if (last === null) {
    // Nothing has been logged for this food yet, so the best guess available
    // is the quantity its macros were typed against — which for a food whose
    // label reads "per 30 g" is very often the helping as well.
    return baseQuantity(isUsableRefQty(context.displayRefQty) ? context.displayRefQty : 100);
  }

  if (last.portionName === null || last.portionQuantity === null || last.portionQuantity <= 0) {
    return baseQuantity(last.quantity);
  }

  const current = context.portions.find((portion) => portion.name === last.portionName);

  /**
   * THE CASE THAT DECIDES THE SHAPE OF THIS FUNCTION.
   *
   * The portion must still exist AND still be the same size. Compared exactly,
   * because any difference at all means it was redefined, and a redefinition
   * is precisely what must not be applied backwards.
   *
   * If a slice was 25 g when "2 slices" was logged and is 30 g today, offering
   * "2 slices" again would log 60 g for a habit that has always been 50 g —
   * and it would do it silently, on the screen whose entire job is to be
   * validated without being read. Specs 5.2 freezes history; this is what that
   * costs on the way back out.
   *
   * Falling back to 50 g is not a degraded answer. It is the honest one: it is
   * what was actually eaten last time.
   */
  if (current === undefined || current.quantity !== last.portionQuantity) {
    return baseQuantity(last.quantity);
  }

  return portionQuantity(current, last.quantity / current.quantity);
}
