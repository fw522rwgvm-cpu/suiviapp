import { describe, expect, it } from 'vitest';
import {
  KCAL_OVERSHOOT_THRESHOLD,
  progressRatio,
  targetStanding,
} from '../../src/features/nutrition/domain/macros';

/**
 * What the ring and the bars are drawn from (specs 8.3).
 *
 * The drawing itself cannot be tested from here — it is views on a phone. What
 * CAN be pinned is everything the drawing is a picture of, which is why the
 * arithmetic lives in the domain and not in the component: a ring that fills
 * wrongly is a wrong figure, and D9 keeps calculation out of the rendering for
 * exactly this reason.
 */

describe('progressRatio', () => {
  it('gives the plain proportion under target', () => {
    expect(progressRatio(250, 1000)).toBe(0.25);
  });

  it('clamps at full rather than overflowing the shape', () => {
    // The figures beside it stay exact; the drawing is the glance.
    expect(progressRatio(1500, 1000)).toBe(1);
  });

  it('reads no target, a zero target and a negative one as empty', () => {
    // A ring with nothing to fill against must not read as full.
    expect(progressRatio(500, null)).toBe(0);
    expect(progressRatio(500, 0)).toBe(0);
    expect(progressRatio(500, -100)).toBe(0);
  });

  it('reads nothing consumed as empty, including below zero', () => {
    expect(progressRatio(0, 1000)).toBe(0);
    expect(progressRatio(-5, 1000)).toBe(0);
  });

  it('draws nothing rather than something wrong on a value that is not finite', () => {
    // It ends up in a percentage string, where NaN is a width nobody can see
    // and nobody can debug. Empty rather than full on an infinity: a corrupt
    // figure has no proportion to show, and a full ring would be asserting one.
    expect(progressRatio(Number.NaN, 1000)).toBe(0);
    expect(progressRatio(500, Number.NaN)).toBe(0);
    expect(progressRatio(Number.POSITIVE_INFINITY, 1000)).toBe(0);
    expect(progressRatio(500, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('targetStanding', () => {
  it('says nothing at all without a target', () => {
    expect(targetStanding(2000, null)).toBeNull();
    expect(targetStanding(2000, 0)).toBeNull();
  });

  it('is under at and below the target', () => {
    expect(targetStanding(1999, 2000)).toBe('under');
    // Exactly on target is not over. The boundary matters: it is the state the
    // user is aiming at, and it must not flash amber on arrival.
    expect(targetStanding(2000, 2000)).toBe('under');
  });

  it('is over by a little between the target and ten per cent past it', () => {
    expect(targetStanding(2001, 2000)).toBe('over');
    expect(targetStanding(2200, 2000)).toBe('over');
  });

  it('turns to the red state only beyond ten per cent', () => {
    // Exactly 10% over is still 'over': the request was "more than 10%".
    expect(targetStanding(2200, 2000)).toBe('over');
    expect(targetStanding(2201, 2000)).toBe('far_over');
    expect(targetStanding(4000, 2000)).toBe('far_over');
  });

  it('keeps its threshold separate from the kcal discrepancy of specs 5.1', () => {
    // Two unrelated questions that happen to share the number 10. Folding them
    // into one constant would tie a display rule to a nutrition rule for ever,
    // and this assertion is what makes that decision visible if either moves.
    expect(KCAL_OVERSHOOT_THRESHOLD).toBe(0.1);
  });
});

/**
 * The ring's geometry, restated as arithmetic.
 *
 * progress-ring.tsx turns a ratio into two rotations, and the reasoning is the
 * one thing about it that is not obvious. Reproduced here so a change to the
 * formula has to be deliberate: the component itself cannot be rendered from
 * Node, but the numbers it computes can be.
 */
function rotations(progress: number): { right: number; left: number } {
  const clamped = Math.min(1, Math.max(0, progress));
  const angle = clamped * 360;
  return {
    right: Math.min(angle, 180) - 135,
    left: Math.max(angle - 180, 0) + 45,
  };
}

describe('the ring geometry', () => {
  it('hides both arcs when empty', () => {
    // At rest the right half-ring sits over the LEFT half of the circle, where
    // its mask clips it away, and the left one sits over the right half. So
    // nothing is painted rather than a sliver being painted.
    expect(rotations(0)).toEqual({ right: -135, left: 45 });
  });

  it('puts the first arc at twelve o’clock as it fills the right half', () => {
    // A quarter turn: the right arc has advanced 90°, the left has not moved.
    expect(rotations(0.25)).toEqual({ right: -45, left: 45 });
  });

  it('hands over at the half, with the right arc complete', () => {
    expect(rotations(0.5)).toEqual({ right: 45, left: 45 });
  });

  it('closes the circle at full, both arcs covering their own half', () => {
    expect(rotations(1)).toEqual({ right: 45, left: 225 });
  });

  it('stops at full rather than winding round a second time', () => {
    expect(rotations(2.5)).toEqual(rotations(1));
  });
});
