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
  /**
   * The product's barcode, when it has one (slice 4).
   *
   * Carried on the LIST item rather than only on the detail view because the
   * deduplication of specs 8.5 needs every barcode the library holds, on every
   * keystroke, to decide which remote results to hide. Fetching them
   * separately would be a second query answering a question this one already
   * has the rows for.
   */
  barcode: string | null;
  baseUnit: BaseUnit;
  isFavorite: boolean;
  /** For 100 base units, as stored. Never scaled by display_ref_qty. */
  reference: Macros;
}

export interface FoodPortionView extends Portion {
  id: FoodPortionId;
  position: number;
}

/**
 * A food in a list, plus the quantity a one-tap add would log (specs 8.4a, D16).
 *
 * The quantity is NOT a second answer to "how much": it comes from
 * prefillQuantity, the same pure function the quantity screen opens on. That
 * is the whole point of carrying it here rather than recomputing it — the
 * figure shown on the row, the figure the + button adds, and the figure the
 * quantity screen would propose are one value produced once. Two paths to it
 * would agree almost always, and the day they disagreed the row would lie
 * about what its own button does.
 *
 * ALL THREE LISTS CARRY IT, not just recents. A favourite marked on a food
 * never eaten has no "last time", and the chain answers that case as it always
 * has: the food's own display_ref_qty, then 100. The row does not claim the
 * quantity was eaten before — it states what the button will add, which is
 * true whichever step of the chain produced it.
 */
export interface QuickAddFood extends FoodListItem {
  lastQuantity: QuantityChoice;
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
  barcode: food.barcode,
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
  barcode: string | null;
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
    barcode: row.barcode,
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
export function listFoods(db: AppDatabase): QuickAddFood[] {
  return withLastQuantity(
    db,
    db
      .select({ ...listColumns, displayRefQty: food.displayRefQty })
      .from(food)
      .orderBy(sql`${food.name} COLLATE NOCASE`, asc(food.id))
      .all(),
  );
}

/**
 * The food holding this barcode, if the library already has it.
 *
 * THE FIRST STEP OF THE SCAN, and the one that usually ends it. Specs 8.5
 * chains "personal, then cache, then Open Food Facts", and a product already
 * logged once has been copied into the library — so the common case of
 * scanning something habitual costs one indexed lookup and no network at all,
 * which is most of how the five-second target is met.
 *
 * Served by ux_food_barcode, which exists for the deduplication anyway.
 */
export function readFoodByBarcode(db: AppDatabase, barcode: string): FoodListItem | null {
  if (barcode.trim() === '') return null;

  const rows = db.select(listColumns).from(food).where(eq(food.barcode, barcode)).all();
  const row = rows[0];
  return row === undefined ? null : toListItem(row);
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
    // Carried through the editor untouched. A food copied from Open Food Facts
    // is freely correctable (specs 8.5), but correcting its name must not cost
    // it the barcode that lets the search deduplicate it afterwards.
    barcode: view.barcode,
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

/**
 * The last entry logged for EVERY food, in one query.
 *
 * ## WHY A WINDOW FUNCTION RATHER THAN A LOOP
 *
 * When only recents carried a quantity, one indexed lookup per row was a cost
 * worth paying for certainty — twenty rows, capped. Extending the same feature
 * to favourites and to search results removes that cap: the search runs over
 * the WHOLE library, so a lookup per food would be a few hundred queries every
 * time the add window opens, on the path D16 budgets at 0,3 s.
 *
 * ## AND WHY IT IS STILL NOT A SECOND ANSWER
 *
 * The ordering is `created_at DESC, id DESC` — character for character the one
 * readLastEntryForFood uses — so ROW_NUMBER() = 1 selects exactly the row that
 * function returns. That is not a coincidence to be maintained by care: a test
 * compares the two over a seeded journal, food by food, and fails if they ever
 * disagree.
 *
 * The ordering itself is not arbitrary either. `created_at` is nullable in the
 * frozen schema, so an imported archive can hold NULLs there, and SQLite sorts
 * NULLs last on a descending order — quietly picking the OLDEST row. `id` is a
 * ULID, so it sorts by creation time on its own: it is both the tie-break and
 * the fallback.
 *
 * Entries with no quantity are excluded: a recipe parent carries none (D5/R2),
 * and it is not something anyone logged a quantity of.
 *
 * ## AND ONLY kind = 'food', WHICH SLICE 6 HAD TO ADD
 *
 * A recipe_item line carries a source_food_id and a quantity, so before this
 * filter it was eligible to become "the last quantity for that food" — and it
 * is nothing of the kind. It is thirty grams of onion INSIDE a bolognese,
 * scaled by however much of the recipe was eaten and then adjusted by hand.
 *
 * Left alone, logging one recipe would have made every food it contains offer
 * an ingredient's worth on the add screen: plausible, wrong, and invisible,
 * since thirty grams of onion is a perfectly believable amount of onion.
 *
 * The same clause is on readLastEntryForFood, and the test that holds the two
 * implementations to each other now generates blocks so the pair cannot drift
 * apart on this either.
 */
function lastEntriesByFood(db: AppDatabase): Map<FoodId, LastEntry> {
  const rows = db.all<{
    source_food_id: FoodId;
    quantity: number;
    portion_name: string | null;
    portion_quantity: number | null;
  }>(sql`
    SELECT source_food_id, quantity, portion_name, portion_quantity
    FROM (
      SELECT
        ${journalEntry.sourceFoodId} AS source_food_id,
        ${journalEntry.quantity} AS quantity,
        ${journalEntry.portionName} AS portion_name,
        ${journalEntry.portionQuantity} AS portion_quantity,
        ROW_NUMBER() OVER (
          PARTITION BY ${journalEntry.sourceFoodId}
          ORDER BY ${journalEntry.createdAt} DESC, ${journalEntry.id} DESC
        ) AS rn
      FROM ${journalEntry}
      WHERE ${journalEntry.sourceFoodId} IS NOT NULL
        AND ${journalEntry.quantity} IS NOT NULL
        AND ${journalEntry.kind} = 'food'
    )
    WHERE rn = 1
  `);

  return new Map(
    rows.map((row) => [
      row.source_food_id,
      {
        quantity: row.quantity,
        portionName: row.portion_name,
        portionQuantity: row.portion_quantity,
      },
    ]),
  );
}

/**
 * Portions for every food, in one query, keyed by food.
 *
 * Needed because step two of the pre-fill chain asks whether the portion a
 * quantity was logged in still exists AND is still the same size — a slice
 * redefined from 25 g to 30 g must not silently turn a 50 g habit into 60 g.
 */
function portionsByFood(db: AppDatabase): Map<FoodId, Portion[]> {
  const byFood = new Map<FoodId, Portion[]>();

  for (const row of db
    .select({
      foodId: foodPortion.foodId,
      name: foodPortion.name,
      quantity: foodPortion.quantity,
    })
    .from(foodPortion)
    .orderBy(asc(foodPortion.position), asc(foodPortion.id))
    .all()) {
    const existing = byFood.get(row.foodId);
    if (existing === undefined) {
      byFood.set(row.foodId, [{ name: row.name, quantity: row.quantity }]);
    } else {
      existing.push({ name: row.name, quantity: row.quantity });
    }
  }

  return byFood;
}

/**
 * Attaches to each row the quantity a one-tap add would log.
 *
 * The two lookups are done ONCE for the whole page, then the pure chain runs
 * per row. Three queries for a list of any length, and no arithmetic outside
 * prefillQuantity.
 */
function withLastQuantity(
  db: AppDatabase,
  rows: readonly (ListRow & { displayRefQty: number })[],
): QuickAddFood[] {
  if (rows.length === 0) return [];

  const lastEntries = lastEntriesByFood(db);
  const portions = portionsByFood(db);

  return rows.map((row) => ({
    ...toListItem(row),
    lastQuantity: prefillQuantity(lastEntries.get(row.id) ?? null, {
      portions: portions.get(row.id) ?? [],
      displayRefQty: row.displayRefQty,
    }),
  }));
}

/** Favourites, alphabetically. The first half of quick access (specs 8.4a). */
export function readFavoriteFoods(db: AppDatabase): QuickAddFood[] {
  return withLastQuantity(
    db,
    db
      .select({ ...listColumns, displayRefQty: food.displayRefQty })
      .from(food)
      .where(eq(food.isFavorite, 1))
      .orderBy(sql`${food.name} COLLATE NOCASE`, asc(food.id))
      .all(),
  );
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
export function readRecentFoods(db: AppDatabase, limit = 20): QuickAddFood[] {
  const rows = db
    .select({
      ...listColumns,
      displayRefQty: food.displayRefQty,
      lastAt: sql<number | null>`max(${journalEntry.createdAt})`,
    })
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
    .all();

  return withLastQuantity(db, rows);
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
 *
 * The kind clause is slice 6's, and it must match lastEntriesByFood character
 * for character: an ingredient line inside a recipe is not a quantity anyone
 * chose for that food. See the long note there.
 */
export function readLastEntryForFood(db: AppDatabase, foodId: FoodId): LastEntry | null {
  const rows = db
    .select({
      quantity: journalEntry.quantity,
      portionName: journalEntry.portionName,
      portionQuantity: journalEntry.portionQuantity,
    })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.sourceFoodId, foodId),
        isNotNull(journalEntry.quantity),
        eq(journalEntry.kind, 'food'),
      ),
    )
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
