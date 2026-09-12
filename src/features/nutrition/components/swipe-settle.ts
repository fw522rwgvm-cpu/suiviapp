/**
 * Where a swiped row lands when the finger leaves it.
 *
 * Pulled out of the gesture because it is a RULE, not an animation: removing
 * takes two gestures and never one, and that is the kind of thing a later
 * adjustment to a spring or a threshold undoes by accident. Here it can be
 * stated once and checked.
 *
 * It runs on the interface thread, hence the directive -- the gesture that
 * calls it follows the finger, and hopping to the JavaScript thread to decide
 * would stutter at the one moment that matters.
 */

/** Where the row rests when open, and how wide the action reads. */
export const ACTION_WIDTH = 96;
/** Past this, releasing opens rather than closes. */
export const OPEN_THRESHOLD = ACTION_WIDTH / 2;
/** How far an ALREADY OPEN row travels before releasing removes. */
export const FULL_SWIPE = 200;
/** A flick counts even when short, on an open row: points per second. */
export const FLICK_VELOCITY = 800;

export type SwipeSettlement = 'removed' | 'open' | 'closed';

export function settleSwipe({
  open,
  travelled,
  velocityX,
}: {
  /** Was the action already uncovered when this gesture began? */
  open: boolean;
  /** How far left of its closed position the row is now, in points. */
  travelled: number;
  /** Points per second; negative is leftward. */
  velocityX: number;
}): SwipeSettlement {
  'worklet';

  // THE FIRST SWIPE CANNOT REMOVE, however hard it is thrown. It has only
  // uncovered the button; nobody has yet seen what they are about to cross.
  if (open) {
    // And the second only removes if it went FURTHER than where it started.
    // Without this, a flick meant to close would remove -- the one mistake
    // this gesture cannot afford, since what it removes does not come back.
    const pulledFurther = travelled > ACTION_WIDTH;
    if (pulledFurther && (travelled > FULL_SWIPE || velocityX < -FLICK_VELOCITY)) {
      return 'removed';
    }
  }

  return travelled > OPEN_THRESHOLD ? 'open' : 'closed';
}
