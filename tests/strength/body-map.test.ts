import { describe, expect, it } from 'vitest';
import { MUSCLES } from '../../src/core/db/schema';
import {
  drawnSlugs,
  litSlugs,
  regionsForMuscle,
  regionsOfView,
  unmappedSlugs,
  viewBoxOf,
} from '../../src/features/strength/body-map/body-map';
import { BODY_REGIONS } from '../../src/features/strength/body-map/paths.generated';

/**
 * The body map (specs 10.2).
 *
 * ## WHAT THESE TESTS CAN AND CANNOT SAY
 *
 * They can say that every muscle owns at least one region, that no region is
 * claimed twice, that the geometry is well formed and that a routine lights
 * exactly the union of its muscles. That is the half that can go wrong
 * silently.
 *
 * They CANNOT say that the lit region is anatomically where that muscle is.
 * Nothing in Node can: a test asserts that `chest` owns a path, never that the
 * path is drawn across the pectorals. That is settled by looking, and it was —
 * see the review plate published alongside this slice. It is worth stating here
 * so nobody reads a green run as saying more than it does.
 */

describe('every muscle lights something', () => {
  it('maps all fifteen, with no gap', () => {
    /**
     * THE LOAD-BEARING ASSERTION. A muscle with no region does not fail, does
     * not warn, and does not light — it silently tells someone their routine
     * misses a muscle it works. That is the false negative this whole feature
     * is designed around.
     */
    for (const muscle of MUSCLES) {
      expect(regionsForMuscle(muscle).length, `${muscle} lights nothing`).toBeGreaterThan(0);
    }
  });

  it('names only regions the drawing actually carries', () => {
    // A mapping naming a slug that does not exist is a muscle that lights
    // nothing, expressed differently — and it would survive the test above.
    const drawn = new Set(drawnSlugs());
    for (const muscle of MUSCLES) {
      for (const slug of regionsForMuscle(muscle)) {
        expect(drawn.has(slug), `${muscle} -> ${slug} is not in the drawing`).toBe(true);
      }
    }
  });

  it('never claims one region for two muscles', () => {
    /**
     * Not a correctness requirement in itself — a region COULD belong to two
     * groups — but it is a decision, and this is what makes taking it
     * deliberate. As it stands each region has one owner, so a lit figure can
     * be read backwards: one shape, one muscle.
     */
    const owner = new Map<string, string>();
    for (const muscle of MUSCLES) {
      for (const slug of regionsForMuscle(muscle)) {
        const existing = owner.get(slug);
        expect(existing, `${slug} is claimed by both ${existing} and ${muscle}`).toBeUndefined();
        owner.set(slug, muscle);
      }
    }
  });

  it('leaves exactly the silhouette unmapped', () => {
    /**
     * Asserted as a LIST rather than a count, so that dropping a mapping by
     * accident names the muscle that went dark instead of moving a number.
     *
     * The first seven draw the body. `tibialis` is the decision: it is the
     * antagonist of the calf, so lighting it with `calves` would be pretty and
     * wrong.
     */
    expect(unmappedSlugs().sort()).toEqual([
      'ankles',
      'feet',
      'hair',
      'hands',
      'head',
      'knees',
      'neck',
      'tibialis',
    ]);
  });
});

describe('what a routine lights', () => {
  it('unions its muscles', () => {
    const lit = litSlugs(['chest', 'triceps']);

    expect(lit.has('chest')).toBe(true);
    expect(lit.has('triceps')).toBe(true);
    expect(lit.has('quadriceps')).toBe(false);
  });

  it('lights the whole of a muscle that owns several regions', () => {
    // chest owns `chest` and `serratus`; quads owns `quadriceps` and
    // `hip-flexors`. A mapping that lit only the first would leave a hole.
    expect([...litSlugs(['chest'])].sort()).toEqual(['chest', 'serratus']);
    expect([...litSlugs(['quads'])].sort()).toEqual(['hip-flexors', 'quadriceps']);
  });

  it('lights nothing for a value this build does not know', () => {
    /**
     * primary_muscle carries no CHECK, so a hand-repaired archive can hold
     * anything. An unknown value contributes nothing rather than throwing —
     * the same answer the labels give, and a body map is never a reason to
     * refuse to render a routine.
     */
    expect(litSlugs(['rhomboids']).size).toBe(0);
    expect(litSlugs([]).size).toBe(0);
  });
});

describe('the drawing itself', () => {
  it('carries both figures, each with regions', () => {
    expect(regionsOfView('front').length).toBeGreaterThan(20);
    expect(regionsOfView('back').length).toBeGreaterThan(20);
  });

  it('gives every region a path that starts with a move', () => {
    // A path not starting with M draws from wherever the pen happened to be,
    // which in a list of independent regions is nowhere in particular.
    for (const region of BODY_REGIONS) {
      expect(region.d.trimStart().startsWith('M'), `${region.slug} starts with ${region.d[0]}`).toBe(
        true,
      );
    }
  });

  it('drops the seven sub-group slugs that overlay their parent', () => {
    const slugs = new Set(drawnSlugs());
    for (const sub of [
      'upper-chest',
      'lower-chest',
      'upper-abs',
      'lower-abs',
      'inner-quad',
      'outer-quad',
      'front-deltoid',
    ]) {
      expect(slugs.has(sub), `${sub} would draw its parent twice`).toBe(false);
    }
  });

  it('gives each view a real box', () => {
    // Four finite numbers with positive extent. The proportions are the
    // drawing's business; what matters is that the constant is well formed.
    for (const view of ['front', 'back'] as const) {
      const parts = viewBoxOf(view).split(' ').map(Number);
      expect(parts).toHaveLength(4);
      for (const part of parts) expect(Number.isFinite(part)).toBe(true);
      expect(parts[2]).toBeGreaterThan(0);
      expect(parts[3]).toBeGreaterThan(0);
    }
  });

  it('boxes the two figures at a comparable scale', () => {
    /**
     * They are rendered side by side at the same height, so a front figure
     * boxed much taller than the back one would come out visibly smaller. The
     * source draws both at one scale; this is what says so after extraction.
     */
    const front = viewBoxOf('front').split(' ').map(Number);
    const back = viewBoxOf('back').split(' ').map(Number);

    const frontRatio = (front[2] ?? 1) / (front[3] ?? 1);
    const backRatio = (back[2] ?? 1) / (back[3] ?? 1);

    expect(Math.abs(frontRatio - backRatio)).toBeLessThan(0.15);
  });

  it('keeps the two figures apart, which is what makes two SVGs possible', () => {
    // Front and back share one coordinate space in the source. If their boxes
    // overlapped, rendering them separately would show slices of both.
    const front = viewBoxOf('front').split(' ').map(Number);
    const back = viewBoxOf('back').split(' ').map(Number);

    const frontRight = (front[0] ?? 0) + (front[2] ?? 0);
    expect(frontRight).toBeLessThanOrEqual(back[0] ?? 0);
  });
});
