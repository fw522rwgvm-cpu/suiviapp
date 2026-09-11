import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import {
  food,
  foodPortion,
  journalEntry,
  type BaseUnit,
  type FoodId,
  type FoodPortionId,
  type FoodSource,
} from '@/core/db/schema';
import type { FoodDraft } from '../domain/food-draft';
import { fromCanonical } from '../domain/food-macros';
import type { Macros } from '../domain/macros';
import type { Portion, QuantityChoice } from '../domain/portions';
import { prefillQuantity, type LastEntry } from '../domain/quantity-prefill';

/**
 * Reads of the personal food database (D8).
 *
 * Plain functions rather than hooks, so they run in Node against a real SQLite
 * file (D15). The hooks in food-queries.ts are thin wrappers over these.
 *
 * > Reading never writes.
 *
 * MACROS COME BACK FOR 100 BASE UNITS, ALWAYS. display_ref_qty is returned as
 * its own field and is never applied to them here. That is the fence that
 * keeps it a display preference instead of a second, competing statement of
 * the same food (D9) — and the only function that applies it, fromCanonical,
 * is called in exactly one place: the editor's draft, below.
 */

export interface FoodListItem {
  id: FoodId;
  name: string;
  brand: string | null;
  baseUnit: BaseUnit;
  isFavorite: boolean;
  /** For 100 base units, as stored. Never scaled by display_ref_qty. */
  reference: Macros;
}

export interface FoodPortionView extends Portion {
  id: FoodPortionId;
  position: number;
}

export interface FoodView extends FoodListItem {
  source: FoodSource;
  /** The quantity the user types against. A preference, with no normative value. */
  displayRefQty: number;
  portions: FoodPortionView[];
}

const listColumns = {
  id: food.id,
  name: food.name,
  brand: food.brand,
  baseUnit: food.baseUnit,
  isFavorite: food.isFavorite,
  protein100: food.protein100,
  carbs100: food.carbs100,
  fat100: food.fat100,
  kcal100: food.kcal100,
};

interface ListRow {
  id: FoodId;
  name: string;
  brand: string | null;
  baseUnit: BaseUnit;
  isFavorite: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  kcal100: number;
}

function toListItem(row: ListRow): FoodListItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    baseUnit: row.baseUnit,
    // 0/1 in the database (schema section 2); a boolean from here on. This is
    // the boundary where that conversion belongs, and the only one.
    isFavorite: row.isFavorite === 1,
    reference: {
      protein: row.protein100,
      carbs: row.carbs100,
      fat: row.fat100,
      kcal: row.kcal100,
    },
  };
}

/**
 * Every food, alphabetically.
 *
 * ONE QUERY, CACHED, AND THEN SEARCHED IN MEMORY — see domain/food-search.ts
 * for why. Specs 8.4b wants personal results on every keystroke, and at the
 * few hundred rows D16 budgets for, filtering a cached array is faster than
 * any LIKE could be, index or no index.
 *
 * Ordered NOCASE to match ix_food_name, so the sort is the index's own and
 * 'abricot' does not land after every capital letter.
 */
export function listFoods(db: AppDatabase): FoodListItem[] {
  return db
    .select(listColumns)
    .from(food)
    .orderBy(sql`${food.name} COLLATE NOCASE`, asc(food.id))
    .all()
    .map(toListItem);
}

/** One food with its portions, for the editor and the quantity screen. */
export function readFood(db: AppDatabase, foodId: FoodId): FoodView | null {
  const rows = db
    .select({ ...listColumns, source: food.source, displayRefQty: food.displayRefQty })
    .from(food)
    .where(eq(food.id, foodId))
    .all();

  const row = rows[0];
  if (row === undefined) return null;

  const portions = db
    .select({
      id: foodPortion.id,
      name: foodPortion.name,
      quantity: foodPortion.quantity,
      position: foodPortion.position,
    })
    .from(foodPortion)
    .where(eq(foodPortion.foodId, foodId))
    .orderBy(asc(foodPortion.position), asc(foodPortion.id))
    .all();

  return { ...toListItem(row), source: row.source, displayRefQty: row.displayRefQty, portions };
}

/**
 * A stored food as the editor's form holds it.
 *
 * THE ONE PLACE display_ref_qty IS EVER APPLIED ON THE WAY OUT. It produces a
 * draft — a thing bound for a text field — and never a value that feeds
 * another calculation. Everything else in this module hands back macros for
 * 100 and leaves them alone.
 */
export function readFoodDraft(db: AppDatabase, foodId: FoodId): FoodDraft | null {
  const view = readFood(db, foodId);
  if (view === null) return null;

  return {
    name: view.name,
    brand: view.brand,
    source: view.source,
    baseUnit: view.baseUnit,
    macros: fromCanonical(view.reference, view.displayRefQty),
    refQty: view.displayRefQty,
    isFavorite: view.isFavorite,
    portions: view.portions.map((portion) => ({
      id: portion.id,
      name: portion.name,
      quantity: portion.quantity,
    })),
  };
}

/** Favourites, alphabetically. The first half of quick access (specs 8.4a). */
export function readFavoriteFoods(db: AppDatabase): FoodListItem[] {
  return db
    .select(listColumns)
    .from(food)
    .where(eq(food.isFavorite, 1))
    .orderBy(sql`${food.name} COLLATE NOCASE`, asc(food.id))
    .all()
    .map(toListItem);
}

/**
 * Foods most recently logged, most recent first. The second half of quick
 * access (specs 8.4a).
 *
 * THE QUERY THAT ACTUALLY GROWS. The food table holds a few hundred rows;
 * journal_entry holds a year of them and then another. This is what
 * ix_entry_source_food(source_food_id, created_at) was posted in slice 1 for,
 * and it is the reason that index matters where ix_food_name does not.
 *
 * Favourites are not excluded here. The screen shows favourites first and then
 * recents, and a favourite that was eaten this morning belongs in both: it is
 * the same food reached two ways, not a duplicate. Filtering it out of recents
 * would make the second list shift about depending on what is starred.
 */
export function readRecentFoods(db: AppDatabase, limit = 20): FoodListItem[] {
  return db
    .select({ ...listColumns, lastAt: sql<number | null>`max(${journalEntry.createdAt})` })
    .from(journalEntry)
    .innerJoin(food, eq(food.id, journalEntry.sourceFoodId))
    .where(isNotNull(journalEntry.sourceFoodId))
    .groupBy(journalEntry.sourceFoodId)
    // Both terms aggregated, not just the first. A bare column in the ORDER BY
    // of a grouped query is one SQLite picks arbitrarily from the group, so the
    // tie-break would be stable only by luck. max(id) works as a tie-break AND
    // as the answer when created_at is NULL throughout a group, which an
    // imported archive can produce: identifiers are ULIDs, so they sort by
    // creation time on their own.
    .orderBy(
      sql`max(${journalEntry.createdAt}) desc`,
      sql`max(${journalEntry.id}) desc`,
    )
    .limit(limit)
    .all()
    .map(toListItem);
}

/**
 * The last entry logged for a food, in the terms it was logged in.
 *
 * Ordered by created_at and THEN BY id, which is not belt and braces: the
 * column is nullable in the frozen schema, so an imported archive can hold
 * NULLs there, and SQLite sorts NULLs last on a descending order — quietly
 * handing back the oldest row instead of the newest. Identifiers are ULIDs and
 * therefore sort by creation time, so id is both a correct tie-breaker and a
 * working fallback when created_at says nothing.
 */
export function readLastEntryForFood(db: AppDatabase, foodId: FoodId): LastEntry | null {
  const rows = db
    .select({
      quantity: journalEntry.quantity,
      portionName: journalEntry.portionName,
      portionQuantity: journalEntry.portionQuantity,
    })
    .from(journalEntry)
    .where(and(eq(journalEntry.sourceFoodId, foodId), isNotNull(journalEntry.quantity)))
    .orderBy(desc(journalEntry.createdAt), desc(journalEntry.id))
    .limit(1)
    .all();

  const row = rows[0];
  if (row === undefined || row.quantity === null) return null;

  return {
    quantity: row.quantity,
    portionName: row.portionName,
    portionQuantity: row.portionQuantity,
  };
}

/**
 * What the quantity screen opens on — the whole four-step chain of specs 8.4,
 * composed here so the screen holds no rule of its own (D9).
 */
export function readQuantityPrefill(
  db: AppDatabase,
  foodId: FoodId,
): { food: FoodView; quantity: QuantityChoice } | null {
  const view = readFood(db, foodId);
  if (view === null) return null;

  return {
    food: view,
    quantity: prefillQuantity(readLastEntryForFood(db, foodId), {
      portions: view.portions,
      displayRefQty: view.displayRefQty,
    }),
  };
}
