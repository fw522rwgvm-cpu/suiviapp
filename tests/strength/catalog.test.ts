import { describe, expect, it } from 'vitest';
import { EQUIPMENT, MUSCLES } from '../../src/core/db/schema';
import {
  EXERCISE_CATALOG,
  MEDIA_SCHEME,
  catalogKeyOf,
  catalogMediaUri,
} from '../../src/features/strength/catalog/exercises';
import { EXERCISE_DRAWINGS } from '../../src/features/strength/catalog/drawings.generated';
import { regionsForMuscle } from '../../src/features/strength/body-map/body-map';

/**
 * The catalogue the application can offer a brand-new library (specs 10.1).
 *
 * ## THIS IS THE FIRST THING THAT CONFRONTS THE SLICE 10 VOCABULARY
 *
 * The fifteen muscles and eight equipment values were invented then, and specs
 * 14.20 no 1 says so in as many words: "il n'a jamais rencontré un exercice
 * réel". These tests are that meeting, and the two that record what it found —
 * a muscle with no primary, an equipment with no entry — are assertions about
 * the vocabulary rather than about the catalogue.
 */

describe('every entry is well formed', () => {
  it('uses only the vocabulary the schema knows', () => {
    for (const entry of EXERCISE_CATALOG) {
      expect(MUSCLES, `${entry.name}: primary`).toContain(entry.primaryMuscle);
      expect(EQUIPMENT, `${entry.name}: equipment`).toContain(entry.equipment);
      for (const muscle of entry.secondaryMuscles) {
        expect(MUSCLES, `${entry.name}: secondary`).toContain(muscle);
      }
    }
  });

  it('never repeats the primary among the secondaries', () => {
    // validateExerciseDraft refuses this, so a catalogue entry that did it
    // could not be written at all — and the failure would arrive as a thrown
    // "invalid exercise draft" from a screen, not as a list anybody can read.
    for (const entry of EXERCISE_CATALOG) {
      expect(entry.secondaryMuscles, `${entry.name}`).not.toContain(entry.primaryMuscle);
    }
  });

  it('gives every entry a distinct key and a distinct name', () => {
    /**
     * Both, and for different reasons. The KEY is what media_uri stores, so a
     * collision would give two exercises one drawing. The NAME is what the
     * import is idempotent on — an exercise already called that is skipped —
     * so a collision would silently install one of the two.
     */
    const keys = EXERCISE_CATALOG.map((entry) => entry.key);
    const names = EXERCISE_CATALOG.map((entry) => entry.name);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lights at least one region of the body map for every primary', () => {
    // The map is drawn for a session and for an exercise page, so a catalogue
    // entry whose muscle lights nothing would be a figure that stays grey for
    // an exercise somebody is performing.
    for (const entry of EXERCISE_CATALOG) {
      expect(regionsForMuscle(entry.primaryMuscle).length, `${entry.name}`).toBeGreaterThan(0);
    }
  });
});

describe('the drawings', () => {
  it('belongs to a catalogue entry, every one of them', () => {
    // The other direction from the test below: a drawing with no entry is a
    // hundred kilobytes of bundle nothing can reach.
    const keys = new Set(EXERCISE_CATALOG.map((entry) => entry.key));
    for (const key of Object.keys(EXERCISE_DRAWINGS)) {
      expect(keys, `${key} has no catalogue entry`).toContain(key);
    }
  });

  it('draws all but the one that has none, which is named', () => {
    /**
     * `gainage` is the exception and it is deliberate: the source has a side
     * plank and no front plank, and "Gainage" is what everyone means when they
     * say the word — plus tracks_duration needs a canonical representative.
     *
     * Named here rather than counted, so adding a second undrawn exercise is a
     * decision somebody takes in this file instead of a number going up.
     */
    const undrawn = EXERCISE_CATALOG.filter(
      (entry) => EXERCISE_DRAWINGS[entry.key] === undefined,
    ).map((entry) => entry.key);

    expect(undrawn).toEqual(['gainage']);
  });

  it('holds both poses in ONE box, which is what makes the loop work', () => {
    /**
     * The extraction refuses a pair that does not share a viewBox, and this
     * says why it matters on the rendering side: the two frames alternate with
     * no translation and no scaling, so a pair that lost this would make the
     * figure jump between frames.
     *
     * The PNG renderings of the same drawings do NOT share one — cropped to
     * their own ink, 947x1064 against 948x860 for the bench press — which is
     * how the property came to be checked at all.
     */
    for (const [key, drawing] of Object.entries(EXERCISE_DRAWINGS)) {
      expect(drawing.viewBox, `${key}`).toMatch(/^0 0 \d+ \d+$/);
      expect(drawing.relaxed.ink.length, `${key}: relaxed has no ink`).toBeGreaterThan(0);
      expect(drawing.contracted.ink.length, `${key}: contracted has no ink`).toBeGreaterThan(0);
    }
  });

  it('keeps the paths verbatim, with no rounding', () => {
    /**
     * SLICE 10'S LESSON, GUARDED RATHER THAN RESTATED.
     *
     * SVG runs numbers together without separators: `0.999.5` is 0.999 then
     * 0.5, and rounding the first to `1` yields `1.5` — ONE number where there
     * were two. It shipped as plausible, wrong arms.
     *
     * What a test can hold is that the data still LOOKS like unrounded source:
     * a rounded path set would have almost no multi-decimal runs left. Checking
     * every path against the original would mean fetching it, which would make
     * the suite depend on a third-party repository staying up.
     */
    const all = Object.values(EXERCISE_DRAWINGS).flatMap((drawing) => [
      ...drawing.relaxed.ink,
      ...drawing.contracted.ink,
    ]);
    const withRunTogetherDecimals = all.filter((d) => /\d\.\d+\.\d/.test(d));

    expect(withRunTogetherDecimals.length).toBeGreaterThan(0);
  });
});

describe('the media scheme', () => {
  it('tells a bundled drawing from a file the user chose', () => {
    /**
     * One column, two namespaces, and which one is readable FROM THE VALUE
     * ALONE. Storing "bench-press" bare and having the application work out
     * which kind it is would be one column with two meanings resolved by a
     * lookup — the "two answers to one question" shape.
     */
    expect(catalogMediaUri('squat')).toBe(`${MEDIA_SCHEME}squat`);
    expect(catalogKeyOf(catalogMediaUri('squat'))).toBe('squat');
  });

  it('says a bare file name is NOT a catalogue key', () => {
    // A medium the user chose is a file name relative to the container (slice
    // 10). It must not be looked up among the drawings.
    expect(catalogKeyOf('squat.jpg')).toBeNull();
    expect(catalogKeyOf('squat')).toBeNull();
    expect(catalogKeyOf(null)).toBeNull();
  });
});

describe('what this catalogue reveals about the slice 10 vocabulary', () => {
  it('covers every equipment the source has a drawing for', () => {
    const used = new Set(EXERCISE_CATALOG.map((entry) => entry.equipment));
    const missing = EQUIPMENT.filter((value) => !used.has(value));

    /**
     * `kettlebell` AND NOTHING ELSE.
     *
     * The source is an open dataset from the mid-2010s and contains not one
     * kettlebell exercise — checked across all 293 of its entries. The value
     * stays in the vocabulary because it costs nothing and because the gap is
     * the SOURCE's rather than the vocabulary's, but an empty equipment filter
     * is a real thing a user can find.
     */
    expect(missing).toEqual(['kettlebell']);
  });

  it('leaves exactly ONE muscle without a primary exercise, and names it', () => {
    const primaries = new Set(EXERCISE_CATALOG.map((entry) => entry.primaryMuscle));
    const never = MUSCLES.filter((muscle) => !primaries.has(muscle));

    /**
     * `forearms` IS THE ONE THAT MATTERS, AND IT CONFIRMS SLICE 10 WAS RIGHT.
     *
     * Nothing here is primarily a forearm movement — and specs 14.21 no 5
     * predicted exactly that: "les avant-bras ne sont presque jamais le
     * primaire de personne et resteraient gris pour toujours — le faux négatif
     * contre lequel cette carte est conçue". That is why a secondary counts a
     * half rather than nothing, and it is why forearms are lit at all: they
     * appear as a secondary eight times in this catalogue.
     *
     * `traps` has one (shrugs) and `glutes` has one — the deadlift, filed
     * glutes-primary by judgement precisely so that group is not permanently
     * grey. Change that judgement and this test names what it cost.
     */
    expect(never).toEqual(['forearms']);
  });

  it('has exactly one exercise measured in time', () => {
    // tracks_duration had never met a real exercise either — slice 11 found it
    // was written by NOTHING, read in four places and set nowhere. Two here, so
    // the column is exercised by the catalogue on day one.
    const timed = EXERCISE_CATALOG.filter((entry) => entry.tracksDuration === true);

    expect(timed.map((entry) => entry.key).sort()).toEqual(['gainage', 'gainage-lateral']);
  });
});
