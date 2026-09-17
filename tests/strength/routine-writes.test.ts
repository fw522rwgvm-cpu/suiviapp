import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/core/id';
import {
  routine,
  routineBlock,
  routineLine,
  type ExerciseId,
  type Muscle,
  type RoutineId,
} from '../../src/core/db/schema';
import { createExercise } from '../../src/features/strength/data/exercise-writes';
import {
  listRoutines,
  readRoutine,
  readRoutineDraft,
  readRoutineMuscles,
  readRoutineVolume,
} from '../../src/features/strength/data/routine-reads';
import {
  createRoutine,
  deleteRoutine,
  updateRoutine,
} from '../../src/features/strength/data/routine-writes';
import {
  DEFAULT_PROGRESSION_INCREMENT_KG,
  emptyExerciseDraft,
} from '../../src/features/strength/domain/exercise-draft';
import {
  addExerciseBlock,
  addExerciseToBlock,
  duplicateLine,
  emptyRoutineDraft,
  setBlockRest,
  updateLine,
  type RoutineDraft,
} from '../../src/features/strength/domain/routine-draft';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Writing and reading routines (specs 10.2), against a real SQLite file.
 *
 * Two things are worth the round trip and nothing else is: that the SUPERSET
 * rule survives storage — the rest ending up on the block or on the lines, but
 * never on both — and that replacing a routine's contents leaves no orphan
 * behind.
 */

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

function anExercise(
  name: string,
  primaryMuscle: Muscle = 'chest',
  secondary: Muscle[] = [],
): ExerciseId {
  return createExercise(db.db, {
    ...emptyExerciseDraft(DEFAULT_PROGRESSION_INCREMENT_KG),
    name,
    primaryMuscle,
    secondaryMuscles: new Set(secondary),
  });
}

function named(name: string): RoutineDraft {
  return { ...emptyRoutineDraft(), name };
}

describe('storing a routine', () => {
  it('writes its name, steps, blocks and lines, and reads them back in order', () => {
    const bench = anExercise('Développé couché');
    let draft = named('Haut du corps');
    draft = { ...draft, warmupSteps: ['5 min de rameur', 'Rotations d’épaules'] };
    draft = addExerciseBlock(draft, bench, 'Développé couché');
    draft = updateLine(draft, 0, 0, { repsMin: 6, repsMax: 8, targetLoadKg: 60, restSeconds: 120 });
    draft = duplicateLine(draft, 0, 0);

    const id = createRoutine(db.db, draft);
    const view = readRoutine(db.db, id);

    expect(view?.name).toBe('Haut du corps');
    expect(view?.warmupSteps).toEqual(['5 min de rameur', 'Rotations d’épaules']);
    expect(view?.blocks).toHaveLength(1);
    expect(view?.blocks[0]?.lines).toHaveLength(2);
    expect(view?.blocks[0]?.lines[0]?.repsMin).toBe(6);
    expect(view?.blocks[0]?.lines[0]?.targetLoadKg).toBe(60);
  });

  it('drops a warm-up line somebody started and abandoned', () => {
    const bench = anExercise('Développé couché');
    let draft = named('Haut du corps');
    draft = { ...draft, warmupSteps: ['Rameur', '   ', ''] };
    draft = addExerciseBlock(draft, bench, 'Développé couché');

    const view = readRoutine(db.db, createRoutine(db.db, draft));

    expect(view?.warmupSteps).toEqual(['Rameur']);
  });

  it('numbers the sets per exercise, not per block', () => {
    const bench = anExercise('Développé couché');
    const row = anExercise('Rowing', 'lats');
    let draft = addExerciseBlock(named('Haut du corps'), bench, 'Développé couché');
    draft = duplicateLine(draft, 0, 0);
    draft = addExerciseToBlock(draft, 0, row, 'Rowing');
    draft = duplicateLine(draft, 0, 2);

    createRoutine(db.db, draft);

    const stored = db.db
      .select({ setIndex: routineLine.setIndex, position: routineLine.position })
      .from(routineLine)
      .all()
      .sort((a, b) => a.position - b.position);

    expect(stored.map((line) => line.setIndex)).toEqual([1, 2, 1, 2]);
  });
});

describe('the rest, through storage', () => {
  it('is written on the BLOCK and null on every line, superset or not', () => {
    /**
     * > le temps de repos étant défini au niveau du superset
     *
     * The specification states it of a superset; it holds for a single-exercise
     * block too, because such a block IS its exercise. Storing a value in both
     * would leave two numbers and no rule saying which won — the shape this
     * project refuses everywhere else.
     */
    const bench = anExercise('Développé couché');
    const row = anExercise('Rowing', 'lats');

    for (const [name, build] of [
      ['Simple', (d: RoutineDraft) => d],
      ['Superset', (d: RoutineDraft) => addExerciseToBlock(d, 0, row, 'Rowing')],
    ] as const) {
      let draft = addExerciseBlock(named(name), bench, 'Développé couché');
      draft = build(draft);
      draft = setBlockRest(draft, 0, 90);

      const view = readRoutine(db.db, createRoutine(db.db, draft));

      expect(view?.blocks[0]?.restSeconds, name).toBe(90);
      for (const line of view?.blocks[0]?.lines ?? []) {
        expect(line.restSeconds, `${name}: line`).toBeNull();
      }
    }
  });

  it('keeps a line rest already stored by the first version of the slice', () => {
    /**
     * routine_line.rest_seconds is frozen in 0008 and nothing writes it now.
     * A routine saved before the rest moved carries one, and restForBlock reads
     * it back — rows this application did not write are displayed, never
     * corrected.
     */
    const bench = anExercise('Développé couché');
    let draft = addExerciseBlock(named('Ancienne'), bench, 'Développé couché');
    draft = updateLine(draft, 0, 0, { restSeconds: 120 });

    const view = readRoutine(db.db, createRoutine(db.db, draft));

    // Resolved onto the block on the way in, which is where it now belongs.
    expect(view?.blocks[0]?.restSeconds).toBe(120);
  });
});

describe('editing a routine replaces its contents wholesale', () => {
  it('leaves no orphaned block or line behind', () => {
    /**
     * food_portion's rule, with more force: reconciling would serve identifiers
     * NOTHING references. What matters is that the previous contents are GONE,
     * not merely detached — an orphan block would render as a row nobody can
     * explain, and barrier 3 of the import would never see it.
     */
    const bench = anExercise('Développé couché');
    const row = anExercise('Rowing', 'lats');
    let draft = addExerciseBlock(named('Haut du corps'), bench, 'Développé couché');
    draft = duplicateLine(draft, 0, 0);
    draft = addExerciseBlock(draft, row, 'Rowing');
    const id = createRoutine(db.db, draft);

    expect(db.db.select().from(routineBlock).all()).toHaveLength(2);
    expect(db.db.select().from(routineLine).all()).toHaveLength(3);

    // Replaced by a single block of one set.
    updateRoutine(db.db, id, addExerciseBlock(named('Haut du corps'), row, 'Rowing'));

    expect(db.db.select().from(routineBlock).all()).toHaveLength(1);
    expect(db.db.select().from(routineLine).all()).toHaveLength(1);
    expect(readRoutine(db.db, id)?.blocks[0]?.lines[0]?.exerciseName).toBe('Rowing');
  });

  it('renames without touching the contents', () => {
    const bench = anExercise('Développé couché');
    const draft = addExerciseBlock(named('Avant'), bench, 'Développé couché');
    const id = createRoutine(db.db, draft);

    updateRoutine(db.db, id, { ...draft, name: 'Après' });

    const view = readRoutine(db.db, id);
    expect(view?.name).toBe('Après');
    expect(view?.blocks[0]?.lines).toHaveLength(1);
  });

  it('survives a routine emptied of its warm-up', () => {
    const bench = anExercise('Développé couché');
    let draft = addExerciseBlock(named('Haut du corps'), bench, 'Développé couché');
    draft = { ...draft, warmupSteps: ['Rameur'] };
    const id = createRoutine(db.db, draft);

    updateRoutine(db.db, id, { ...draft, warmupSteps: [] });

    expect(readRoutine(db.db, id)?.warmupSteps).toEqual([]);
  });
});

describe('reading a routine back as a draft', () => {
  it('round-trips through the editor shape', () => {
    const bench = anExercise('Développé couché');
    const row = anExercise('Rowing', 'lats');
    let draft = addExerciseBlock(named('Haut du corps'), bench, 'Développé couché');
    draft = updateLine(draft, 0, 0, { setType: 'warmup', progressionEnabled: true, note: 'Léger' });
    draft = addExerciseToBlock(draft, 0, row, 'Rowing');
    draft = setBlockRest(draft, 0, 75);

    const id = createRoutine(db.db, draft);
    const back = readRoutineDraft(db.db, id);

    expect(back?.name).toBe('Haut du corps');
    expect(back?.blocks[0]?.restSeconds).toBe(75);
    expect(back?.blocks[0]?.lines[0]?.setType).toBe('warmup');
    expect(back?.blocks[0]?.lines[0]?.progressionEnabled).toBe(true);
    expect(back?.blocks[0]?.lines[0]?.note).toBe('Léger');
    // A text field cannot hold absence: NULL becomes '' at this boundary.
    expect(back?.blocks[0]?.lines[1]?.note).toBe('');
  });

  it('returns null for a routine that does not exist', () => {
    expect(readRoutine(db.db, newId<RoutineId>())).toBeNull();
    expect(readRoutineDraft(db.db, newId<RoutineId>())).toBeNull();
  });
});

describe('the muscles a routine works', () => {
  it('unions primaries and secondaries across every block', () => {
    /**
     * Secondary muscles count. A bench press works the triceps, and a body map
     * showing only primaries would tell someone their push routine misses them.
     */
    const bench = anExercise('Développé couché', 'chest', ['triceps', 'shoulders']);
    const squat = anExercise('Squat', 'quads', ['glutes']);
    let draft = addExerciseBlock(named('Full body'), bench, 'Développé couché');
    draft = addExerciseBlock(draft, squat, 'Squat');

    const id = createRoutine(db.db, draft);

    expect(readRoutineMuscles(db.db, id).sort()).toEqual([
      'chest',
      'glutes',
      'quads',
      'shoulders',
      'triceps',
    ]);
  });

  it('counts an exercise once however many sets it has', () => {
    const bench = anExercise('Développé couché', 'chest', ['triceps']);
    let draft = addExerciseBlock(named('Push'), bench, 'Développé couché');
    draft = duplicateLine(draft, 0, 0);
    draft = duplicateLine(draft, 0, 0);

    const id = createRoutine(db.db, draft);

    expect(readRoutineMuscles(db.db, id).sort()).toEqual(['chest', 'triceps']);
  });

  it('is empty for a routine whose exercises name no muscle twice', () => {
    expect(readRoutineMuscles(db.db, newId<RoutineId>())).toEqual([]);
  });
});

describe('the routine list', () => {
  it('states how many sets and how many exercises', () => {
    const bench = anExercise('Développé couché');
    const row = anExercise('Rowing', 'lats');
    let draft = addExerciseBlock(named('Haut du corps'), bench, 'Développé couché');
    draft = duplicateLine(draft, 0, 0);
    draft = addExerciseBlock(draft, row, 'Rowing');
    createRoutine(db.db, draft);

    const list = listRoutines(db.db);
    expect(list).toHaveLength(1);
    expect(list[0]?.setCount).toBe(3);
    expect(list[0]?.exerciseCount).toBe(2);
  });

  it('counts a routine with no blocks as zero rather than omitting it', () => {
    // Not reachable through the editor, which refuses an empty routine — but an
    // imported archive can hold one, and a list that silently drops a row is
    // worse than one that shows an empty routine.
    db.db.insert(routine).values({ id: newId<RoutineId>(), name: 'Vide' }).run();

    const list = listRoutines(db.db);
    expect(list).toHaveLength(1);
    expect(list[0]?.setCount).toBe(0);
  });

  it('deletes a routine with everything under it, and no exercise', () => {
    const bench = anExercise('Développé couché');
    const id = createRoutine(db.db, addExerciseBlock(named('Haut du corps'), bench, 'Développé couché'));

    deleteRoutine(db.db, id);

    expect(listRoutines(db.db)).toEqual([]);
    expect(db.db.select().from(routineBlock).all()).toEqual([]);
    expect(db.db.select().from(routineLine).all()).toEqual([]);
    // The exercise is referenced, not owned.
    expect(readRoutine(db.db, id)).toBeNull();
  });
});

describe('how many sets each muscle carries', () => {
  it('counts a repeated exercise once PER SET, secondaries included', () => {
    /**
     * THE JOIN THIS TEST EXISTS FOR. A secondary muscle row exists once per
     * EXERCISE, so a query joining exercise_secondary_muscle without going
     * through routine_line counts three bench presses as one indirect triceps
     * set. Three sets of the bench press really are three indirect triceps
     * sets, and that is what the map has to show.
     */
    const bench = anExercise('Développé couché', 'chest', ['triceps', 'shoulders']);
    let draft = addExerciseBlock(named('Poussée'), bench, 'Développé couché');
    draft = duplicateLine(draft, 0, 0);
    draft = duplicateLine(draft, 0, 0);

    const volume = readRoutineVolume(db.db, createRoutine(db.db, draft));

    expect(volume.get('chest')).toEqual({ direct: 3, indirect: 0, weighted: 3 });
    expect(volume.get('triceps')).toEqual({ direct: 0, indirect: 3, weighted: 1.5 });
    expect(volume.get('shoulders')?.indirect).toBe(3);
  });

  it('adds a muscle across blocks rather than reporting it twice', () => {
    const bench = anExercise('Développé couché', 'chest', ['triceps']);
    const dips = anExercise('Dips', 'chest', ['triceps']);
    let draft = addExerciseBlock(named('Poussée'), bench, 'Développé couché');
    draft = addExerciseBlock(draft, dips, 'Dips');
    draft = duplicateLine(draft, 1, 0);

    const volume = readRoutineVolume(db.db, createRoutine(db.db, draft));

    // One bench set plus two dip sets.
    expect(volume.get('chest')?.direct).toBe(3);
    expect(volume.get('triceps')?.indirect).toBe(3);
  });

  it('reports nothing for a routine that does not exist', () => {
    expect(readRoutineVolume(db.db, newId<RoutineId>()).size).toBe(0);
  });

  it('agrees with the muscles the map lights', () => {
    /**
     * Two functions answer two questions — "does it light" and "how much" — and
     * they must not disagree about the first. A muscle with volume that the map
     * does not light would be a tooltip on a grey region.
     */
    const bench = anExercise('Développé couché', 'chest', ['triceps', 'shoulders']);
    const squat = anExercise('Squat', 'quads', ['glutes']);
    let draft = addExerciseBlock(named('Full body'), bench, 'Développé couché');
    draft = addExerciseBlock(draft, squat, 'Squat');
    const id = createRoutine(db.db, draft);

    // Widened to strings on purpose: the volume map is keyed by what the
    // COLUMN holds, which carries no CHECK, while readRoutineMuscles returns
    // the narrowed type. Comparing them is exactly the point of the test.
    const lit = new Set<string>(readRoutineMuscles(db.db, id));
    for (const muscle of readRoutineVolume(db.db, id).keys()) {
      expect(lit.has(muscle), `${muscle} has volume but is not lit`).toBe(true);
    }
    expect(lit.size).toBe(readRoutineVolume(db.db, id).size);
  });
});
