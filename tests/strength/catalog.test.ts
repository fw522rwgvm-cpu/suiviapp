import { describe, expect, it } from 'vitest';
import { EQUIPMENT, MUSCLES } from '../../src/core/db/schema';
import {
  EXERCISE_CATALOG,
  MEDIA_SCHEME,
  catalogKeyOf,
  catalogMediaUri,
  offerableCatalog,
} from '../../src/features/strength/catalog/exercises';
import { regionsForMuscle } from '../../src/features/strength/body-map/body-map';

/**
 * The catalogue the application can offer a brand-new library (specs 10.1).
 *
 * ## THIS IS WHAT CONFRONTS THE SLICE 10 VOCABULARY
 *
 * The fifteen muscles and eight equipment values were invented then, and specs
 * 14.20 no 1 says so in as many words: "il n'a jamais rencontré un exercice
 * réel". Five hundred of them meet it here, and the tests at the bottom record
 * what that found — they are assertions about the VOCABULARY rather than about
 * the catalogue.
 *
 * The list is generated from free-exercise-db, so these do not check
 * hand-written data: they check that the MAPPING from a third party's
 * vocabulary onto ours cannot produce something the schema or the body map will
 * not accept.
 */

describe('every entry is well formed', () => {
  it('is big enough to be worth having', () => {
    // The whole reason the source changed: thirty-three hand-named exercises
    // were not enough to build a real routine from.
    expect(EXERCISE_CATALOG.length).toBeGreaterThan(400);
  });

  it('uses only the vocabulary the schema knows', () => {
    for (const entry of EXERCISE_CATALOG) {
      expect(MUSCLES, `${entry.name}: primary`).toContain(entry.primaryMuscle);
      if (entry.equipment !== null) {
        expect(EQUIPMENT, `${entry.name}: equipment`).toContain(entry.equipment);
      }
      for (const muscle of entry.secondaryMuscles) {
        expect(MUSCLES, `${entry.name}: secondary`).toContain(muscle);
      }
    }
  });

  it('never repeats the primary among the secondaries', () => {
    // validateExerciseDraft refuses this, so an entry that did it could not be
    // written at all — and the failure would arrive as a thrown "invalid
    // exercise draft" from a screen rather than as a list anybody can read.
    for (const entry of EXERCISE_CATALOG) {
      expect(entry.secondaryMuscles, entry.name).not.toContain(entry.primaryMuscle);
    }
  });

  it('gives every entry a distinct key and a distinct name', () => {
    /**
     * Both, for different reasons. The KEY is what media_uri stores and what
     * names the image file, so a collision would give two exercises one
     * drawing. The NAME is what the install is idempotent on — an exercise
     * already called that is skipped — so a collision would silently install
     * one of the two.
     *
     * The generator drops a slug it has already seen, which is what makes this
     * hold across five hundred French names that were not written to be unique.
     */
    const keys = EXERCISE_CATALOG.map((entry) => entry.key);
    const names = EXERCISE_CATALOG.map((entry) => entry.name);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every key usable as a file name', () => {
    // The key names assets/exercises/<key>.png, so anything outside this set
    // would be a require() Metro cannot resolve — and it would fail at bundle
    // time on the device rather than here.
    for (const entry of EXERCISE_CATALOG) {
      expect(entry.key, entry.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('lights at least one region of the body map for every primary', () => {
    // The map is drawn for a session and for an exercise page, so an entry
    // whose muscle lights nothing would be a figure that stays grey for an
    // exercise somebody is performing.
    for (const entry of EXERCISE_CATALOG) {
      expect(regionsForMuscle(entry.primaryMuscle).length, entry.name).toBeGreaterThan(0);
    }
  });
});

describe('the media scheme', () => {
  it('tells a bundled drawing from a file the user chose', () => {
    /**
     * One column, two namespaces, and which one is readable FROM THE VALUE
     * ALONE. Storing "squat" bare and having the application work out which
     * kind it is would be one column with two meanings resolved by a lookup —
     * the "two answers to one question" shape.
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
  it('reaches every muscle as a primary at least once', () => {
    /**
     * THE TEST THAT CHANGED ITS ANSWER WHEN THE SOURCE DID.
     *
     * The first version of this slice left `forearms` with no primary
     * exercise, which confirmed specs 14.21 no 5 — "les avant-bras ne sont
     * presque jamais le primaire de personne" — and justified the half-count
     * for a secondary muscle.
     *
     * wger did not model forearms, lower_back or adductors AT ALL, so all
     * three had to be reached by name rules. free-exercise-db names all three,
     * which retires that instrument — and leaves exactly ONE muscle it cannot
     * express: `obliques`, which it folds into `abdominals`.
     *
     * So the name rule survives for that one, and this is what checks it still
     * works: if a rename upstream stops OBLIQUE_PATTERN matching, a muscle goes
     * permanently grey on the body map and its filter comes back empty, and
     * nothing else would notice.
     */
    const primaries = new Set(EXERCISE_CATALOG.map((entry) => entry.primaryMuscle));
    const never = MUSCLES.filter((muscle) => !primaries.has(muscle));

    expect(never).toEqual([]);
  });

  it('covers every equipment value', () => {
    // `kettlebell` had no entry at all under the FIRST source — a gap in that
    // dataset rather than in the vocabulary. wger had eleven; this one has
    // fifty-six. The vocabulary was right and the data kept being thin.
    const used = new Set(
      EXERCISE_CATALOG.map((entry) => entry.equipment).filter((value) => value !== null),
    );

    expect(EQUIPMENT.filter((value) => !used.has(value))).toEqual([]);
  });

  it('leaves some entries with NO equipment, which is an answer rather than a gap', () => {
    /**
     * free-exercise-db leaves seventy-seven records with no equipment at all —
     * stretches, mostly, and bodyweight work it declined to classify. That
     * stays NULL rather than being guessed, and slice 10 already decided what
     * it means: an exercise with no equipment matches NO filter, because
     * pretending it matches would assert something nobody said.
     *
     * Asserted as a RANGE rather than a number, so the count moving upstream
     * does not break the test, but the column silently filling in does.
     */
    const unstated = EXERCISE_CATALOG.filter((entry) => entry.equipment === null);

    expect(unstated.length).toBeGreaterThan(0);
    expect(unstated.length).toBeLessThan(EXERCISE_CATALOG.length / 3);
  });

  it('has exercises measured in time', () => {
    // tracks_duration had never met a real exercise either — slice 11 found it
    // was written by NOTHING, read in four places and set nowhere. The
    // catalogue exercises the column on day one, and this is the test that
    // would notice if a source change dropped it again.
    const timed = EXERCISE_CATALOG.filter((entry) => entry.tracksDuration === true);

    expect(timed.length).toBeGreaterThan(0);
  });
});

describe('what the catalogue may still offer', () => {
  it('leaves out every entry the library already holds', () => {
    const held = new Set(EXERCISE_CATALOG.slice(0, 5).map((entry) => entry.key));

    const offered = offerableCatalog(held);

    expect(offered).toHaveLength(EXERCISE_CATALOG.length - 5);
    expect(offered.filter((entry) => held.has(entry.key))).toEqual([]);
  });

  it('offers everything to an empty library', () => {
    expect(offerableCatalog(new Set())).toHaveLength(EXERCISE_CATALOG.length);
  });

  it('offers NOTHING once the library holds the whole catalogue', () => {
    /**
     * The state a default installation plus one trip through this screen can
     * actually reach, so the screen has to have words for it — "Aucun exercice
     * ne correspond" on an untouched search would read as a broken catalogue
     * rather than as a library that already holds everything.
     */
    const all = new Set(EXERCISE_CATALOG.map((entry) => entry.key));

    expect(offerableCatalog(all)).toEqual([]);
  });

  it('keeps the catalogue order, which is what an untouched list shows', () => {
    // searchExercises re-ranks on a term, but a screen nobody has typed into
    // shows this order. Filtering must not reshuffle it.
    const held = new Set([EXERCISE_CATALOG[3]?.key ?? '']);

    const offered = offerableCatalog(held).map((entry) => entry.key);
    const expected = EXERCISE_CATALOG.filter((entry) => !held.has(entry.key)).map(
      (entry) => entry.key,
    );

    expect(offered).toEqual(expected);
  });
});
