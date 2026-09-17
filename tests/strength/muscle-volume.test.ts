import { describe, expect, it } from 'vitest';
import {
  levelOf,
  rankedMuscles,
  tallyMuscles,
  volumeOf,
  volumeText,
  VOLUME_THRESHOLDS,
  type VolumeSet,
} from '../../src/features/strength/domain/muscle-volume';

/**
 * How much of a routine each muscle carries (specs 10.2).
 *
 * The case that decides the whole shape is the PUSH ROUTINE: the triceps appear
 * in almost every set of it, so how a secondary set is counted decides whether
 * the map says "chest session" or "triceps session".
 */

function set(primary: string, secondary: string[] = []): VolumeSet {
  return { primaryMuscle: primary, secondaryMuscles: secondary };
}

describe('counting a secondary set at half', () => {
  it('keeps a push routine reading as a chest routine', () => {
    /**
     * THE ARBITRATION, stated as the case that forced it. Three bench presses,
     * two overhead presses and three triceps extensions: counted whole, the
     * triceps reach 8 against the chest's 3 and the drawing lies about what the
     * session is. At half, they still lead — which is TRUE, a push session does
     * work them hard — but the chest is no longer buried.
     */
    const sets = [
      ...Array.from({ length: 3 }, () => set('chest', ['triceps', 'shoulders'])),
      ...Array.from({ length: 2 }, () => set('shoulders', ['triceps'])),
      ...Array.from({ length: 3 }, () => set('triceps')),
    ];

    const tally = tallyMuscles(sets);

    expect(tally.get('chest')).toEqual({ direct: 3, indirect: 0, weighted: 3 });
    // 3 direct + 5 indirect halves = 5.5, not 8.
    expect(tally.get('triceps')).toEqual({ direct: 3, indirect: 5, weighted: 5.5 });
    expect(tally.get('shoulders')).toEqual({ direct: 2, indirect: 3, weighted: 3.5 });
  });

  it('lights a muscle that is never anybody’s primary', () => {
    /**
     * The other half of the arbitration. Counting only primaries would leave
     * the forearms grey for ever — and a muscle worked but shown grey reads as
     * "I never train that", which is the false negative this feature exists to
     * avoid.
     */
    const tally = tallyMuscles([set('lats', ['forearms']), set('lats', ['forearms'])]);

    expect(tally.get('forearms')?.weighted).toBe(1);
    expect(tally.get('forearms')?.direct).toBe(0);
  });

  it('never counts one set twice for one muscle', () => {
    // The editor refuses a draft naming a muscle as both primary and secondary,
    // but an imported row can hold one. Skipped rather than trusted.
    const tally = tallyMuscles([set('chest', ['chest', 'triceps'])]);

    expect(tally.get('chest')).toEqual({ direct: 1, indirect: 0, weighted: 1 });
  });

  it('is empty for a routine with no sets', () => {
    expect(tallyMuscles([]).size).toBe(0);
  });
});

describe('the four shading steps', () => {
  it('puts anything worked at all above nothing', () => {
    /**
     * The distinction that must never be missed is worked-at-all against
     * not-worked. Half a set is the smallest thing this can produce, and it
     * lands in the lightest lit band rather than reading as untouched.
     */
    expect(levelOf(0)).toBe(0);
    expect(levelOf(0.5)).toBe(1);
  });

  it('climbs at the thresholds it declares', () => {
    expect(levelOf(VOLUME_THRESHOLDS.light - 0.5)).toBe(1);
    expect(levelOf(VOLUME_THRESHOLDS.light)).toBe(2);
    expect(levelOf(VOLUME_THRESHOLDS.solid - 0.5)).toBe(2);
    expect(levelOf(VOLUME_THRESHOLDS.solid)).toBe(3);
    expect(levelOf(VOLUME_THRESHOLDS.heavy + 10)).toBe(3);
  });

  it('reads against one routine, not a week', () => {
    // The usual 10-20 WEEKLY sets would put every routine in the lowest band
    // and the map would never change colour. Six weighted sets is what the
    // point of a session looks like; this is what says so.
    expect(levelOf(6)).toBe(3);
    expect(levelOf(2)).toBe(1);
  });

  it('never returns a negative level for a value nothing should produce', () => {
    expect(levelOf(-1)).toBe(0);
  });
});

describe('what the tooltip says', () => {
  it('states whole numbers, never a half', () => {
    /**
     * "4,5 séries" is not a thing anybody did. The weighted total decides the
     * COLOUR; the words state counts a reader could have made themselves.
     */
    const tally = tallyMuscles([
      set('chest', ['triceps']),
      set('chest', ['triceps']),
      set('triceps'),
    ]);

    const triceps = volumeOf(tally, 'triceps');
    expect(triceps?.weighted).toBe(2);
    expect(volumeText(triceps!)).not.toContain(',');
    expect(volumeText(triceps!)).toBe('3 séries dont 1 directe');
  });

  it('agrees in number, and says nothing extra when every set is direct', () => {
    expect(volumeText({ direct: 1, indirect: 0, weighted: 1 })).toBe('1 série');
    expect(volumeText({ direct: 4, indirect: 0, weighted: 4 })).toBe('4 séries');
    expect(volumeText({ direct: 3, indirect: 2, weighted: 4 })).toBe('5 séries dont 3 directes');
  });

  it('says so when a muscle is only ever secondary', () => {
    expect(volumeText({ direct: 0, indirect: 1, weighted: 0.5 })).toBe('1 série indirecte');
    expect(volumeText({ direct: 0, indirect: 4, weighted: 2 })).toBe('4 séries indirectes');
  });

  it('returns nothing for a muscle the routine does not work', () => {
    // primary_muscle carries no CHECK, so an unknown value reaches here. It has
    // no volume, which is the same answer the labels and the map already give.
    expect(volumeOf(tallyMuscles([set('chest')]), 'rhomboids')).toBeNull();
  });
});

describe('ranking', () => {
  it('puts the heaviest first, and breaks ties by name', () => {
    const tally = tallyMuscles([
      set('quads', ['glutes']),
      set('quads', ['glutes']),
      set('calves'),
    ]);

    expect(rankedMuscles(tally)).toEqual(['quads', 'calves', 'glutes']);
  });
});
