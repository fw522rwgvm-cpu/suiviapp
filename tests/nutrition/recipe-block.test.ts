import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  journalEntry,
  type DayMealId,
  type JournalEntryId,
  type RecipeId,
} from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import {
  readDay,
  readDayTotals,
  readEntriesForReplay,
  readEntry,
  readMealEntries,
  readMealTotals,
  readRecentMeals,
} from '../../src/features/nutrition/data/day-reads';
import { addEntries, addFreeEntry, deleteEntry } from '../../src/features/nutrition/data/day-writes';
import { readMealLines } from '../../src/features/nutrition/data/meal-lines';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The grouped recipe block in the journal (specs 8.6, D5/R2).
 *
 * The rows are written straight through Drizzle rather than through addEntries,
 * deliberately: this is the READ layer and the aggregation invariant being
 * tested, and they must hold for any block the schema permits — including one
 * that arrives from an imported archive rather than from this binary's writer.
 *
 * > Aggregation invariant: every macro sum runs over childless rows. A
 * > 'recipe' parent has its macro columns NULL, so SUM ignores it and double
 * > counting is structurally impossible rather than conditionally avoided.
 */

const DATE = toLocalDate('2026-09-11');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

/**
 * The identifier of a materialised meal.
 *
 * DayMealView.id is nullable because a VIRTUAL day's meals have none — they
 * are positions in a plan, not rows. Narrowing on undefined alone would let a
 * null straight through, which is the mistake this helper exists to make once
 * rather than at every call site.
 */
function requireMealId(id: DayMealId | null | undefined): DayMealId {
  if (id === null || id === undefined) throw new Error('meal is not materialised');
  return id;
}

/** Materialises the day and hands back its first meal. */
function firstMeal(): DayMealId {
  addFreeEntry(database.db, {
    date: DATE,
    mealPosition: 0,
    name: 'Amorce',
    macros: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  });
  return requireMealId(readDay(database.db, DATE).meals[0]?.id);
}

interface BlockOptions {
  /** 'portions' writes portion_name and no base_unit; 'weight' the reverse. */
  yield?: 'portions' | 'weight';
  consumed?: number;
  recipeId?: RecipeId | null;
}

/**
 * A parent and two ingredient lines, exactly as addEntries will write them.
 *
 * The parent carries NO macros and the children carry everything, which is
 * D5/R2 stated in rows.
 */
function writeBlock(mealId: DayMealId, options: BlockOptions = {}): JournalEntryId {
  const parentId = newId<JournalEntryId>();
  const portions = (options.yield ?? 'portions') === 'portions';
  const consumed = options.consumed ?? 2;

  database.db
    .insert(journalEntry)
    .values({
      id: parentId,
      dayMealId: mealId,
      date: DATE,
      parentEntryId: null,
      position: 10,
      kind: 'recipe',
      sourceFoodId: null,
      sourceRecipeId: options.recipeId === undefined ? newId<RecipeId>() : options.recipeId,
      name: 'Curry de pois chiches',
      brand: null,
      baseUnit: portions ? null : 'g',
      quantity: consumed,
      portionName: portions ? 'portion' : null,
      portionQuantity: null,
      protein100: null,
      carbs100: null,
      fat100: null,
      kcal100: null,
      createdAt: 1_789_000_000_000,
      updatedAt: 1_789_000_000_000,
    })
    .run();

  const lines = [
    { name: 'Pois chiches', quantity: 180, kcal: 265.5, protein: 8.25, carbs: 47.5, fat: 3.125 },
    { name: 'Crème de coco', quantity: 50, kcal: 200, protein: 2, carbs: 3, fat: 20 },
  ];

  lines.forEach((line, index) => {
    database.db
      .insert(journalEntry)
      .values({
        id: newId<JournalEntryId>(),
        dayMealId: mealId,
        date: DATE,
        parentEntryId: parentId,
        position: 11 + index,
        kind: 'recipe_item',
        sourceFoodId: null,
        sourceRecipeId: null,
        name: line.name,
        brand: null,
        baseUnit: 'g',
        quantity: line.quantity,
        portionName: null,
        portionQuantity: null,
        protein100: line.protein,
        carbs100: line.carbs,
        fat100: line.fat,
        kcal100: line.kcal,
        createdAt: 1_789_000_000_000,
        updatedAt: 1_789_000_000_000,
      })
      .run();
  });

  return parentId;
}

/** 180 g at 265,5 kcal/100 plus 50 g at 200 kcal/100. */
const BLOCK_KCAL = (180 * 265.5) / 100 + (50 * 200) / 100;

describe('reading a grouped block', () => {
  it('nests the ingredient lines under the parent rather than beside it', () => {
    const mealId = firstMeal();
    const parentId = writeBlock(mealId);

    const entries = readMealEntries(database.db, mealId);
    const parent = entries.find((entry) => entry.id === parentId);

    // The primer free entry and the block — two top-level rows, not four.
    expect(entries).toHaveLength(2);
    expect(parent?.children.map((child) => child.name)).toEqual([
      'Pois chiches',
      'Crème de coco',
    ]);
    // And no ingredient line appears at the top level.
    expect(entries.some((entry) => entry.kind === 'recipe_item')).toBe(false);
  });

  it('gives the parent the sum of its children, where it has no macros of its own', () => {
    const mealId = firstMeal();
    const parentId = writeBlock(mealId);

    const parent = readMealEntries(database.db, mealId).find((entry) => entry.id === parentId);

    expect(parent?.reference).toBeNull();
    expect(parent?.total?.kcal).toBeCloseTo(BLOCK_KCAL, 9);
  });

  it('lets a meal be totalled by summing the rows it hands back', () => {
    // The property nesting buys: with the children inside their parent, adding
    // up the top-level totals gives the meal with no clause and no risk of
    // counting a block twice.
    const mealId = firstMeal();
    writeBlock(mealId);

    const fromRows = readMealEntries(database.db, mealId).reduce(
      (running, entry) => running + (entry.total?.kcal ?? 0),
      0,
    );

    expect(fromRows).toBeCloseTo(readMealTotals(database.db, DATE).get(mealId)?.kcal ?? 0, 9);
  });

  it('reads one block whole, children included', () => {
    const mealId = firstMeal();
    const parentId = writeBlock(mealId);

    const entry = readEntry(database.db, parentId);

    expect(entry?.id).toBe(parentId);
    expect(entry?.children).toHaveLength(2);
    expect(entry?.total?.kcal).toBeCloseTo(BLOCK_KCAL, 9);
  });
});

describe('the aggregation invariant', () => {
  it('counts the block once, through the clause-free SUM', () => {
    const mealId = firstMeal();
    writeBlock(mealId);

    // The parent's macros are NULL, so SUM ignores it: the day is the children
    // and nothing else. Double counting is impossible rather than avoided.
    expect(readDayTotals(database.db, DATE).kcal).toBeCloseTo(BLOCK_KCAL, 9);
  });

  it('does not move a single total when the parent quantity changes', () => {
    // THE ASSERTION THAT MAKES THE SHADOW FALSIFIABLE.
    //
    // A recipe parent is the one row in this schema whose `quantity` is not in
    // base units: it holds how much of the recipe was eaten. That is safe only
    // because the row carries no macros, so nothing multiplies it — and the
    // day it stopped being safe would be the day someone "fixed" the SUM to
    // include parents. This is the same guard display_ref_qty got in slice 3.
    const mealId = firstMeal();
    const parentId = writeBlock(mealId, { consumed: 2 });
    const dayBefore = readDayTotals(database.db, DATE);
    const mealBefore = readMealTotals(database.db, DATE).get(mealId);

    database.raw
      .prepare('UPDATE journal_entry SET quantity = 99 WHERE id = ?')
      .run(parentId);

    expect(readDayTotals(database.db, DATE)).toEqual(dayBefore);
    expect(readMealTotals(database.db, DATE).get(mealId)).toEqual(mealBefore);
    // And the row itself did change, so the assertions above are about a
    // mutation that actually happened rather than about a no-op.
    expect(
      readMealEntries(database.db, mealId).find((entry) => entry.id === parentId)?.quantity,
    ).toBe(99);
  });

  it('holds for a weight yield as well as a portions yield', () => {
    const mealId = firstMeal();
    writeBlock(mealId, { yield: 'weight', consumed: 250 });

    // base_unit is 'g' on this parent, so the SUM expression multiplies 250 by
    // a NULL macro — still NULL, still ignored. The invariant does not depend
    // on the parent's columns being empty, only on its macros being.
    expect(readDayTotals(database.db, DATE).kcal).toBeCloseTo(BLOCK_KCAL, 9);
  });
});

describe('deleting a block', () => {
  it('takes its ingredient lines with it, in one statement', () => {
    const mealId = firstMeal();
    const parentId = writeBlock(mealId);
    expect(countRows(database.raw, 'journal_entry')).toBe(4);

    deleteEntry(database.db, parentId);

    // The cascade on parent_entry_id, shipped in 0001 three slices before its
    // first user — which is why deleteEntry never had to grow a loop.
    expect(countRows(database.raw, 'journal_entry')).toBe(1);
    expect(readDayTotals(database.db, DATE).kcal).toBe(0);
  });
});

describe('replaying a meal that holds a block', () => {
  it('keeps the recipe the block came from', () => {
    // The leak slice 5 left: readEntriesForReplay did not select
    // source_recipe_id and the replay wrote a hard null, so a replayed
    // block was correct and silently anonymous.
    const mealId = firstMeal();
    const recipeId = newId<RecipeId>();
    writeBlock(mealId, { recipeId });

    const tomorrow = toLocalDate('2026-09-12');
    addEntries(database.db, {
      date: tomorrow,
      mealPosition: 0,
      entries: readMealLines(database.db, mealId),
    });

    const copiedMeal = requireMealId(readDay(database.db, tomorrow).meals[0]?.id);
    const block = readMealEntries(database.db, copiedMeal).find(
      (entry) => entry.kind === 'recipe',
    );

    expect(block?.sourceRecipeId).toBe(recipeId);
  });

  it('rebuilds the tree rather than flattening it', () => {
    const mealId = firstMeal();
    writeBlock(mealId);

    const tomorrow = toLocalDate('2026-09-12');
    addEntries(database.db, {
      date: tomorrow,
      mealPosition: 0,
      entries: readMealLines(database.db, mealId),
    });

    const copiedMeal = requireMealId(readDay(database.db, tomorrow).meals[0]?.id);
    const entries = readMealEntries(database.db, copiedMeal);

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.kind === 'recipe')?.children).toHaveLength(2);
    expect(readDayTotals(database.db, tomorrow).kcal).toBeCloseTo(BLOCK_KCAL, 9);
  });

  it('replays an ingredient line from its capsule, never from a food', () => {
    // refreshedReference only refreshes kind 'food'. A recipe_item is an
    // ADJUSTED composition (specs 8.6), not a reference to re-read: re-reading
    // it would undo the adjustment the user made for that occasion.
    const mealId = firstMeal();
    writeBlock(mealId);

    const source = readEntriesForReplay(database.db, mealId);
    const line = source.find((entry) => entry.kind === 'recipe_item');

    expect(line?.sourceFoodId).toBeNull();
    expect(line?.kcal100).toBe(265.5);
  });
});

describe('what a recent meal says it contains', () => {
  it('names the top-level lines, in the order they were logged', () => {
    // "8 lignes" says how big the meal was and never what it was: two meals of
    // eight lines are told apart by nothing at all, which is the one thing a
    // recents list has to do.
    const mealId = firstMeal();
    writeBlock(mealId);

    const meal = readRecentMeals(database.db).find((row) => row.mealId === mealId);

    expect(meal?.entryNames).toEqual(['Amorce', 'Curry de pois chiches']);
  });

  it('gives a grouped block its own name, never its ingredients', () => {
    // THE ASSERTION THAT DECIDES THE SHAPE. A meal is made of the things that
    // were CHOSEN, and the ingredients of a recipe were not chosen one by one:
    // listing them would make a two-line meal read as a four-line one, and the
    // count beside it would then disagree with the names it is standing in for
    // when the line is cut.
    const mealId = firstMeal();
    writeBlock(mealId);

    const meal = readRecentMeals(database.db).find((row) => row.mealId === mealId);

    expect(meal?.entryNames).not.toContain('Pois chiches');
    expect(meal?.entryNames).not.toContain('Crème de coco');
    expect(meal?.entryNames).toHaveLength(meal?.entryCount ?? -1);
  });

  it('keeps the names of one meal out of another', () => {
    const mealId = firstMeal();
    addFreeEntry(database.db, {
      date: DATE,
      mealPosition: 1,
      name: 'Autre repas',
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 10 },
    });

    const meals = readRecentMeals(database.db);

    expect(meals.find((row) => row.mealId === mealId)?.entryNames).toEqual(['Amorce']);
    expect(meals.find((row) => row.mealId !== mealId)?.entryNames).toEqual(['Autre repas']);
  });
});

describe('expanding a past meal into basket lines', () => {
  it('gives one line per top-level entry, a block staying one', () => {
    // "Each food individually" means the meal's OWN lines. A grouped recipe is
    // one of the things that were chosen; its ingredients were never chosen
    // one by one, so expanding them would turn a two-line meal into a
    // four-line one.
    const mealId = firstMeal();
    writeBlock(mealId);

    const lines = readMealLines(database.db, mealId);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.kind).toBe('replay');
    expect(lines[1]?.kind).toBe('recipe');
  });

  it('rebuilds the block with its ingredients and its consumed amount', () => {
    const mealId = firstMeal();
    writeBlock(mealId, { consumed: 3 });

    const block = readMealLines(database.db, mealId).find((line) => line.kind === 'recipe');

    expect(block?.kind).toBe('recipe');
    if (block?.kind !== 'recipe') return;
    expect(block.consumed).toBe(3);
    expect(block.yieldType).toBe('portions');
    expect(block.lines.map((line) => line.name)).toEqual(['Pois chiches', 'Crème de coco']);
  });

  it('reads a weight yield back off the parent rather than off the recipe', () => {
    // The recipe may have changed its yield since, or be gone. The two yields
    // land in different columns, and reading them back is how the block says
    // which it was.
    const mealId = firstMeal();
    writeBlock(mealId, { yield: 'weight', consumed: 250 });

    const block = readMealLines(database.db, mealId).find((line) => line.kind === 'recipe');

    expect(block?.kind).toBe('recipe');
    if (block?.kind !== 'recipe') return;
    expect(block.yieldType).toBe('weight');
    expect(block.consumed).toBe(250);
  });

  it('comes to the same total once staged and written', () => {
    // The basket's own promise: the figures shown ARE the figures written.
    const mealId = firstMeal();
    writeBlock(mealId);
    const before = readDayTotals(database.db, DATE);

    const tomorrow = toLocalDate('2026-09-12');
    addEntries(database.db, {
      date: tomorrow,
      mealPosition: 0,
      entries: readMealLines(database.db, mealId),
    });

    expect(readDayTotals(database.db, tomorrow).kcal).toBeCloseTo(before.kcal, 9);
  });

  it('falls back to individual lines when a block cannot be rebuilt', () => {
    // It takes a hand-repaired archive to reach — the recipe link would have
    // to be missing — and losing the calories silently is the one outcome
    // worth refusing outright.
    const mealId = firstMeal();
    const parentId = writeBlock(mealId);
    database.raw
      .prepare('UPDATE journal_entry SET source_recipe_id = NULL WHERE id = ?')
      .run(parentId);

    const lines = readMealLines(database.db, mealId);

    // The primer, then the block's two ingredients as ordinary lines.
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.kind === 'replay')).toBe(true);

    const tomorrow = toLocalDate('2026-09-12');
    addEntries(database.db, { date: tomorrow, mealPosition: 0, entries: lines });
    expect(readDayTotals(database.db, tomorrow).kcal).toBeCloseTo(
      readDayTotals(database.db, DATE).kcal,
      9,
    );
  });
});
