import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import {
  food,
  foodPortion,
  journalEntry,
  recipe,
  recipeIngredient,
  type FoodId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  listFoods,
  readFavoriteFoods,
  readFood,
  readFoodByBarcode,
  readFoodDraft,
  readQuantityPrefill,
  readRecentFoods,
} from './food-reads';
import { countRecipesUsingFood, recipeNamesUsingFood } from './recipe-reads';
import { createFood, deleteFood, setFoodFavorite, updateFood } from './food-writes';

/**
 * Reads are hooks; writes are the transactional functions of food-writes.ts,
 * wrapped here for the pending and error state a screen needs (D8).
 *
 * > No cache invalidation is written by hand: it goes through the change bus.
 *
 * So there is deliberately not a single onSuccess in this file either. Each
 * query declares, in its meta, the tables it reads — with the table objects
 * themselves, never strings — and the bus invalidates by predicate after a
 * write commits.
 *
 * Note which tables the recents and the pre-fill declare: both read
 * journal_entry as well as food, so logging a meal reorders quick access on
 * its own, with nothing at the write site knowing that quick access exists.
 */

export const foodKeys = {
  all: ['nutrition', 'foods'] as const,
  favorites: ['nutrition', 'food-favorites'] as const,
  recents: ['nutrition', 'food-recents'] as const,
  one: (foodId: FoodId | null) => ['nutrition', 'food', foodId] as const,
  draft: (foodId: FoodId | null) => ['nutrition', 'food-draft', foodId] as const,
  prefill: (foodId: FoodId | null) => ['nutrition', 'quantity-prefill', foodId] as const,
  byBarcode: (barcode: string | null) => ['nutrition', 'food-barcode', barcode] as const,
  recipeUses: (foodId: FoodId | null) => ['nutrition', 'food-recipe-uses', foodId] as const,
};

/**
 * Every food, in one cached list.
 *
 * THE SEARCH RUNS OVER THIS, in memory, with no further query (D16). Specs
 * 8.4b wants personal results on every keystroke, and at the few hundred rows
 * budgeted for, that is faster than any LIKE — see domain/food-search.ts for
 * why ix_food_name could not have served the search anyway.
 */
export function useFoods() {
  return useQuery({
    queryKey: foodKeys.all,
    queryFn: () => listFoods(getAppDatabase()),
    meta: readsFrom(food),
  });
}

export function useFavoriteFoods() {
  return useQuery({
    queryKey: foodKeys.favorites,
    queryFn: () => readFavoriteFoods(getAppDatabase()),
    meta: readsFrom(food),
  });
}

/** Foods most recently logged. Reads journal_entry, so logging reorders it. */
export function useRecentFoods(limit?: number) {
  return useQuery({
    queryKey: foodKeys.recents,
    queryFn: () => readRecentFoods(getAppDatabase(), limit),
    meta: readsFrom(food, journalEntry),
  });
}

/**
 * The first link of the scan chain: does the library already hold this product
 * (specs 8.5)?
 *
 * It usually does, for anything scanned twice — the automatic copy put it
 * there — and then the whole journey costs one indexed lookup and no network.
 * That is most of how the five-second target is met, and it is why this query
 * comes before the cache and before Open Food Facts rather than beside them.
 */
export function useFoodByBarcode(barcode: string | null) {
  return useQuery({
    queryKey: foodKeys.byBarcode(barcode),
    queryFn: () => (barcode === null ? null : readFoodByBarcode(getAppDatabase(), barcode)),
    enabled: barcode !== null && barcode !== '',
    meta: readsFrom(food),
  });
}

export function useFood(foodId: FoodId | null) {
  return useQuery({
    queryKey: foodKeys.one(foodId),
    queryFn: () => (foodId === null ? null : readFood(getAppDatabase(), foodId)),
    enabled: foodId !== null,
    meta: readsFrom(food, foodPortion),
  });
}

/** A stored food as the editor's form holds it (specs 5.3: no time limit). */
export function useFoodDraft(foodId: FoodId | null) {
  return useQuery({
    queryKey: foodKeys.draft(foodId),
    queryFn: () => (foodId === null ? null : readFoodDraft(getAppDatabase(), foodId)),
    enabled: foodId !== null,
    meta: readsFrom(food, foodPortion),
  });
}

/**
 * What the quantity screen opens on: the whole chain of specs 8.4, composed in
 * the read layer so the screen carries no rule of its own (D9).
 */
export function useQuantityPrefill(foodId: FoodId | null) {
  return useQuery({
    queryKey: foodKeys.prefill(foodId),
    queryFn: () => (foodId === null ? null : readQuantityPrefill(getAppDatabase(), foodId)),
    enabled: foodId !== null,
    meta: readsFrom(food, foodPortion, journalEntry),
  });
}

/**
 * Which recipes would lose their live link to this food if it were deleted
 * (specs 5.3).
 *
 * Read ahead of the confirmation rather than inside it, because an Alert
 * cannot wait for a query — and because the answer is wanted before the
 * destructive button is even offered, not after it is pressed.
 *
 * It declares both tables: renaming a recipe changes what the warning says,
 * and adding an ingredient changes whether there is one at all.
 */
export function useRecipesUsingFood(foodId: FoodId | null) {
  return useQuery({
    queryKey: foodKeys.recipeUses(foodId),
    queryFn: () => {
      if (foodId === null) return { count: 0, names: [] };
      const database = getAppDatabase();
      return {
        count: countRecipesUsingFood(database, foodId),
        names: recipeNamesUsingFood(database, foodId),
      };
    },
    enabled: foodId !== null,
    meta: readsFrom(recipe, recipeIngredient),
  });
}

export function useCreateFood() {
  return useMutation({
    mutationFn: (draft: Parameters<typeof createFood>[1]) =>
      Promise.resolve(createFood(getAppDatabase(), draft)),
  });
}

export function useUpdateFood() {
  return useMutation({
    mutationFn: (input: { foodId: FoodId; draft: Parameters<typeof updateFood>[2] }) =>
      Promise.resolve(updateFood(getAppDatabase(), input.foodId, input.draft)),
  });
}

export function useDeleteFood() {
  return useMutation({
    mutationFn: (foodId: FoodId) => Promise.resolve(deleteFood(getAppDatabase(), foodId)),
  });
}

export function useSetFoodFavorite() {
  return useMutation({
    mutationFn: (input: { foodId: FoodId; isFavorite: boolean }) =>
      Promise.resolve(setFoodFavorite(getAppDatabase(), input.foodId, input.isFavorite)),
  });
}
