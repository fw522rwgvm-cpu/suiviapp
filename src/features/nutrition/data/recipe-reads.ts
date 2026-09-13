import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { recipe, recipeIngredient, type FoodId } from '@/core/db/schema';

/**
 * Reads of the recipe domain (D8).
 *
 * Plain functions rather than hooks, so they run in Node against a real SQLite
 * file (D15). The hooks in recipe-queries.ts are thin wrappers over these.
 *
 * Nothing here imports a native module, and nothing here writes.
 */

/**
 * The recipes that would lose their live link to a food if it were deleted
 * (specs 5.3).
 *
 * Counted as DISTINCT RECIPES rather than ingredient lines, because that is
 * what the warning has to say: "used by 3 recipes" is a fact the user can
 * check, "used by 4 ingredient lines" is an implementation detail that happens
 * to be larger when one recipe uses a food twice.
 *
 * ## WHY THERE IS A WARNING AT ALL, WHEN DELETING A FOOD IS FREE ELSEWHERE
 *
 * Specs 5.3 reserves the named warning for deleting an EXERCISE — "la seule
 * suppression de l'application qui détruise réellement quelque chose" — and
 * slice 5 extended the pattern to day templates, at lower stakes. This is the
 * same shape again, and it earns its place for the reason the library's
 * existing confirmation does: it TEACHES something.
 *
 * What it teaches is not that data is lost, because none is: D5/R3 freezes
 * every ingredient line, so the recipes keep every figure they had. It is that
 * the LINK is lost — specs 5.3 says a recipe follows a food's edits because it
 * is a living object, and after this deletion those particular ingredients
 * stop following anything. Correcting the food later will no longer reach
 * them. That is worth one sentence, and it is never a refusal.
 */
export function countRecipesUsingFood(db: AppDatabase, foodId: FoodId): number {
  const rows = db
    .select({ total: sql<number>`count(distinct ${recipeIngredient.recipeId})` })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.foodId, foodId))
    .all();

  return rows[0]?.total ?? 0;
}

/**
 * The names of those recipes, in alphabetical order, for a warning that can
 * afford to be specific.
 *
 * Separate from the count rather than derived from it, because the count is
 * what the confirmation always needs and the names are what it shows only when
 * there are few enough to read. Loading a list to display a number would be
 * the more expensive half of the pair paying for the cheaper one.
 */
export function recipeNamesUsingFood(db: AppDatabase, foodId: FoodId): string[] {
  return db
    .selectDistinct({ name: recipe.name })
    .from(recipeIngredient)
    .innerJoin(recipe, eq(recipe.id, recipeIngredient.recipeId))
    .where(eq(recipeIngredient.foodId, foodId))
    .orderBy(recipe.name)
    .all()
    .map((row) => row.name);
}
