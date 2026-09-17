/**
 * How far a scroll view has to move so the field being typed into can be seen.
 *
 * Pure, and in a module of its own for the reason every other piece of
 * arithmetic in this project is: a `.tsx` that imports react-native cannot be
 * reached from the Node suite — the framework's index is Flow, which rolldown
 * refuses to parse — so a calculation left inside a component is a calculation
 * nothing can check. Section 4 asks for this anyway; here it is also the only
 * way the numbers are ever verified, since nothing renders a keyboard in Node.
 */

export interface RevealBand {
  /** Where the keyboard's top edge is, in screen coordinates. */
  keyboardTop: number;
  /** How tall the scroll view itself is. */
  viewportHeight: number;
  /** How tall the window is, keyboard included. */
  windowHeight: number;
}

/**
 * The margin kept between a field and whatever would otherwise touch it.
 *
 * Enough that the row under the one being typed into stays visible, which is
 * what tells you where you are in a form you are walking with the chevrons.
 */
export const REVEAL_MARGIN = 24;

/**
 * Positive moves the content UP — the field was under the keyboard. Negative
 * moves it down, for a field that has walked off the top. Zero when the field
 * is already in the clear, which is what makes this safe to call on every focus
 * and again when the keyboard arrives.
 *
 * ## THE TOP OF THE BAND IS DEDUCED, NOT KNOWN
 *
 * A form sits under a transparent header and above a keyboard, and nothing here
 * can ask how tall that header is. What it can see is that the scroll view is
 * shorter than the window, and the difference is what sits above and below it.
 * Taking all of it as the top edge errs on the safe side: it can only ask for
 * less movement than the page could give, never for a field to be pushed under
 * a bar.
 */
export function shiftToReveal(
  fieldTop: number,
  fieldHeight: number,
  band: RevealBand,
): number {
  const bottom = fieldTop + fieldHeight;

  // Under the keyboard, which is the case that matters: a chevron moved the
  // focus to a row nobody can see and the next keystroke lands there.
  if (bottom + REVEAL_MARGIN > band.keyboardTop) {
    return bottom + REVEAL_MARGIN - band.keyboardTop;
  }

  const top = Math.max(0, band.windowHeight - band.viewportHeight);
  if (fieldTop - REVEAL_MARGIN < top) return fieldTop - REVEAL_MARGIN - top;

  return 0;
}
