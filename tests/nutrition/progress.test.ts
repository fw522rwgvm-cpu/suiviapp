import { describe, expect, it } from 'vitest';
import {
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

  it('is under below the target', () => {
    expect(targetStanding(1999, 2000)).toBe('under');
    expect(targetStanding(0, 2000)).toBe('under');
  });

  it('is reached at exactly the target, where the gauge closes', () => {
    // THE BOUNDARY THAT DEFINES THE RULE. The arc fills at exactly the target,
    // so the colour has to change at the same instant the shape does — a full
    // ring in the accent colour would be the one state the drawing cannot
    // tell apart from the next one.
    expect(targetStanding(2000, 2000)).toBe('reached');
  });

  it('stays reached however far past it goes', () => {
    // There is no third state any more: the amber band between the target and
    // ten per cent past it had nowhere left to live once the ring turned red
    // on filling.
    expect(targetStanding(2001, 2000)).toBe('reached');
    expect(targetStanding(4000, 2000)).toBe('reached');
  });
});

/**
 * The gauge's geometry, restated as arithmetic.
 *
 * progress-ring.tsx turns a ratio into an arc angle, two rotations and two cap
 * positions, and none of that is obvious. Reproduced here so a change to the
 * formulae has to be deliberate: the component cannot be rendered from Node,
 * but every number it computes can be.
 */
function arcAngle(progress: number, sweep = 360): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(360, Math.max(0, sweep)) * clamped;
}

function rotations(angle: number): { right: number; left: number } {
  return {
    right: Math.min(angle, 180) - 135,
    left: Math.max(angle - 180, 0) + 45,
  };
}

/** Where a round end lands, clockwise from twelve, on the arc's centre line. */
function capCentre(
  angle: number,
  size: number,
  thickness: number,
): { x: number; y: number } {
  const radius = (size - thickness) / 2;
  const radians = (angle * Math.PI) / 180;
  return {
    x: size / 2 + radius * Math.sin(radians),
    y: size / 2 - radius * Math.cos(radians),
  };
}

describe('the arc angle', () => {
  it('spans the whole turn on a closed ring', () => {
    expect(arcAngle(1)).toBe(360);
    expect(arcAngle(0.5)).toBe(180);
  });

  it('spans only the gauge on a three-quarter one', () => {
    // The day's banner: 270 degrees of arc, so full means 270 and not 360.
    expect(arcAngle(1, 270)).toBe(270);
    expect(arcAngle(0.5, 270)).toBe(135);
  });

  it('stops at full rather than winding round a second time', () => {
    expect(arcAngle(2.5, 270)).toBe(arcAngle(1, 270));
  });

  it('is nothing at zero, which is what leaves the gauge empty', () => {
    expect(arcAngle(0, 270)).toBe(0);
  });
});

describe('the two rotations', () => {
  it('hides both arcs when there is no angle', () => {
    // At rest the right half-ring sits over the LEFT half of the circle, where
    // its mask clips it away, and the left one sits over the right half. So
    // nothing is painted rather than a sliver being painted.
    expect(rotations(0)).toEqual({ right: -135, left: 45 });
  });

  it('advances the first arc alone through the right half', () => {
    expect(rotations(90)).toEqual({ right: -45, left: 45 });
  });

  it('hands over at the half, with the right arc complete', () => {
    expect(rotations(180)).toEqual({ right: 45, left: 45 });
  });

  it('closes the circle at a whole turn', () => {
    expect(rotations(360)).toEqual({ right: 45, left: 225 });
  });

  it('leaves the left arc short on a three-quarter gauge', () => {
    // 270 degrees: the right half is full and the left carries the other 90.
    expect(rotations(270)).toEqual({ right: 45, left: 135 });
  });
});

describe('the rounded ends', () => {
  const SIZE = 100;
  const THICKNESS = 10;
  // The centre line of a 10-point stroke on a 100-point circle.
  const RADIUS = 45;

  it('puts the opening end at twelve o’clock', () => {
    const centre = capCentre(0, SIZE, THICKNESS);
    expect(centre.x).toBeCloseTo(50, 6);
    expect(centre.y).toBeCloseTo(50 - RADIUS, 6);
  });

  it('runs clockwise, not anticlockwise', () => {
    // The trap the negated cosine exists for: the screen's y axis points down,
    // so a quarter turn has to land on the RIGHT and level with the centre.
    const centre = capCentre(90, SIZE, THICKNESS);
    expect(centre.x).toBeCloseTo(50 + RADIUS, 6);
    expect(centre.y).toBeCloseTo(50, 6);
  });

  it('reaches six o’clock at a half turn', () => {
    const centre = capCentre(180, SIZE, THICKNESS);
    expect(centre.x).toBeCloseTo(50, 6);
    expect(centre.y).toBeCloseTo(50 + RADIUS, 6);
  });

  it('sits on the stroke’s centre line, which is what makes it a cap', () => {
    // Its diameter is the thickness and its centre is at the stroke's radius,
    // so it IS the round cap rather than something shaped like one. Checked at
    // an angle no axis passes through.
    const centre = capCentre(37, SIZE, THICKNESS);
    const distance = Math.hypot(centre.x - 50, centre.y - 50);
    expect(distance).toBeCloseTo(RADIUS, 6);
  });

  it('closes back onto its own start after a whole turn', () => {
    const start = capCentre(0, SIZE, THICKNESS);
    const end = capCentre(360, SIZE, THICKNESS);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
  });
});
