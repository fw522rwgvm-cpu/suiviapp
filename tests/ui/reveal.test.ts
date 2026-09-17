import { describe, expect, it } from 'vitest';
import { REVEAL_MARGIN, shiftToReveal } from '../../src/core/ui/reveal';

/**
 * Keeping the field being typed into where it can be seen (specs 14.25).
 *
 * Nothing in Node renders a keyboard, so this is the only place the arithmetic
 * is ever checked — which is why it lives in a module of its own rather than
 * inside form-section.tsx, where the Node suite cannot reach it at all.
 *
 * A phone, roughly: an 844-point window, a keyboard 336 points tall, and a
 * scroll view that stops 100 points short of the window because a header and a
 * tab bar are taking that.
 */
const BAND = { keyboardTop: 508, viewportHeight: 744, windowHeight: 844 };

/** A form row, the 44 points the system uses. */
const ROW = 44;

describe('what a field under the keyboard costs', () => {
  it('moves the page by exactly what is hidden, plus the margin', () => {
    // A row whose bottom sits 20 points into the keyboard.
    const top = BAND.keyboardTop - ROW + 20;

    expect(shiftToReveal(top, ROW, BAND)).toBe(20 + REVEAL_MARGIN);
  });

  it('moves a field entirely below the keyboard by more than its own height', () => {
    const shift = shiftToReveal(BAND.keyboardTop + 200, ROW, BAND);

    expect(shift).toBe(200 + ROW + REVEAL_MARGIN);
  });

  it('leaves a field that already clears the keyboard alone', () => {
    /**
     * THE ZERO IS WHAT MAKES THIS SAFE TO CALL TWICE. A field is revealed when
     * it takes focus and again when the keyboard arrives — the first tap into a
     * form does not yet know how tall the keyboard is. Both calls have to be
     * able to run without the two of them fighting.
     */
    const top = BAND.keyboardTop - ROW - REVEAL_MARGIN - 1;

    expect(shiftToReveal(top, ROW, BAND)).toBe(0);
  });

  it('treats the margin as part of being hidden', () => {
    // Fully visible, but with nothing between it and the keyboard: the row
    // below it is what tells you where you are, and there would be none.
    const top = BAND.keyboardTop - ROW;

    expect(shiftToReveal(top, ROW, BAND)).toBe(REVEAL_MARGIN);
  });
});

describe('a field that has walked off the top', () => {
  it('moves the page back down, and the sign says which way', () => {
    // The scroll view starts 100 points down the window here.
    const shift = shiftToReveal(60, ROW, BAND);

    expect(shift).toBeLessThan(0);
    expect(shift).toBe(60 - REVEAL_MARGIN - 100);
  });

  it('leaves a field comfortably below the top alone', () => {
    expect(shiftToReveal(200, ROW, BAND)).toBe(0);
  });
});

describe('the band, when nothing is known about it', () => {
  it('takes the whole window as visible when the scroll view fills it', () => {
    // No header and no tab bar: the top of the band is the window's own edge.
    const full = { ...BAND, viewportHeight: BAND.windowHeight };

    expect(shiftToReveal(REVEAL_MARGIN, ROW, full)).toBe(0);
    expect(shiftToReveal(0, ROW, full)).toBe(-REVEAL_MARGIN);
  });

  it('never deduces a negative top edge from a viewport taller than the window', () => {
    // Not a real state, and the arithmetic must not invent a band above the
    // screen from it: that would scroll a visible field for no reason.
    const odd = { ...BAND, viewportHeight: BAND.windowHeight + 200 };

    expect(shiftToReveal(REVEAL_MARGIN, ROW, odd)).toBe(0);
  });

  it('asks for nothing when no keyboard is up', () => {
    /**
     * `keyboardTop` is the window's height until one shows, which is the honest
     * answer to "nothing is covering the page" — and it has to produce a zero,
     * or every focus without a keyboard would scroll the form.
     */
    const none = { ...BAND, keyboardTop: BAND.windowHeight };

    expect(shiftToReveal(400, ROW, none)).toBe(0);
  });
});

describe('a note that grows past what the keyboard leaves visible', () => {
  /** The band here is 508 − 100 = 408 points tall. */
  const BAND_HEIGHT = BAND.keyboardTop - (BAND.windowHeight - BAND.viewportHeight);

  it('keeps its BOTTOM in view, because that is where the caret is', () => {
    /**
     * A note taller than the band has both corrections applying at once: its
     * bottom is under the keyboard AND its top is off the screen. Applied in
     * turn they would pull the page back and forth on every new line typed.
     */
    const tall = BAND_HEIGHT + 200;
    const top = 40; // already off the top of the band
    const shift = shiftToReveal(top, tall, BAND);

    expect(shift).toBeGreaterThan(0);
    expect(shift).toBe(top + tall + REVEAL_MARGIN - BAND.keyboardTop);
  });

  it('does not pull a too-tall field back down once its bottom is in place', () => {
    /**
     * The state the previous test lands in: bottom settled just above the
     * keyboard, top far off the screen. Without the fits guard this returns a
     * negative shift, and the two answers alternate for ever.
     */
    const tall = BAND_HEIGHT + 200;
    const top = BAND.keyboardTop - REVEAL_MARGIN - tall;

    expect(shiftToReveal(top, tall, BAND)).toBe(0);
  });

  it('still rescues a field that fits and has walked off the top', () => {
    // The guard must not cost the ordinary case its correction.
    const shift = shiftToReveal(40, ROW, BAND);

    expect(shift).toBeLessThan(0);
  });

  it('treats a field exactly the height of the band as too tall', () => {
    /**
     * Exactly as tall means there is no room for a margin at both ends, so
     * there is nothing to choose between the two corrections and the bottom
     * wins by the same reasoning.
     */
    const top = BAND.keyboardTop - REVEAL_MARGIN - BAND_HEIGHT;

    expect(shiftToReveal(top, BAND_HEIGHT, BAND)).toBe(0);
  });
});
