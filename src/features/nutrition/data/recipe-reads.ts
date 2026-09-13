import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import {
  food,
  journalEntry,
  recipe,
  recipeIngredient,
  recipeStep,
  recipeTag,
  type BaseUnit,
  type FoodId,
  type RecipeId,
  type RecipeIngredientId,
  type RecipeStepId,
} from '@/core/db/schema';
import { ZERO_MACROS, type Macros } from '../domain/macros';
import { ingredientView, type IngredientView, type RecipeYield } from '../domain/recipe-macros';
import type { IngredientDraft, RecipeDraft, StepDraft } from '../domain/recipe-draft';
import { prefillRecipeQuantity } from '../domain/recipe-occurrence';

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

/**
 * The SQL half of the macro pair (D9, specs 8.6).
 *
 * COALESCE is the whole of how a frozen ingredient needs no special case: the
 * live value when the link is intact, the capsule when it is not. One
 * expression, no branch, and it reads as the sentence it implements.
 *
 * The LEFT JOIN matters as much: an INNER one would drop every frozen line,
 * and a recipe whose food was deleted would quietly lose calories — which is
 * precisely what specs 5.3 promises does not happen.
 */
const ingredientSum = {
  protein: sql<number | null>`sum(${recipeIngredient.quantity} * coalesce(${food.protein100}, ${recipeIngredient.frozenProtein100}) / 100.0)`,
  carbs: sql<number | null>`sum(${recipeIngredient.quantity} * coalesce(${food.carbs100}, ${recipeIngredient.frozenCarbs100}) / 100.0)`,
  fat: sql<number | null>`sum(${recipeIngredient.quantity} * coalesce(${food.fat100}, ${recipeIngredient.frozenFat100}) / 100.0)`,
  kcal: sql<number | null>`sum(${recipeIngredient.quantity} * coalesce(${food.kcal100}, ${recipeIngredient.frozenKcal100}) / 100.0)`,
};

interface SumRow {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  kcal: number | null;
}

function toMacros(row: SumRow | undefined): Macros {
  if (row === undefined) return ZERO_MACROS;
  return {
    protein: row.protein ?? 0,
    carbs: row.carbs ?? 0,
    fat: row.fat ?? 0,
    kcal: row.kcal ?? 0,
  };
}

export interface RecipeListItem {
  id: RecipeId;
  name: string;
  prepMinutes: number | null;
  yield: RecipeYield;
  isFavorite: boolean;
  tags: string[];
  ingredientCount: number;
  /** Whether any line has lost its live link (specs 5.3). */
  hasFrozenIngredient: boolean;
  /** The whole recipe, summed in SQL. Derived, never stored (D9). */
  total: Macros;
}

/**
 * Every recipe, with its total, in TWO queries whatever the library holds.
 *
 * Not one per recipe, and the reason is the one slice 4 collected when it
 * extended the quantity from twenty recents to a whole library: a read per row
 * is a cost capped at twenty and uncapped at several hundred, on a path D16
 * budgets in tenths of a second.
 *
 * A recipe with no ingredients comes back at zero rather than being dropped —
 * the LEFT JOIN again. It cannot be saved through the editor (the draft
 * validator refuses it), but an imported archive could carry one, and a
 * library that silently omitted it would be a library the user could not use
 * to find and fix it.
 */
export function listRecipes(db: AppDatabase): RecipeListItem[] {
  const rows = db
    .select({
      id: recipe.id,
      name: recipe.name,
      prepMinutes: recipe.prepMinutes,
      yieldType: recipe.yieldType,
      yieldValue: recipe.yieldValue,
      isFavorite: recipe.isFavorite,
      ingredientCount: sql<number>`count(${recipeIngredient.id})`,
      frozenCount: sql<number>`sum(case when ${recipeIngredient.id} is not null and ${recipeIngredient.foodId} is null then 1 else 0 end)`,
      ...ingredientSum,
    })
    .from(recipe)
    .leftJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
    .leftJoin(food, eq(food.id, recipeIngredient.foodId))
    .groupBy(recipe.id)
    .orderBy(sql`${recipe.name} collate nocase`)
    .all();

  const tags = tagsByRecipe(db);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prepMinutes: row.prepMinutes,
    yield: { type: row.yieldType, value: row.yieldValue },
    isFavorite: row.isFavorite === 1,
    tags: tags.get(row.id) ?? [],
    ingredientCount: row.ingredientCount,
    hasFrozenIngredient: (row.frozenCount ?? 0) > 0,
    total: toMacros(row),
  }));
}

/** Tags for every recipe, in one query, keyed by recipe. */
function tagsByRecipe(db: AppDatabase): Map<RecipeId, string[]> {
  const rows = db
    .select({ recipeId: recipeTag.recipeId, tag: recipeTag.tag })
    .from(recipeTag)
    .orderBy(asc(recipeTag.tag))
    .all();

  const byRecipe = new Map<RecipeId, string[]>();
  for (const row of rows) {
    const existing = byRecipe.get(row.recipeId);
    if (existing === undefined) {
      byRecipe.set(row.recipeId, [row.tag]);
    } else {
      existing.push(row.tag);
    }
  }
  return byRecipe;
}

/** Every distinct tag in the library, for the filter row (specs 8.6). */
export function listRecipeTags(db: AppDatabase): string[] {
  return db
    .selectDistinct({ tag: recipeTag.tag })
    .from(recipeTag)
    .orderBy(sql`${recipeTag.tag} collate nocase`)
    .all()
    .map((row) => row.tag);
}

export interface RecipeStepView {
  id: RecipeStepId;
  position: number;
  text: string;
}

export interface RecipeIngredientView extends IngredientView {
  id: RecipeIngredientId;
  position: number;
  foodId: FoodId | null;
}

export interface RecipeView {
  id: RecipeId;
  name: string;
  prepMinutes: number | null;
  yield: RecipeYield;
  isFavorite: boolean;
  tags: string[];
  steps: RecipeStepView[];
  ingredients: RecipeIngredientView[];
  /**
   * Summed HERE IN TYPESCRIPT from the lines above, not read back out of SQL.
   *
   * The second half of the pair, and deliberate rather than accidental: a
   * screen showing a recipe already holds every ingredient, so asking SQL to
   * sum them again would be a second query AND a second answer. The two
   * implementations are held to each other by a test rather than by care —
   * see tests/nutrition/recipe-macros.test.ts.
   */
  total: Macros;
}

/** The full ingredient projection, live and frozen side by side. */
const ingredientColumns = {
  id: recipeIngredient.id,
  position: recipeIngredient.position,
  foodId: recipeIngredient.foodId,
  quantity: recipeIngredient.quantity,
  unit: recipeIngredient.unit,
  liveName: food.name,
  liveBaseUnit: food.baseUnit,
  liveProtein100: food.protein100,
  liveCarbs100: food.carbs100,
  liveFat100: food.fat100,
  liveKcal100: food.kcal100,
  frozenName: recipeIngredient.frozenName,
  frozenBaseUnit: recipeIngredient.frozenBaseUnit,
  frozenProtein100: recipeIngredient.frozenProtein100,
  frozenCarbs100: recipeIngredient.frozenCarbs100,
  frozenFat100: recipeIngredient.frozenFat100,
  frozenKcal100: recipeIngredient.frozenKcal100,
  frozenAt: recipeIngredient.frozenAt,
};

interface IngredientRow {
  id: RecipeIngredientId;
  position: number;
  foodId: FoodId | null;
  quantity: number;
  unit: BaseUnit;
  liveName: string | null;
  liveBaseUnit: BaseUnit | null;
  liveProtein100: number | null;
  liveCarbs100: number | null;
  liveFat100: number | null;
  liveKcal100: number | null;
  frozenName: string | null;
  frozenBaseUnit: BaseUnit | null;
  frozenProtein100: number | null;
  frozenCarbs100: number | null;
  frozenFat100: number | null;
  frozenKcal100: number | null;
  frozenAt: number | null;
}

/** All four or none, the rule day-reads.ts already applies to an entry. */
function referenceOf(
  protein: number | null,
  carbs: number | null,
  fat: number | null,
  kcal: number | null,
): Macros | null {
  return protein !== null && carbs !== null && fat !== null && kcal !== null
    ? { protein, carbs, fat, kcal }
    : null;
}

function readIngredientRows(db: AppDatabase, recipeId: RecipeId): IngredientRow[] {
  return db
    .select(ingredientColumns)
    .from(recipeIngredient)
    .leftJoin(food, eq(food.id, recipeIngredient.foodId))
    .where(eq(recipeIngredient.recipeId, recipeId))
    .orderBy(asc(recipeIngredient.position), asc(recipeIngredient.id))
    .all();
}

function toIngredientView(row: IngredientRow): RecipeIngredientView | null {
  const view = ingredientView({
    foodId: row.foodId,
    quantity: row.quantity,
    unit: row.unit,
    liveName: row.liveName,
    liveBaseUnit: row.liveBaseUnit,
    liveReference: referenceOf(
      row.liveProtein100,
      row.liveCarbs100,
      row.liveFat100,
      row.liveKcal100,
    ),
    frozenName: row.frozenName,
    frozenBaseUnit: row.frozenBaseUnit,
    frozenReference: referenceOf(
      row.frozenProtein100,
      row.frozenCarbs100,
      row.frozenFat100,
      row.frozenKcal100,
    ),
  });

  if (view === null) return null;
  return { ...view, id: row.id, position: row.position, foodId: row.foodId };
}

/**
 * Summed from the lines rather than through recipeTotal, so that RecipeView's
 * own figure and the domain function are two spellings of ONE expression: the
 * test compares recipeTotal against the SQL, and this has to be the same thing
 * as recipeTotal or that comparison proves nothing about what a screen shows.
 */
function sumIngredientTotals(ingredients: readonly IngredientView[]): Macros {
  return ingredients.reduce(
    (running, ingredient) => ({
      protein: running.protein + ingredient.total.protein,
      carbs: running.carbs + ingredient.total.carbs,
      fat: running.fat + ingredient.total.fat,
      kcal: running.kcal + ingredient.total.kcal,
    }),
    ZERO_MACROS,
  );
}

/** One recipe, whole. Null once it has been deleted. */
export function readRecipe(db: AppDatabase, recipeId: RecipeId): RecipeView | null {
  const rows = db
    .select({
      id: recipe.id,
      name: recipe.name,
      prepMinutes: recipe.prepMinutes,
      yieldType: recipe.yieldType,
      yieldValue: recipe.yieldValue,
      isFavorite: recipe.isFavorite,
    })
    .from(recipe)
    .where(eq(recipe.id, recipeId))
    .all();

  const row = rows[0];
  if (row === undefined) return null;

  const ingredients = readIngredientRows(db, recipeId)
    .map(toIngredientView)
    .filter((view): view is RecipeIngredientView => view !== null);

  const steps = db
    .select({ id: recipeStep.id, position: recipeStep.position, text: recipeStep.text })
    .from(recipeStep)
    .where(eq(recipeStep.recipeId, recipeId))
    .orderBy(asc(recipeStep.position), asc(recipeStep.id))
    .all();

  const tags = db
    .select({ tag: recipeTag.tag })
    .from(recipeTag)
    .where(eq(recipeTag.recipeId, recipeId))
    .orderBy(asc(recipeTag.tag))
    .all()
    .map((tagRow) => tagRow.tag);

  return {
    id: row.id,
    name: row.name,
    prepMinutes: row.prepMinutes,
    yield: { type: row.yieldType, value: row.yieldValue },
    isFavorite: row.isFavorite === 1,
    tags,
    steps,
    ingredients,
    total: sumIngredientTotals(ingredients),
  };
}

/**
 * A recipe in the shape the editor holds (specs 8.6).
 *
 * The frozen capsule travels into the draft, because recipe-writes replaces
 * ingredients wholesale and a frozen line's values exist nowhere else. Drop
 * them here and opening a recipe then saving it would delete the only copy of
 * a deleted food's macros — see the note on IngredientDraft.
 */
export function readRecipeDraft(db: AppDatabase, recipeId: RecipeId): RecipeDraft | null {
  const view = readRecipe(db, recipeId);
  if (view === null) return null;

  const frozenAt = new Map(
    readIngredientRows(db, recipeId).map((row) => [row.id, row.frozenAt]),
  );

  const ingredients: IngredientDraft[] = view.ingredients.map((ingredient) => ({
    id: ingredient.id,
    foodId: ingredient.foodId,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    frozen: ingredient.frozen
      ? {
          baseUnit: ingredient.unit,
          reference: ingredient.reference,
          at: frozenAt.get(ingredient.id) ?? null,
        }
      : null,
  }));

  const steps: StepDraft[] = view.steps.map((step) => ({ id: step.id, text: step.text }));

  return {
    name: view.name,
    prepMinutes: view.prepMinutes,
    yieldType: view.yield.type,
    yieldValue: view.yield.value,
    isFavorite: view.isFavorite,
    tags: view.tags,
    steps,
    ingredients,
  };
}

/**
 * Recipes for quick access: favourites first, then recently logged (specs
 * 8.4a).
 *
 * > Recettes : favorites d'abord, puis récentes
 *
 * WORD FOR WORD THE FOODS RULE, not the meals rule — 8.4a says "favoris
 * d'abord, puis récents" of foods and only "récents" of meals. So recipes
 * follow foods: choosing one fills the basket rather than writing and closing,
 * and the exception slice 5 made for a recent meal does not extend here.
 *
 * "Recent" is ordered by when the BLOCK WAS WRITTEN, not by the day it belongs
 * to — the rule slice 3 settled for foods and slice 5 reused for meals: logging
 * yesterday's dinner this morning makes it the most recent thing you did.
 * created_at is nullable in the frozen schema, so id is both the tie-break and
 * the fallback, ULIDs sorting by creation time.
 *
 * A favourite that has never been logged still appears, at the top, with
 * nothing said about when it last was. A recipe that is both is listed once:
 * the favourites are removed from the recents rather than shown twice.
 */
export function readQuickAccessRecipes(
  db: AppDatabase,
  limit = 10,
): { favorites: RecipeListItem[]; recents: RecipeListItem[] } {
  const all = listRecipes(db);
  const byId = new Map(all.map((item) => [item.id, item]));

  const favorites = all.filter((item) => item.isFavorite);
  const favoriteIds = new Set(favorites.map((item) => item.id));

  const logged = db
    .select({ recipeId: journalEntry.sourceRecipeId })
    .from(journalEntry)
    .where(
      and(eq(journalEntry.kind, 'recipe'), isNotNull(journalEntry.sourceRecipeId)),
    )
    .groupBy(journalEntry.sourceRecipeId)
    .orderBy(
      sql`max(${journalEntry.createdAt}) desc`,
      sql`max(${journalEntry.id}) desc`,
    )
    .all();

  const recents: RecipeListItem[] = [];
  for (const row of logged) {
    if (row.recipeId === null || favoriteIds.has(row.recipeId)) continue;
    const item = byId.get(row.recipeId);
    // A block whose recipe has since been deleted: the entry survives (specs
    // 5.2) but there is nothing to offer again.
    if (item === undefined) continue;
    recents.push(item);
    if (recents.length >= limit) break;
  }

  return { favorites, recents };
}

/**
 * The last amount of a recipe that was logged, in the terms of its yield.
 *
 * The parent row of a grouped block holds it — portions or grams, matching the
 * recipe's yield at the time — and nothing else does: a recipe is a living
 * object that may have changed its yield since, so the entry is the only
 * record of what was actually eaten.
 *
 * Ordered by created_at and THEN BY id, which is not belt and braces: the
 * column is nullable in the frozen schema, so an imported archive can hold
 * NULLs there, and SQLite sorts NULLs last on a descending order — quietly
 * handing back the oldest row instead of the newest. Identifiers are ULIDs and
 * therefore sort by creation time, so id is both a correct tie-breaker and a
 * working fallback.
 *
 * NO INDEX BEHIND IT, and that is still the slice-6 deferral rather than an
 * oversight. ix_entry_source_recipe would mirror ix_entry_source_food, and the
 * rule says an index is the one part of a migration that can always be added
 * later. This one scans a journal, on a path D16 budgets in tenths of a
 * second; adding a migration for symmetry alone is what this project declines.
 * The day a real history makes it measurable, it is one CREATE INDEX.
 */
export function readLastRecipeQuantity(db: AppDatabase, recipeId: RecipeId): number | null {
  const rows = db
    .select({ quantity: journalEntry.quantity })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.sourceRecipeId, recipeId),
        eq(journalEntry.kind, 'recipe'),
        isNotNull(journalEntry.quantity),
      ),
    )
    .orderBy(desc(journalEntry.createdAt), desc(journalEntry.id))
    .limit(1)
    .all();

  return rows[0]?.quantity ?? null;
}

/**
 * What the occurrence screen opens on: the whole chain, composed in the read
 * layer so the screen carries no rule of its own (D9).
 *
 * Null once the recipe is gone, the shape readQuantityPrefill already has.
 */
export function readRecipeOccurrencePrefill(
  db: AppDatabase,
  recipeId: RecipeId,
): { recipe: RecipeView; consumed: number } | null {
  const view = readRecipe(db, recipeId);
  if (view === null) return null;

  return {
    recipe: view,
    consumed: prefillRecipeQuantity(readLastRecipeQuantity(db, recipeId), view.yield.type),
  };
}
