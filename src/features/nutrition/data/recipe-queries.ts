import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import {
  food,
  journalEntry,
  recipe,
  recipeIngredient,
  recipeStep,
  recipeTag,
  type RecipeId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  listRecipeTags,
  listRecipes,
  readQuickAccessRecipes,
  readRecipe,
  readRecipeDraft,
  readRecipeOccurrencePrefill,
} from './recipe-reads';
import {
  createRecipe,
  deleteRecipe,
  setRecipeFavorite,
  updateRecipe,
} from './recipe-writes';

/**
 * Reads are hooks; writes are the transactional functions of recipe-writes.ts,
 * wrapped here for the pending and error state a screen needs (D8).
 *
 * > No cache invalidation is written by hand: it goes through the change bus.
 *
 * So there is deliberately not a single onSuccess in this file either.
 *
 * ## EVERY READ HERE DECLARES `food`, AND IT HAS TO
 *
 * A recipe stores no macros: its total is summed from the live food rows on
 * every read (specs 8.6). So correcting a food changes what every one of these
 * queries answers, and a query that declared only the recipe tables would show
 * yesterday's figures after an edit the user made deliberately — on the very
 * path specs 8.5 calls the main way to compensate for unreliable data.
 *
 * That is specs 5.3's "modifier un aliment met bien à jour les recettes"
 * reaching the screen, and it costs exactly one word in a meta.
 */

export const recipeKeys = {
  all: ['nutrition', 'recipes'] as const,
  tags: ['nutrition', 'recipe-tags'] as const,
  one: (recipeId: RecipeId | null) => ['nutrition', 'recipe', recipeId] as const,
  draft: (recipeId: RecipeId | null) => ['nutrition', 'recipe-draft', recipeId] as const,
  quickAccess: ['nutrition', 'recipe-quick-access'] as const,
  prefill: (recipeId: RecipeId | null) => ['nutrition', 'recipe-prefill', recipeId] as const,
};

/** The tables a recipe's figures depend on, including the live foods. */
export const RECIPE_TABLES = [recipe, recipeIngredient, recipeStep, recipeTag, food] as const;

/**
 * Every recipe, in one cached list.
 *
 * THE SEARCH RUNS OVER THIS, in memory, with no further query (D16) — the same
 * arrangement useFoods has, and for the same reason: specs 8.6 asks for search
 * and tag filtering, and both are pure functions over a list that is already
 * loaded.
 */
export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.all,
    queryFn: () => listRecipes(getAppDatabase()),
    meta: readsFrom(...RECIPE_TABLES),
  });
}

/** Every distinct tag, for the filter row (specs 8.6). */
export function useRecipeTags() {
  return useQuery({
    queryKey: recipeKeys.tags,
    queryFn: () => listRecipeTags(getAppDatabase()),
    meta: readsFrom(recipeTag),
  });
}

export function useRecipe(recipeId: RecipeId | null) {
  return useQuery({
    queryKey: recipeKeys.one(recipeId),
    queryFn: () => (recipeId === null ? null : readRecipe(getAppDatabase(), recipeId)),
    enabled: recipeId !== null,
    meta: readsFrom(...RECIPE_TABLES),
  });
}

export function useRecipeDraft(recipeId: RecipeId | null) {
  return useQuery({
    queryKey: recipeKeys.draft(recipeId),
    queryFn: () => (recipeId === null ? null : readRecipeDraft(getAppDatabase(), recipeId)),
    enabled: recipeId !== null,
    meta: readsFrom(...RECIPE_TABLES),
  });
}

/**
 * Favourites then recents, for the add window (specs 8.4a).
 *
 * It declares journal_entry as well as the recipe tables, so logging a block
 * reorders quick access on its own — with nothing at the write site knowing
 * that quick access exists. The same arrangement useRecentFoods has.
 */
export function useQuickAccessRecipes() {
  return useQuery({
    queryKey: recipeKeys.quickAccess,
    queryFn: () => readQuickAccessRecipes(getAppDatabase()),
    meta: readsFrom(...RECIPE_TABLES, journalEntry),
  });
}

/**
 * What the occurrence screen opens on: the recipe and how much of it (8.6).
 *
 * It declares journal_entry as well as the recipe tables — the last amount
 * logged lives in a block's parent row, so logging one changes what this
 * answers, with nothing at the write site knowing the screen exists.
 */
export function useRecipeOccurrencePrefill(recipeId: RecipeId | null) {
  return useQuery({
    queryKey: recipeKeys.prefill(recipeId),
    queryFn: () =>
      recipeId === null ? null : readRecipeOccurrencePrefill(getAppDatabase(), recipeId),
    enabled: recipeId !== null,
    meta: readsFrom(...RECIPE_TABLES, journalEntry),
  });
}

export function useCreateRecipe() {
  return useMutation({
    mutationFn: (draft: Parameters<typeof createRecipe>[1]) =>
      Promise.resolve(createRecipe(getAppDatabase(), draft)),
  });
}

export function useUpdateRecipe() {
  return useMutation({
    mutationFn: (input: { recipeId: RecipeId; draft: Parameters<typeof updateRecipe>[2] }) =>
      Promise.resolve(updateRecipe(getAppDatabase(), input.recipeId, input.draft)),
  });
}

export function useDeleteRecipe() {
  return useMutation({
    mutationFn: (recipeId: RecipeId) =>
      Promise.resolve(deleteRecipe(getAppDatabase(), recipeId)),
  });
}

export function useSetRecipeFavorite() {
  return useMutation({
    mutationFn: (input: { recipeId: RecipeId; isFavorite: boolean }) =>
      Promise.resolve(setRecipeFavorite(getAppDatabase(), input.recipeId, input.isFavorite)),
  });
}
