import { foldForSearch } from '@/core/search/fold';

/**
 * Local search over the personal food database (D16).
 *
 * > Local search by a simple index, with no full-text engine. Full text is a
 * > fallback, to be switched on to a measurement, not on a hunch.
 *
 * WHAT ix_food_name ACTUALLY BUYS, stated plainly because the index's name
 * promises more than it delivers: ORDER BY, not this.
 *
 * LIKE '%something%' uses no index, ever. Even LIKE 'something%' would not use
 * that one — SQLite applies its LIKE optimisation only when the index's
 * collation matches the case_sensitive_like setting, which is off by default,
 * so a BINARY index is skipped outright.
 *
 * So the search is a pure function over the list of foods, which React Query
 * holds in one cached entry. At the few hundred rows D16 budgets for, that is
 * the fastest answer available — ZERO SQL per keystroke, where specs 8.4b asks
 * for personal results "instantly, on every keystroke" — and it is the only
 * way to get accent-insensitive matching at all: SQLite's NOCASE and lower()
 * are ASCII-only, and the alternative would be storing a folded copy of the
 * name, which D9 forbids as derived data.
 *
 * The day this stops being fast enough, one function in food-reads.ts changes
 * and nothing else does. That is the fallback D16 describes, switched on to a
 * measurement rather than to a hunch.
 *
 * ## THE FOLD MOVED TO core/search, THE RANKING DID NOT
 *
 * Slice 10 gave foldForSearch a second real user — exercises are searched by
 * name the way foods are — so it moved to core/search/fold.ts on the rule that
 * sends a component there at its second user. Its probe, its two branches and
 * its escape-written tables went with it; nothing about the behaviour changed.
 *
 * What stayed is everything below, and that is deliberate rather than
 * leftovers. A ranking belongs to what it ranks: this one puts a brand below a
 * name because a term matching a food's name is almost always the one meant,
 * and the strength search ranks a muscle and a piece of equipment instead.
 * Sharing the fold shares one problem; sharing the barème would have shared a
 * coincidence, and the first exercise that scored oddly would have been fixed
 * in a file the foods also read.
 */

/**
 * What this module needs to rank something: a name, and a brand if the thing
 * has one.
 *
 * THE BRAND IS OPTIONAL because slice 6 brought a second kind of entity into
 * this list. A recipe has a name and no brand — not a null brand, no brand at
 * all — and adding the column to RecipeListItem to satisfy a signature would
 * have been the view bending to the search rather than the other way round.
 *
 * Widening the shape is the smaller change and the honest one: the search
 * ranks a name first and a brand second, and "no brand" and "brand unknown"
 * score identically anyway.
 */
export interface SearchableFood {
  name: string;
  brand?: string | null;
}

/**
 * How well a food answers a term. Higher is better; 0 means it does not.
 *
 * Ranked rather than merely filtered because this list is the critical path:
 * specs 8.4 and D16 are about removing taps, and a food that starts with what
 * was typed sitting third in the list costs a scroll every single time.
 *
 * The brand is searched too — "danone" should find the yoghurt — but always
 * below the name, since a term matching a name is almost always the one meant.
 */
export function scoreFood(food: SearchableFood, foldedTerm: string): number {
  if (foldedTerm === '') return 1;

  const name = foldForSearch(food.name);
  if (name === foldedTerm) return 100;
  if (name.startsWith(foldedTerm)) return 80;
  // A word inside the name: "mie" should find "Pain de mie", which is the
  // common case for a French food name built as a phrase.
  if (name.includes(` ${foldedTerm}`)) return 60;
  if (name.includes(foldedTerm)) return 40;

  // Nullish rather than null: an entity with no brand column at all is the
  // recipe case, and calling the fold on undefined would throw.
  const brand = food.brand == null ? '' : foldForSearch(food.brand);
  if (brand.startsWith(foldedTerm)) return 20;
  if (brand.includes(foldedTerm)) return 10;

  return 0;
}

/**
 * The foods answering a term, best first, alphabetical within a rank.
 *
 * An empty term returns everything, alphabetically: that is the library's
 * resting state, so the screen needs no separate "browse" path.
 */
export function searchFoods<T extends SearchableFood>(
  foods: readonly T[],
  term: string,
): T[] {
  const folded = foldForSearch(term);

  return foods
    .map((food) => ({ food, score: scoreFood(food, folded) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Compared on the folded names, so that "Ananas" and "ananas" do not
        // sort either side of every capital letter — the same reason
        // ix_food_name is NOCASE.
        foldForSearch(a.food.name).localeCompare(foldForSearch(b.food.name)),
    )
    .map((entry) => entry.food);
}
