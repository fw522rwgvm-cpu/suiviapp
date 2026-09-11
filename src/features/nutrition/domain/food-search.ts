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
 * EVERY NON-ASCII CHARACTER IN THIS FILE IS WRITTEN AS AN ESCAPE, on purpose.
 * A fold table is the one place where a character mangled in transit — by an
 * editor, a terminal, a patch — produces code that still compiles, still runs,
 * and silently folds nothing. Escapes cannot be mangled into something that
 * looks right.
 */

/**
 * Whether the engine can decompose accented characters itself.
 *
 * Hermes is not Node. String.prototype.normalize needs Unicode normalisation
 * tables, which an embedded engine may reasonably leave out, and this code
 * cannot be run on the device from here to find out. The probe costs one
 * boolean and the table below covers French, which is the whole of V1; the
 * full range matters from slice 4, when Open Food Facts' worldwide scope
 * arrives.
 *
 * Written as a probe rather than a guess so that being wrong degrades the
 * search instead of throwing on the critical path.
 */
const CAN_NORMALIZE = typeof String.prototype.normalize === 'function';

/**
 * Two aligned strings rather than a map literal, so a test can assert they are
 * the same length — which catches the one mistake this shape invites.
 *
 * a-acute .. a-ring, c-cedilla, e-grave .. e-diaeresis, i-grave .. i-diaeresis,
 * n-tilde, o-grave .. o-tilde, u-grave .. u-diaeresis, y-acute, y-diaeresis.
 */
const ACCENTED =
  'àâäáãå' +
  'ç' +
  'èéêë' +
  'ìíîï' +
  'ñ' +
  'òóôöõ' +
  'ùúûü' +
  'ýÿ';

const PLAIN = 'aaaaaa' + 'c' + 'eeee' + 'iiii' + 'n' + 'ooooo' + 'uuuu' + 'yy';

/** The ligatures, the one case a single replacement letter cannot answer. */
const LIGATURES: readonly (readonly [string, string])[] = [
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['ß', 'ss'],
];

/** Combining Diacritical Marks: the block NFD decomposes an accent into. */
const COMBINING_MARKS = /[̀-ͯ]/g;

function foldByTable(lowered: string): string {
  let out = '';
  // Iterated by code point rather than by UTF-16 unit, so a character outside
  // the basic plane is carried through whole instead of split in half.
  for (const character of lowered) {
    const index = ACCENTED.indexOf(character);
    if (index !== -1) {
      out += PLAIN[index];
      continue;
    }
    const ligature = LIGATURES.find(([from]) => from === character);
    out += ligature === undefined ? character : ligature[1];
  }
  return out;
}

/** Exposed for the test that keeps the two halves of the table in step. */
export const FOLD_TABLE = { accented: ACCENTED, plain: PLAIN } as const;

/**
 * Lower-cased, stripped of diacritics, whitespace collapsed.
 *
 * So that "creme" finds "crème" and "crème" finds "creme" — asymmetry here
 * would be worse than no folding at all, because it would work often enough to
 * be trusted.
 *
 * The table runs even after NFD, because decomposition does not touch the
 * ligatures: NFD leaves the oe ligature exactly as it found it.
 *
 * THE SECOND PARAMETER EXISTS SO THE FALLBACK CAN BE TESTED, and that is not a
 * nicety. Node has String.prototype.normalize, so every test run takes the
 * first branch — leaving the branch that will actually run on the phone, if
 * Hermes turns out to lack it, as the only untested line in the search. That
 * is the same trap as a column no fixture ever fills: invisible until the day
 * it matters. Callers pass nothing; tests pass false.
 */
export function foldForSearch(value: string, canNormalize: boolean = CAN_NORMALIZE): string {
  const lowered = value.toLowerCase();
  const decomposed = canNormalize
    ? lowered.normalize('NFD').replace(COMBINING_MARKS, '')
    : lowered;

  return foldByTable(decomposed).replace(/\s+/g, ' ').trim();
}

export interface SearchableFood {
  name: string;
  brand: string | null;
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

  const brand = food.brand === null ? '' : foldForSearch(food.brand);
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
