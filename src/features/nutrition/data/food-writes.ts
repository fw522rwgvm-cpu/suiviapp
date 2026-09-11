import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { food, foodPortion, type FoodId, type FoodPortionId } from '@/core/db/schema';
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

/** Macros and the flags, shared by create and update. */
function columnsOf(draft: FoodDraft) {
  const canonical = canonicalMacrosOf(draft);
  const brand = (draft.brand ?? '').trim();

  return {
    name: draft.name.trim(),
    // Empty and absent are the same thing to a reader and two different things
    // in the database. Absent is the honest one.
    brand: brand === '' ? null : brand,
    source: draft.source,
    baseUnit: draft.baseUnit,
    protein100: canonical.protein,
    carbs100: canonical.carbs,
    fat100: canonical.fat,
    kcal100: canonical.kcal,
    displayRefQty: draft.refQty,
    isFavorite: draft.isFavorite ? (1 as const) : (0 as const),
  };
}

export function createFood(db: AppDatabase, draft: FoodDraft): FoodId {
  requireValid(draft);

  return db.transaction((tx) => {
    const id = newId<FoodId>();
    const now = Date.now();

    tx.insert(food)
      .values({ id, ...columnsOf(draft), createdAt: now, updatedAt: now })
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
 * Deletes a food. Its portions go with it, by cascade.
 *
 * NEVER BLOCKED, and past entries are left intact (specs 5.3). That holds by
 * construction rather than by care: journal_entry.source_food_id carries no
 * foreign key, so there is nothing here that could cascade into history and
 * nothing that could refuse the deletion. See the note in the schema.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one, and the cascade is the database's own work.
 */
export function deleteFood(db: AppDatabase, foodId: FoodId): void {
  db.delete(food).where(eq(food.id, foodId)).run();
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
