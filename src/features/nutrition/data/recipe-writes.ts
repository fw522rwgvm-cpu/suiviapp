import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import {
  food,
  recipe,
  recipeIngredient,
  recipeStep,
  recipeTag,
  type RecipeId,
  type RecipeIngredientId,
  type RecipeStepId,
} from '@/core/db/schema';
import { newId } from '@/core/id';
import { validateRecipeDraft, type RecipeDraft } from '../domain/recipe-draft';

/**
 * Writes to the recipe domain (D8, specs 8.6).
 *
 * > Reads are hooks. Writes are transactional functions carrying the business
 * > rules.
 *
 * Nothing here imports a native module, so all of it runs against a real
 * SQLite file in Node (D15). Every entry point takes a RecipeDraft rather than
 * row-shaped objects, so the validation happens on ONE path.
 *
 * NOTHING HERE WRITES A MACRO, and that is specs 8.6 rather than an omission:
 * a recipe's macros are always computed from its ingredients, so there is no
 * column to write them into and no chance of a stored total drifting from the
 * lines it came from.
 */

/**
 * An invalid draft reaching this layer is a caller bug, not an expected
 * failure: the editor disables its button on exactly these problems, and
 * conventions section 4 reserves return values for failures that are part of
 * the domain. Throwing also rolls the transaction back.
 */
function requireValid(draft: RecipeDraft): void {
  const problems = validateRecipeDraft(draft);
  if (problems.length > 0) {
    throw new Error(`Invalid recipe draft: ${JSON.stringify(problems)}`);
  }
}

/**
 * Refuses an ingredient whose unit disagrees with its food's base unit.
 *
 * THE ONE RULE NO CONSTRAINT CAN CARRY. ck_ingredient_unit keeps the column to
 * g and ml; it cannot see the food. An ingredient in millilitres pointing at a
 * food stored per 100 GRAMS would pair one unit's quantity with the other
 * unit's macros — specs 5.1 makes the units watertight precisely so that
 * cannot happen, and the number it produces would be wrong and entirely
 * plausible.
 *
 * Read inside the caller's transaction, so the answer cannot go stale between
 * the check and the write. Throws rather than returning a problem: by the time
 * a draft reaches here the editor has already chosen the food, and the unit
 * follows the food rather than being typed.
 */
function requireMatchingUnits(tx: AppDatabase, draft: RecipeDraft): void {
  for (const [index, ingredient] of draft.ingredients.entries()) {
    if (ingredient.foodId === null) continue;

    const rows = tx
      .select({ baseUnit: food.baseUnit })
      .from(food)
      .where(eq(food.id, ingredient.foodId))
      .all();

    const source = rows[0];
    if (source === undefined) {
      throw new Error(`Ingredient ${index} names a food that does not exist`);
    }
    if (source.baseUnit !== ingredient.unit) {
      throw new Error(
        `Ingredient ${index} is in ${ingredient.unit} but its food is in ${source.baseUnit}`,
      );
    }
  }
}

/**
 * Replaces a recipe's ingredients wholesale, inside the caller's transaction.
 *
 * DELETED AND REINSERTED RATHER THAN RECONCILED, the same decision
 * replacePortions took and for the same reason: nothing in the schema
 * references an ingredient row. A journal entry logged from this recipe
 * freezes everything it needs into its own columns (D5/R1) and keeps no link
 * to the line it came from, so letting the identifiers change on every save
 * costs nothing and removes a whole class of reconciliation.
 *
 * ## THE FROZEN CAPSULE IS WRITTEN BACK, AND THAT IS LOAD-BEARING
 *
 * A frozen line's values exist nowhere else: its food has been deleted. If
 * this wrote only the link, opening a recipe and saving it unchanged would
 * destroy the only copy of that food's macros, and the recipe's total would
 * move for no reason anyone could see — the silent kind of loss. So the draft
 * carries the capsule through the editor and it lands here untouched,
 * frozen_at included, because that stamp is when the freeze happened and not
 * when the recipe was last saved.
 */
function replaceIngredients(tx: AppDatabase, recipeId: RecipeId, draft: RecipeDraft): void {
  tx.delete(recipeIngredient).where(eq(recipeIngredient.recipeId, recipeId)).run();

  if (draft.ingredients.length === 0) return;

  tx.insert(recipeIngredient)
    .values(
      draft.ingredients.map((ingredient, position) => ({
        id: newId<RecipeIngredientId>(),
        recipeId,
        // Taken from the order of the list, not from the draft: the editor
        // reorders by moving rows, and a position carried on the line would be
        // a second source for the same fact.
        position,
        foodId: ingredient.foodId,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        frozenName: ingredient.frozen === null ? null : ingredient.name,
        frozenBaseUnit: ingredient.frozen?.baseUnit ?? null,
        frozenProtein100: ingredient.frozen?.reference.protein ?? null,
        frozenCarbs100: ingredient.frozen?.reference.carbs ?? null,
        frozenFat100: ingredient.frozen?.reference.fat ?? null,
        frozenKcal100: ingredient.frozen?.reference.kcal ?? null,
        frozenAt: ingredient.frozen?.at ?? null,
      })),
    )
    .run();
}

/**
 * Replaces the steps wholesale, for the reason the ingredients are replaced:
 * nothing references a step row.
 */
function replaceSteps(tx: AppDatabase, recipeId: RecipeId, draft: RecipeDraft): void {
  tx.delete(recipeStep).where(eq(recipeStep.recipeId, recipeId)).run();

  if (draft.steps.length === 0) return;

  tx.insert(recipeStep)
    .values(
      draft.steps.map((step, position) => ({
        id: newId<RecipeStepId>(),
        recipeId,
        position,
        text: step.text.trim(),
      })),
    )
    .run();
}

/**
 * Replaces the tags wholesale.
 *
 * Here the wholesale replacement is not merely convenient, it is the only
 * correct shape: the primary key IS (recipe_id, tag), so renaming a tag row by
 * row collides with itself the moment two tags are swapped — the same trap
 * ux_portion_food_name set for portions, one table along.
 */
function replaceTags(tx: AppDatabase, recipeId: RecipeId, draft: RecipeDraft): void {
  tx.delete(recipeTag).where(eq(recipeTag.recipeId, recipeId)).run();

  const tags = draft.tags.map((tag) => tag.trim()).filter((tag) => tag !== '');
  if (tags.length === 0) return;

  tx.insert(recipeTag)
    .values(tags.map((tag) => ({ recipeId, tag })))
    .run();
}

/** The columns both create and update write. */
function columnsOf(draft: RecipeDraft) {
  return {
    name: draft.name.trim(),
    prepMinutes: draft.prepMinutes,
    yieldType: draft.yieldType,
    yieldValue: draft.yieldValue,
  };
}

/**
 * `is_favorite` is deliberately absent from columnsOf, exactly as it is for a
 * food: it is set by its own one-tap action from the library list and from the
 * recipe's own star, and it takes effect at once. A form loaded a minute
 * earlier still holds whatever the flag was then, so writing it back on save
 * would quietly undo a tap nobody thought of as an edit (specs 8.5 v2.3,
 * applied here by the same reasoning).
 *
 * Creation is the exception and cannot be otherwise: a recipe that does not
 * exist yet has no row to flip.
 */
export function createRecipe(db: AppDatabase, draft: RecipeDraft): RecipeId {
  requireValid(draft);

  return db.transaction((tx) => {
    requireMatchingUnits(tx, draft);

    const id = newId<RecipeId>();
    const now = Date.now();

    tx.insert(recipe)
      .values({
        id,
        ...columnsOf(draft),
        isFavorite: draft.isFavorite ? (1 as const) : (0 as const),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    replaceIngredients(tx, id, draft);
    replaceSteps(tx, id, draft);
    replaceTags(tx, id, draft);

    return id;
  });
}

/**
 * Corrects a recipe, without any time limit (specs 5.3).
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH: past journal entries. A grouped block
 * froze its ingredient lines when it was logged (D5/R1), and specs 8.6 says
 * the recipe is never modified by an occurrence and — read the other way — an
 * occurrence is never modified by the recipe. Editing here changes what the
 * NEXT log will produce, and nothing that has already been eaten.
 */
export function updateRecipe(db: AppDatabase, recipeId: RecipeId, draft: RecipeDraft): void {
  requireValid(draft);

  db.transaction((tx) => {
    requireMatchingUnits(tx, draft);

    const updated = tx
      .update(recipe)
      .set({ ...columnsOf(draft), updatedAt: Date.now() })
      .where(eq(recipe.id, recipeId))
      .returning({ id: recipe.id })
      .all();

    if (updated.length === 0) {
      throw new Error(`No recipe ${recipeId} to update`);
    }

    replaceIngredients(tx, recipeId, draft);
    replaceSteps(tx, recipeId, draft);
    replaceTags(tx, recipeId, draft);
  });
}

/**
 * Deletes a recipe. Its ingredients, steps and tags go with it, by cascade.
 *
 * NEVER BLOCKED, and past entries are left intact (specs 5.3). Unlike a food,
 * this needs no freeze at all: a grouped block in the journal carries its
 * macros on its CHILDREN (D5/R2), each of which froze a food's reference when
 * it was logged. journal_entry.source_recipe_id carries no foreign key, so
 * there is nothing here that could cascade into history and nothing that could
 * refuse the deletion.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one, and the cascades are the database's own work.
 */
export function deleteRecipe(db: AppDatabase, recipeId: RecipeId): void {
  db.delete(recipe).where(eq(recipe.id, recipeId)).run();
}

/**
 * Marks or unmarks a favourite (specs 8.6 "favori").
 *
 * Its own function rather than a round trip through the editor, for the reason
 * setFoodFavorite is: it is a one-tap action from a list, and loading a whole
 * draft to flip one flag would reopen the door to saving a stale copy of
 * everything else.
 */
export function setRecipeFavorite(
  db: AppDatabase,
  recipeId: RecipeId,
  isFavorite: boolean,
): void {
  db.update(recipe)
    .set({ isFavorite: isFavorite ? 1 : 0, updatedAt: Date.now() })
    .where(eq(recipe.id, recipeId))
    .run();
}
