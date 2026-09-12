import { describe, expect, it } from 'vitest';
import {
  ACTION_WIDTH,
  FLICK_VELOCITY,
  FULL_SWIPE,
  settleSwipe,
} from '../../src/features/nutrition/components/swipe-settle';

/**
 * Removing a row takes two gestures, never one (specs 8.3).
 *
 * Worth fixing in a test rather than leaving in the gesture, because this is
 * the one rule of that gesture that has nothing to do with how it feels: a
 * later adjustment to a spring, a threshold or a velocity would undo it
 * without anything looking wrong. And what it guards is an irreversible
 * action reached by the same movement used to scroll, browse and go back.
 */

/** A deliberate throw, well past anything an ordinary swipe produces. */
const HARD_FLICK = -(FLICK_VELOCITY + 500);

describe('the first swipe, from a closed row', () => {
  it('cannot remove, however far it is pulled', () => {
    expect(settleSwipe({ open: false, travelled: FULL_SWIPE * 3, velocityX: 0 })).toBe(
      'open',
    );
  });

  it('cannot remove, however hard it is thrown', () => {
    expect(
      settleSwipe({ open: false, travelled: FULL_SWIPE * 3, velocityX: HARD_FLICK }),
    ).toBe('open');
  });

  it('uncovers the action past half of it, and springs back before that', () => {
    expect(settleSwipe({ open: false, travelled: ACTION_WIDTH / 2 + 1, velocityX: 0 })).toBe(
      'open',
    );
    expect(settleSwipe({ open: false, travelled: ACTION_WIDTH / 2 - 1, velocityX: 0 })).toBe(
      'closed',
    );
  });
});

describe('the second swipe, from a row already open', () => {
  it('removes when it travels past the full swipe', () => {
    expect(settleSwipe({ open: true, travelled: FULL_SWIPE + 1, velocityX: 0 })).toBe(
      'removed',
    );
  });

  it('removes on a flick, which need not travel as far', () => {
    expect(
      settleSwipe({ open: true, travelled: ACTION_WIDTH + 20, velocityX: HARD_FLICK }),
    ).toBe('removed');
  });

  it('stays open when it goes nowhere in particular', () => {
    expect(settleSwipe({ open: true, travelled: ACTION_WIDTH + 10, velocityX: 0 })).toBe(
      'open',
    );
  });

  it('NEVER removes on a flick that did not go further than it started', () => {
    // A flick leftward from an open row that has drifted back towards closed
    // is someone changing their mind, not someone confirming. Removing there
    // would destroy an entry on a gesture meant to undo one.
    expect(settleSwipe({ open: true, travelled: ACTION_WIDTH, velocityX: HARD_FLICK })).toBe(
      'open',
    );
    expect(settleSwipe({ open: true, travelled: 10, velocityX: HARD_FLICK })).toBe('closed');
  });

  it('closes when pulled back the other way', () => {
    expect(settleSwipe({ open: true, travelled: 0, velocityX: 0 })).toBe('closed');
  });
});
