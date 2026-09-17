import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId } from '../../src/core/id';
import {
  routine,
  routineBlock,
  routineLine,
  type ExerciseId,
  type RoutineBlockId,
  type RoutineId,
  type RoutineLineId,
} from '../../src/core/db/schema';
import {
  countExercises,
  listExercises,
  readExercise,
  readExerciseDraft,
} from '../../src/features/strength/data/exercise-reads';
import {
  createExercise,
  deleteExercise,
  readExerciseUsage,
  setExerciseFavorite,
  updateExercise,
} from '../../src/features/strength/data/exercise-writes';
import {
  DEFAULT_PROGRESSION_INCREMENT_KG,
  emptyExerciseDraft,
  type ExerciseDraft,
} from '../../src/features/strength/domain/exercise-draft';
import { searchExercises } from '../../src/features/strength/domain/exercise-search';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Writing and reading exercises (specs 10.1), against a real SQLite file.
 *
 * What is worth testing here is not that an insert inserts. It is the two
 * places where more than one table moves at once: replacing the secondary
 * muscles, which a sequential update would deadlock against its own primary
 * key, and deleting an exercise, where the foreign key is a NET and the policy
 * lives in the transaction.
 */

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

function draft(over: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return {
    ...emptyExerciseDraft(DEFAULT_PROGRESSION_INCREMENT_KG),
    name: 'Développé couché',
    primaryMuscle: 'chest',
    equipment: 'barbell',
    secondaryMuscles: new Set(['triceps', 'shoulders']),
    ...over,
  };
}

/** A routine with one block holding one line for the given exercise. */
function routineUsing(exerciseId: ExerciseId, name: string): RoutineId {
  const routineId = newId<RoutineId>();
  const blockId = newId<RoutineBlockId>();
  db.db.insert(routine).values({ id: routineId, name }).run();
  db.db.insert(routineBlock).values({ id: blockId, routineId, position: 0 }).run();
  db.db
    .insert(routineLine)
    .values({
      id: newId<RoutineLineId>(),
      blockId,
      exerciseId,
      position: 0,
      setIndex: 1,
      setType: 'work',
    })
    .run();
  return routineId;
}

describe('creating and reading an exercise', () => {
  it('stores every field and reads it back', () => {
    const id = createExercise(
      db.db,
      draft({
        noteExecution: 'Omoplates serrées',
        noteSetup: 'Banc à plat',
        noteBreathing: 'Souffler à la poussée',
        noteMistakes: 'Rebond sur la poitrine',
        incrementKg: '1,25',
        isFavorite: true,
      }),
    );

    const view = readExercise(db.db, id);
    expect(view).not.toBeNull();
    expect(view?.name).toBe('Développé couché');
    expect(view?.primaryMuscle).toBe('chest');
    expect(view?.equipment).toBe('barbell');
    expect(view?.incrementKg).toBe(1.25);
    expect(view?.isFavorite).toBe(1);
    expect(view?.noteExecution).toBe('Omoplates serrées');
    expect([...(view?.secondaryMuscles ?? [])].sort()).toEqual(['shoulders', 'triceps']);
  });

  it('writes an empty note as NULL rather than an empty string', () => {
    const id = createExercise(db.db, draft({ noteExecution: '   ' }));

    expect(readExercise(db.db, id)?.noteExecution).toBeNull();
  });

  it('trims the name, so two spellings of one name are one name', () => {
    const id = createExercise(db.db, draft({ name: '  Squat  ' }));

    expect(readExercise(db.db, id)?.name).toBe('Squat');
  });

  it('refuses a draft the editor would not have submitted', () => {
    // Expected problems are values; reaching the write with an invalid draft is
    // a programming error, so this one throws.
    expect(() => createExercise(db.db, draft({ name: '' }))).toThrow(/name_missing/);
    expect(() => createExercise(db.db, draft({ incrementKg: '0' }))).toThrow(
      /increment_not_positive/,
    );
  });

  it('stores the increment it was given, never the setting', () => {
    /**
     * The single path specs 6.3 describes. A second source — a SQL DEFAULT, or
     * a read of the setting here — would agree almost always and diverge
     * silently, both numbers being plausible.
     */
    const id = createExercise(db.db, draft({ incrementKg: '7,5' }));

    expect(readExercise(db.db, id)?.incrementKg).toBe(7.5);
    expect(readExercise(db.db, id)?.incrementKg).not.toBe(DEFAULT_PROGRESSION_INCREMENT_KG);
  });

  it('reads back as a draft the editor can hold', () => {
    const id = createExercise(db.db, draft({ incrementKg: '2,5', isFavorite: true }));

    const back = readExerciseDraft(db.db, id);
    expect(back?.incrementKg).toBe('2,5');
    expect(back?.isFavorite).toBe(true);
    // A text field cannot hold absence: NULL becomes '' at this boundary and
    // nowhere earlier.
    expect(back?.noteExecution).toBe('');
  });

  it('returns null for an exercise that does not exist', () => {
    expect(readExercise(db.db, newId())).toBeNull();
    expect(readExerciseDraft(db.db, newId())).toBeNull();
  });
});

describe('the secondary muscles, replaced wholesale', () => {
  it('survives a swap that a sequential update would collide on', () => {
    /**
     * THE CASE THAT DECIDES THE SHAPE. The primary key is (exercise_id,
     * muscle), so updating rows one at a time to turn {triceps, shoulders} into
     * {shoulders, triceps} collides with whichever it writes first. Replacing
     * wholesale makes the case disappear rather than handling it — food_portion's
     * reasoning, and it transfers because nothing references a muscle row.
     */
    const id = createExercise(db.db, draft({ secondaryMuscles: new Set(['triceps']) }));

    updateExercise(db.db, id, draft({ secondaryMuscles: new Set(['shoulders']) }));
    expect(readExercise(db.db, id)?.secondaryMuscles).toEqual(['shoulders']);

    updateExercise(db.db, id, draft({ secondaryMuscles: new Set(['triceps']) }));
    expect(readExercise(db.db, id)?.secondaryMuscles).toEqual(['triceps']);
  });

  it('accepts an exercise with none at all', () => {
    const id = createExercise(db.db, draft({ secondaryMuscles: new Set() }));

    expect(readExercise(db.db, id)?.secondaryMuscles).toEqual([]);
  });

  it('clears them when an edit removes the last one', () => {
    const id = createExercise(db.db, draft());

    updateExercise(db.db, id, draft({ secondaryMuscles: new Set() }));

    expect(readExercise(db.db, id)?.secondaryMuscles).toEqual([]);
  });
});

describe('editing an exercise', () => {
  it('changes the fields and leaves the id alone', () => {
    const id = createExercise(db.db, draft());

    updateExercise(db.db, id, draft({ name: 'Développé incliné', equipment: 'dumbbell' }));

    const view = readExercise(db.db, id);
    expect(view?.id).toBe(id);
    expect(view?.name).toBe('Développé incliné');
    expect(view?.equipment).toBe('dumbbell');
  });

  it('flips a favourite without going through the editor', () => {
    const id = createExercise(db.db, draft({ isFavorite: false }));

    setExerciseFavorite(db.db, id, true);
    expect(readExercise(db.db, id)?.isFavorite).toBe(1);

    setExerciseFavorite(db.db, id, false);
    expect(readExercise(db.db, id)?.isFavorite).toBe(0);
  });
});

describe('what deleting an exercise will cost, counted before it is paid', () => {
  it('names the routines rather than counting them', () => {
    /**
     * Specs 5.3 wants a warning "nommant explicitement ce qui sera perdu". A
     * count is not a name: "2 routines" tells you less than "Full body, Haut du
     * corps", which lets you decide without opening anything.
     */
    const id = createExercise(db.db, draft());
    routineUsing(id, 'Haut du corps');
    routineUsing(id, 'Full body');

    const usage = readExerciseUsage(db.db, id);
    expect(usage.routineNames).toEqual(['Full body', 'Haut du corps']);
    expect(usage.lineCount).toBe(2);
  });

  it('reports nothing for an exercise no routine uses', () => {
    const id = createExercise(db.db, draft());

    expect(readExerciseUsage(db.db, id)).toEqual({ routineNames: [], lineCount: 0 });
  });

  it('names a routine once however many lines it holds', () => {
    const id = createExercise(db.db, draft());
    const routineId = routineUsing(id, 'Haut du corps');
    // A second set of the same exercise in the same block.
    const blocks = db.db
      .select({ id: routineBlock.id })
      .from(routineBlock)
      .where(eq(routineBlock.routineId, routineId))
      .all();
    const firstBlock = blocks[0];
    if (firstBlock === undefined) throw new Error('routineUsing did not create a block');
    db.db
      .insert(routineLine)
      .values({
        id: newId<RoutineLineId>(),
        blockId: firstBlock.id,
        exerciseId: id,
        position: 1,
        setIndex: 2,
        setType: 'work',
      })
      .run();

    const usage = readExerciseUsage(db.db, id);
    expect(usage.routineNames).toEqual(['Haut du corps']);
    expect(usage.lineCount).toBe(2);
  });
});

describe('deleting an exercise, which is never blocked', () => {
  it('removes the lines that pointed at it, and succeeds', () => {
    /**
     * routine_line.exercise_id is NO ACTION, so SQLite would REFUSE this while
     * a line still referenced the exercise — and specs 5.3 says no deletion is
     * ever blocked. The foreign key is the net; this transaction is the policy.
     */
    const id = createExercise(db.db, draft());
    routineUsing(id, 'Haut du corps');

    expect(() => deleteExercise(db.db, id)).not.toThrow();

    expect(readExercise(db.db, id)).toBeNull();
    expect(db.db.select().from(routineLine).all()).toEqual([]);
  });

  it('removes the blocks its lines emptied, and only those', () => {
    /**
     * The consequence that is easy to miss: taking the last line out of a block
     * leaves a block with nothing in it, which the routine page renders as a row
     * nobody can explain.
     *
     * And "only those" is the other half — a block still holding another
     * exercise's line stays.
     */
    const doomed = createExercise(db.db, draft({ name: 'Doomed' }));
    const kept = createExercise(db.db, draft({ name: 'Kept' }));

    const routineId = newId<RoutineId>();
    const soloBlock = newId<RoutineBlockId>();
    const supersetBlock = newId<RoutineBlockId>();
    db.db.insert(routine).values({ id: routineId, name: 'Mixte' }).run();
    db.db
      .insert(routineBlock)
      .values([
        { id: soloBlock, routineId, position: 0 },
        { id: supersetBlock, routineId, position: 1, restSeconds: 90 },
      ])
      .run();
    db.db
      .insert(routineLine)
      .values([
        { id: newId<RoutineLineId>(), blockId: soloBlock, exerciseId: doomed, position: 0, setIndex: 1, setType: 'work' },
        { id: newId<RoutineLineId>(), blockId: supersetBlock, exerciseId: doomed, position: 0, setIndex: 1, setType: 'work' },
        { id: newId<RoutineLineId>(), blockId: supersetBlock, exerciseId: kept, position: 1, setIndex: 1, setType: 'work' },
      ])
      .run();

    deleteExercise(db.db, doomed);

    const blocks = db.db.select({ id: routineBlock.id }).from(routineBlock).all();
    // The solo block is gone; the superset block still holds the kept line.
    expect(blocks.map((b) => b.id)).toEqual([supersetBlock]);
    expect(db.db.select().from(routineLine).all()).toHaveLength(1);
    // And the routine itself survives: deleting an exercise is not deleting a
    // routine, however empty it ends up.
    expect(db.db.select().from(routine).all()).toHaveLength(1);
  });

  it('takes its secondary muscles with it, by cascade', () => {
    const id = createExercise(db.db, draft());

    deleteExercise(db.db, id);

    expect(countExercises(db.db)).toBe(0);
    expect(listExercises(db.db)).toEqual([]);
  });

  it('leaves every other exercise untouched', () => {
    const doomed = createExercise(db.db, draft({ name: 'Doomed' }));
    createExercise(db.db, draft({ name: 'Survivor' }));

    deleteExercise(db.db, doomed);

    expect(listExercises(db.db).map((e) => e.name)).toEqual(['Survivor']);
  });
});

describe('listing the library', () => {
  it('orders case-insensitively within ASCII, and NOT beyond it', () => {
    /**
     * WHAT COLLATE NOCASE ACTUALLY BUYS, pinned because the name promises more
     * than it delivers and the shortfall is invisible in English.
     *
     * NOCASE folds A-Z and nothing else — SQLite says so, and food-search.ts
     * has said so since slice 3. So "arraché" sorts before "Zercher", which a
     * BINARY collation would get wrong, and "Épaulé" sorts AFTER both, which
     * NOCASE gets wrong: U+00C9 is simply a larger code point than 'Z'.
     *
     * That is not a defect to fix here. The order the user sees comes from
     * searchExercises, which sorts on the FOLDED name — the only place accents
     * can be handled at all, since SQLite's lower() is ASCII-only too and a
     * folded column would be stored derived data (D9). tests/strength/
     * exercise-search.test.ts asserts that order, and it is the one that ships.
     *
     * This ORDER BY exists so the list has a stable, deterministic starting
     * point, not so it is final.
     */
    createExercise(db.db, draft({ name: 'Zercher' }));
    createExercise(db.db, draft({ name: 'arraché' }));
    createExercise(db.db, draft({ name: 'Épaulé' }));

    expect(listExercises(db.db).map((e) => e.name)).toEqual(['arraché', 'Zercher', 'Épaulé']);
  });

  it('is re-sorted correctly by the search, which folds before it compares', () => {
    // The other half of the point above: the accent lands where a reader
    // expects it once the fold runs, and this is where that happens.
    createExercise(db.db, draft({ name: 'Zercher' }));
    createExercise(db.db, draft({ name: 'arraché' }));
    createExercise(db.db, draft({ name: 'Épaulé' }));

    expect(searchExercises(listExercises(db.db), '').map((e) => e.name)).toEqual([
      'arraché',
      'Épaulé',
      'Zercher',
    ]);
  });

  it('carries the secondary muscles without one query per row', () => {
    // The shape rather than the count: every row arrives with its muscles from
    // the two queries listExercises runs, whatever the library's size.
    createExercise(db.db, draft({ name: 'A', secondaryMuscles: new Set(['triceps']) }));
    createExercise(db.db, draft({ name: 'B', secondaryMuscles: new Set() }));
    createExercise(db.db, draft({ name: 'C', secondaryMuscles: new Set(['biceps', 'lats']) }));

    const list = listExercises(db.db);
    expect(list.map((e) => e.secondaryMuscles.length)).toEqual([1, 0, 2]);
  });

  it('carries the four notes, so a routine page needs no query per block', () => {
    /**
     * They come from the same row and the same query as everything else here,
     * so carrying them costs nothing — which is the only reason a LIST item may
     * hold text nobody lists. The routine page draws them under every block
     * (specs 14.28), and reading one exercise per block would be the per-row
     * cost slice 4 met when quick-add moved to the whole library.
     *
     * Absence stays NULL all the way here: the empty string is the terminal
     * exception, made by the editor where a field is about to be typed over.
     */
    createExercise(
      db.db,
      draft({
        name: 'Développé couché',
        noteExecution: 'Coudes à 45°',
        noteMistakes: 'Rebond sur la poitrine',
      }),
    );

    const item = listExercises(db.db)[0];

    expect(item?.noteExecution).toBe('Coudes à 45°');
    expect(item?.noteMistakes).toBe('Rebond sur la poitrine');
    expect(item?.noteSetup).toBeNull();
    expect(item?.noteBreathing).toBeNull();
  });

  it('is empty on a fresh database', () => {
    expect(listExercises(db.db)).toEqual([]);
    expect(countExercises(db.db)).toBe(0);
  });
});
