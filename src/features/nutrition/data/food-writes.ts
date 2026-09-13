import { and, eq, ne } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import {
  food,
  foodPortion,
  recipeIngredient,
  type FoodId,
  type FoodPortionId,
} from '@/core/db/schema';
import { newId } from '@/core/id';
import {
  canonicalMacrosOf,
  validateFoodDraft,
  type FoodDraft,
} from '../domain/food-draft';

/**
 * Writes to the personal food database (D8, specs 8.5).
 *
 * > Reads are hooks. Writes are transactional functions carrying the business
 * > rules.
 *
 * Nothing here imports a native module, so all of it runs against a real
 * SQLite file in Node (D15).
 *
 * Every one of these takes a FoodDraft rather than a row-shaped object, so the
 * canonical conversion and the validation happen on ONE path. Slice 4 adds a
 * second caller — a product copied from Open Food Facts — and it will come
 * through this same door rather than assembling rows of its own and meeting a
 * private approximation of the rules.
 */

/**
 * An invalid draft reaching this layer is a caller bug, not an expected
 * failure: the editor disables its button on exactly these problems, and
 * conventions section 4 reserves return values for failures that are part of
 * the domain. Throwing also rolls the transaction back.
 */
function requireValid(draft: FoodDraft): void {
  const problems = validateFoodDraft(draft);
  if (problems.length > 0) {
    throw new Error(`Invalid food draft: ${JSON.stringify(problems)}`);
  }
}

/**
 * Replaces a food's portions wholesale, inside the caller's transaction.
 *
 * DELETED AND REINSERTED RATHER THAN RECONCILED ROW BY ROW, and that is a
 * correctness decision rather than a shortcut.
 *
 * ux_portion_food_name is unique on (food_id, name). If the user swaps two
 * names in one edit — the slice becomes the bowl and the bowl becomes the
 * slice — then any row-by-row update collides on whichever it writes first,
 * because the other row still holds that name. The alternatives are a
 * two-phase rename through temporary names, or ordering the updates by
 * analysing the permutation. Both are machinery in service of preserving
 * identifiers that nothing in the schema references: a journal entry freezes a
 * portion's name and size into its own columns (D5/R1) and holds no link to
 * the row it came from.
 *
 * So the identifiers are allowed to change on every save, and the swap case
 * stops existing.
 */
function replacePortions(tx: AppDatabase, foodId: FoodId, draft: FoodDraft): void {
  tx.delete(foodPortion).where(eq(foodPortion.foodId, foodId)).run();

  if (draft.portions.length === 0) return;

  tx.insert(foodPortion)
    .values(
      draft.portions.map((portion, position) => ({
        id: newId<FoodPortionId>(),
        foodId,
        name: portion.name,
        quantity: portion.quantity,
        // Taken from the order of the list, not from the draft: the screen
        // reorders by moving rows, and a position carried on the draft would
        // be a second source for the same fact.
        position,
      })),
    )
    .run();
}

/**
 * The columns both create and update write.
 *
 * `is_favorite` IS NOT ONE OF THEM, and that is the point of the split. It is
 * set by its own one-tap action, from the library list and from the editor's
 * own star, and it takes effect at once -- so a form that had loaded the food
 * a minute earlier still holds whatever the flag was then. Writing it back on
 * save would quietly undo a tap nobody thought of as an edit.
 *
 * Creation is the exception, and cannot be otherwise: a food that does not
 * exist yet has no row to flip.
 */
function columnsOf(draft: FoodDraft) {
  const canonical = canonicalMacrosOf(draft);
  const brand = (draft.brand ?? '').trim();
  const barcode = (draft.barcode ?? '').trim();

  return {
    name: draft.name.trim(),
    // Empty and absent are the same thing to a reader and two different things
    // in the database. Absent is the honest one.
    brand: brand === '' ? null : brand,
    /**
     * The same rule, and here it is load-bearing rather than tidy: ONE empty
     * string would take the slot in ux_food_barcode and refuse every later
     * food that also had none. NULLs are distinct in a unique index; empty
     * strings are not.
     */
    barcode: barcode === '' ? null : barcode,
    source: draft.source,
    baseUnit: draft.baseUnit,
    protein100: canonical.protein,
    carbs100: canonical.carbs,
    fat100: canonical.fat,
    kcal100: canonical.kcal,
    displayRefQty: draft.refQty,
  };
}

/**
 * The id of the food already holding this barcode, if any.
 *
 * Read inside the caller's transaction so the answer cannot go stale between
 * the check and the write.
 */
export function findFoodByBarcode(
  tx: AppDatabase,
  barcode: string,
  exceptId: FoodId | null = null,
): FoodId | null {
  const rows = tx
    .select({ id: food.id })
    .from(food)
    .where(
      exceptId === null
        ? eq(food.barcode, barcode)
        : and(eq(food.barcode, barcode), ne(food.id, exceptId)),
    )
    .all();

  return rows[0]?.id ?? null;
}

/**
 * Refuses a second food for one barcode, BEFORE the index does.
 *
 * ux_food_barcode already makes this impossible, and that is the point: left
 * to the index, the failure is a SQLite error naming a constraint, thrown from
 * inside a basket transaction that then rolls a whole meal back. Checking
 * first gives a sentence about the actual problem.
 *
 * This is a genuine conflict rather than an odd value, so it throws where the
 * macros deliberately do not. Specs 8.5 requires unreliable VALUES to be
 * marked and never refused; it says nothing about two foods claiming the same
 * product, which is simply wrong.
 */
function requireFreeBarcode(
  tx: AppDatabase,
  barcode: string | null,
  exceptId: FoodId | null,
): void {
  if (barcode === null) return;

  const taken = findFoodByBarcode(tx, barcode, exceptId);
  if (taken !== null) {
    throw new Error(`Barcode ${barcode} already belongs to food ${taken}`);
  }
}

export function createFood(db: AppDatabase, draft: FoodDraft): FoodId {
  requireValid(draft);

  return db.transaction((tx) => {
    const id = newId<FoodId>();
    const now = Date.now();
    requireFreeBarcode(tx, columnsOf(draft).barcode, null);

    tx.insert(food)
      .values({
        id,
        ...columnsOf(draft),
        isFavorite: draft.isFavorite ? (1 as const) : (0 as const),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    replacePortions(tx, id, draft);

    return id;
  });
}

/**
 * Corrects a food, without any time limit (specs 5.3).
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH: past journal entries. An entry froze
 * its reference at the moment it was logged (D5/R1, specs 5.2), so editing a
 * food changes nothing that has already been eaten. Recipes, which specs 5.3
 * says DO follow a food's edits because a recipe is a living object rather
 * than history, arrive in slice 6 — and they will follow by recomputing from
 * the link they keep, not by anything written here.
 */
export function updateFood(db: AppDatabase, foodId: FoodId, draft: FoodDraft): void {
  requireValid(draft);

  db.transaction((tx) => {
    // Excluding this food itself: saving a form without touching the barcode
    // must not report the food as conflicting with itself.
    requireFreeBarcode(tx, columnsOf(draft).barcode, foodId);

    const updated = tx
      .update(food)
      .set({ ...columnsOf(draft), updatedAt: Date.now() })
      .where(eq(food.id, foodId))
      .returning({ id: food.id })
      .all();

    if (updated.length === 0) {
      throw new Error(`No food ${foodId} to update`);
    }

    replacePortions(tx, foodId, draft);
  });
}

/**
 * Freezes every ingredient line pointing at a food, and breaks their links
 * (D5/R3, specs 5.3).
 *
 * > La ligne d'ingrédient est conservée sous forme figée : nom et macros
 * > gelés, plus de lien vers la base.
 *
 * ONE UPDATE, not a loop, and that is the whole design. R3 requires the fill
 * and the unlink to be atomic; a loop could stop halfway and leave a recipe
 * with some ingredients frozen and some pointing at a food about to vanish.
 * With a single statement a half-freeze is not merely unlikely, it is
 * inexpressible.
 *
 * The food is read first, INSIDE the caller's transaction, so the values
 * cannot go stale between the read and the write — and so the capsule holds
 * exactly what readFood returns, which is the same shape every other reader of
 * this food already sees. A correlated subquery would have been one statement
 * instead of two, and would have put raw SQL in the write layer to buy an
 * atomicity the transaction already provides.
 *
 * Not exported, for the reason ensureMaterialized and ensureOffFood are not:
 * called on its own it would strip a recipe of its live links for no reason at
 * all, and a forced quit between it and the deletion that justified it would
 * leave the library holding a food that no recipe can follow any more. It is
 * the first statement of the only write that needs it.
 */
function freezeIngredientsOf(tx: AppDatabase, foodId: FoodId, now: number): void {
  const rows = tx
    .select({
      name: food.name,
      baseUnit: food.baseUnit,
      protein100: food.protein100,
      carbs100: food.carbs100,
      fat100: food.fat100,
      kcal100: food.kcal100,
    })
    .from(food)
    .where(eq(food.id, foodId))
    .all();

  const source = rows[0];
  // Nothing to freeze against. Deleting a food that is not there is not an
  // error — the caller may simply be late — and writing a capsule of nulls
  // would violate ck_ingredient_link, correctly.
  if (source === undefined) return;

  tx.update(recipeIngredient)
    .set({
      frozenName: source.name,
      frozenBaseUnit: source.baseUnit,
      frozenProtein100: source.protein100,
      frozenCarbs100: source.carbs100,
      frozenFat100: source.fat100,
      /** Kept as given, never recomputed from P/C/F (specs 5.1). */
      frozenKcal100: source.kcal100,
      frozenAt: now,
      // Last in the object and irrelevant that it is: SQLite evaluates every
      // SET expression against the row as it was before the statement, so the
      // order of assignments cannot matter.
      foodId: null,
    })
    .where(eq(recipeIngredient.foodId, foodId))
    .run();
}

/**
 * Deletes a food. Its portions go with it, by cascade; its ingredient lines
 * survive, frozen.
 *
 * NEVER BLOCKED, and past entries are left intact (specs 5.3). The journal
 * half holds by construction rather than by care: journal_entry.source_food_id
 * carries no foreign key, so nothing here can cascade into history and nothing
 * can refuse the deletion.
 *
 * ## THE RECIPE HALF IS THE OPPOSITE, AND IT IS WHY THIS IS NO LONGER ONE LINE
 *
 * recipe_ingredient.food_id DOES carry a foreign key, with no ON DELETE clause
 * — so NO ACTION, which SQLite enforces immediately. Delete a food an
 * ingredient points at without freezing first and SQLite refuses, which would
 * be exactly the blocked deletion specs 5.3 says never happens.
 *
 * It never happens because the freeze runs first, in this transaction. So the
 * constraint is not an obstacle to work around: it is the only thing that
 * PROVES the freeze ran. Collapse this back into a single delete one day and
 * the database refuses loudly, instead of a recipe quietly losing its macros.
 * That is the trade slice 6 took, and the schema note on food_id records it.
 *
 * ON DELETE SET NULL was the alternative, and it is refused for precisely the
 * reason D5/R3 exists: it breaks the link WITHOUT filling the capsule, leaving
 * an ingredient with no name and no macros where specs 5.3 promises both.
 */
export function deleteFood(db: AppDatabase, foodId: FoodId): void {
  db.transaction((tx) => {
    freezeIngredientsOf(tx, foodId, Date.now());
    tx.delete(food).where(eq(food.id, foodId)).run();
  });
}

/**
 * Marks or unmarks a favourite (specs 8.5).
 *
 * Its own function rather than a round trip through the editor, because it is
 * a one-tap action from a list — and loading a whole draft to flip one flag
 * would reopen the door to saving a stale copy of everything else.
 */
export function setFoodFavorite(
  db: AppDatabase,
  foodId: FoodId,
  isFavorite: boolean,
): void {
  db.update(food)
    .set({ isFavorite: isFavorite ? 1 : 0, updatedAt: Date.now() })
    .where(eq(food.id, foodId))
    .run();
}
