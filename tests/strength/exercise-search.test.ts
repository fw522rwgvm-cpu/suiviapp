import { describe, expect, it } from 'vitest';
import {
  availableEquipment,
  availableMuscles,
  matchesFilter,
  NO_FILTER,
  scoreExercise,
  searchExercises,
  type ExerciseFilter,
  type SearchableExercise,
} from '../../src/features/strength/domain/exercise-search';

/**
 * Searching and filtering the exercise database (specs 10.1).
 *
 * The FOLD these rest on is tested in tests/search/fold.test.ts — it is shared
 * with the food search and has been since slice 3. What is tested here is what
 * is genuinely new: a ranking over three fields instead of two, and a filter on
 * two axes, which nothing in this project had before.
 */

function exercise(over: Partial<SearchableExercise> = {}): SearchableExercise {
  return {
    name: 'Développé couché',
    primaryMuscle: 'chest',
    equipment: 'barbell',
    secondaryMuscles: ['triceps', 'shoulders'],
    isFavorite: 0,
    ...over,
  };
}

const LIBRARY: SearchableExercise[] = [
  exercise(),
  exercise({
    name: 'Tractions',
    primaryMuscle: 'lats',
    equipment: 'bodyweight',
    secondaryMuscles: ['biceps'],
  }),
  exercise({
    name: 'Curl haltères',
    primaryMuscle: 'biceps',
    equipment: 'dumbbell',
    secondaryMuscles: [],
  }),
  exercise({
    name: 'Squat',
    primaryMuscle: 'quads',
    equipment: 'barbell',
    secondaryMuscles: ['glutes'],
  }),
];

describe('ranking an exercise against a term', () => {
  it('puts the name first, then the muscle, then the equipment', () => {
    // The order is the point: "curl" names an exercise, not a muscle, so
    // nothing about a muscle may outrank a name match.
    const byName = scoreExercise(exercise({ name: 'Curl' }), 'curl');
    const byMuscle = scoreExercise(
      exercise({ name: 'Squat', primaryMuscle: 'quads' }),
      'quadriceps',
    );
    const byEquipment = scoreExercise(
      exercise({ name: 'Squat', primaryMuscle: 'quads', equipment: 'barbell' }),
      'barre',
    );

    expect(byName).toBeGreaterThan(byMuscle);
    expect(byMuscle).toBeGreaterThan(byEquipment);
    expect(byEquipment).toBeGreaterThan(0);
  });

  it('ranks a secondary muscle below a primary one', () => {
    const primary = scoreExercise(exercise({ primaryMuscle: 'triceps' }), 'triceps');
    const secondary = scoreExercise(
      exercise({ primaryMuscle: 'chest', secondaryMuscles: ['triceps'] }),
      'triceps',
    );

    expect(primary).toBeGreaterThan(secondary);
    expect(secondary).toBeGreaterThan(0);
  });

  it('matches muscles and equipment on their FRENCH labels', () => {
    /**
     * Nobody types "lower_back". The value is stored in English so the column
     * and the export stay in one language; the search is the one place the two
     * meet, and it has to meet on the side the user is typing from.
     */
    expect(scoreExercise(exercise({ primaryMuscle: 'lower_back' }), 'lombaires')).toBeGreaterThan(0);
    expect(scoreExercise(exercise({ primaryMuscle: 'lower_back' }), 'lower_back')).toBe(0);
    expect(scoreExercise(exercise({ equipment: 'cable' }), 'poulie')).toBeGreaterThan(0);
  });

  it('finds an accented name from an unaccented term, and the reverse', () => {
    // The fold is shared; this asserts it is actually WIRED here, which a test
    // of the fold alone cannot say.
    expect(scoreExercise(exercise({ name: 'Développé couché' }), 'developpe')).toBeGreaterThan(0);
    expect(scoreExercise(exercise({ name: 'Developpe couche' }), 'développé')).toBe(0);
  });

  it('gives every exercise the same score for an empty term', () => {
    for (const item of LIBRARY) expect(scoreExercise(item, '')).toBe(1);
  });
});

describe('filtering on two axes', () => {
  it('matches a muscle whether it is primary or secondary', () => {
    /**
     * Specs 10.1 says "filtrage par muscle", not "par muscle primaire".
     * Filtering on Triceps and being shown only exercises whose primary muscle
     * is triceps would hide the bench press — which is exactly what someone
     * building a push session is looking for.
     */
    const bench = exercise({ primaryMuscle: 'chest', secondaryMuscles: ['triceps'] });

    expect(matchesFilter(bench, { muscle: 'chest', equipment: null })).toBe(true);
    expect(matchesFilter(bench, { muscle: 'triceps', equipment: null })).toBe(true);
    expect(matchesFilter(bench, { muscle: 'calves', equipment: null })).toBe(false);
  });

  it('intersects the two axes rather than uniting them', () => {
    const bench = exercise({ primaryMuscle: 'chest', equipment: 'barbell' });

    expect(matchesFilter(bench, { muscle: 'chest', equipment: 'barbell' })).toBe(true);
    // Right muscle, wrong equipment: the two must both hold.
    expect(matchesFilter(bench, { muscle: 'chest', equipment: 'cable' })).toBe(false);
    expect(matchesFilter(bench, { muscle: 'calves', equipment: 'barbell' })).toBe(false);
  });

  it('never matches an exercise whose equipment is unstated', () => {
    /**
     * NULL means "not stated" — the editor never writes it, but an old archive
     * can hold it. Matching it against every filter would CLAIM the exercise
     * uses whatever was asked for. Matching it against none says only that
     * nobody said, which is the truth.
     */
    const unstated = exercise({ equipment: null });

    expect(matchesFilter(unstated, { muscle: null, equipment: 'barbell' })).toBe(false);
    expect(matchesFilter(unstated, { muscle: null, equipment: null })).toBe(true);
  });

  it('lets everything through when nothing is filtered', () => {
    for (const item of LIBRARY) expect(matchesFilter(item, NO_FILTER)).toBe(true);
  });
});

describe('the searched, filtered list', () => {
  it('puts favourites first, above a better score', () => {
    /**
     * Specs 10.1: "Favoris en tête". Worth pinning what it costs, because it
     * looks like a bug from the inside: a favourite that merely MENTIONS the
     * term sits above a non-favourite whose name IS the term. That is the
     * specified behaviour, and the useful one — a favourite is a standing
     * answer to "what do I actually do".
     */
    const result = searchExercises(
      [
        exercise({ name: 'Squat', primaryMuscle: 'quads', isFavorite: 0 }),
        exercise({ name: 'Squat bulgare', primaryMuscle: 'quads', isFavorite: 1 }),
      ],
      'squat',
    );

    expect(result.map((e) => e.name)).toEqual(['Squat bulgare', 'Squat']);
  });

  it('applies the filter before the term, and both together', () => {
    const result = searchExercises(LIBRARY, 'barre', { muscle: 'quads', equipment: null });

    expect(result.map((e) => e.name)).toEqual(['Squat']);
  });

  it('returns everything alphabetically for an empty term', () => {
    const result = searchExercises(LIBRARY, '');

    expect(result.map((e) => e.name)).toEqual([
      'Curl haltères',
      'Développé couché',
      'Squat',
      'Tractions',
    ]);
  });

  it('orders case-insensitively rather than by code point', () => {
    const result = searchExercises(
      [exercise({ name: 'arraché' }), exercise({ name: 'Épaulé' }), exercise({ name: 'Zercher' })],
      '',
    );

    expect(result.map((e) => e.name)).toEqual(['arraché', 'Épaulé', 'Zercher']);
  });

  it('drops what matches neither name, muscle nor equipment', () => {
    expect(searchExercises(LIBRARY, 'natation')).toEqual([]);
  });
});

describe('the chips offered', () => {
  it('names only muscles the library actually works, secondaries included', () => {
    const present = availableMuscles(LIBRARY);

    // Primary muscles of the four.
    expect(present.has('chest')).toBe(true);
    expect(present.has('quads')).toBe(true);
    // Secondary only, and offered anyway — the same reading matchesFilter takes.
    expect(present.has('shoulders')).toBe(true);
    expect(present.has('glutes')).toBe(true);
    // Worked by nothing in this library.
    expect(present.has('calves')).toBe(false);
  });

  it('skips equipment nobody uses, and the unstated one', () => {
    const present = availableEquipment([...LIBRARY, exercise({ equipment: null })]);

    expect([...present].sort()).toEqual(['barbell', 'bodyweight', 'dumbbell']);
  });

  it('offers nothing at all for an empty library', () => {
    /**
     * TagFilter's rule: a control with nothing behind it reads as broken. The
     * screen hides the strip when this is empty, which it can only do if the
     * strip is derived from the list rather than from the vocabulary.
     */
    expect(availableMuscles([]).size).toBe(0);
    expect(availableEquipment([]).size).toBe(0);
  });
});

describe('a filter naming a value nothing carries', () => {
  it('returns nothing rather than everything', () => {
    // The failure mode this rules out is a filter that silently does nothing:
    // an empty list is a visible answer, a full one looks like it worked.
    const filter: ExerciseFilter = { muscle: 'calves', equipment: null };

    expect(searchExercises(LIBRARY, '', filter)).toEqual([]);
  });
});
