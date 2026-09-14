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
 * EVERY NON-ASCII CHARACTER IN THE FOLD TABLES IS WRITTEN AS AN ESCAPE, on
 * purpose. (The prose keeps its punctuation: a mangled em dash in a comment
 * costs nothing, where a mangled letter in a table costs the fold.)
 * A fold table is the one place where a character mangled in transit — by an
 * editor, a terminal, a patch — produces code that still compiles, still runs,
 * and silently folds nothing. Escapes cannot be mangled into something that
 * looks right.
 */

/**
 * What String.prototype.normalize actually does on this engine.
 *
 * HERMES IS NOT NODE, and the difference cannot be observed from a development
 * machine. Unicode normalisation needs decomposition tables, which an embedded
 * engine may reasonably leave out. The table below covers French, which is the
 * whole of V1; the full range starts to matter in slice 4, when Open Food
 * Facts brings a worldwide catalogue.
 *
 * THE PROBE CALLS THE FUNCTION RATHER THAN ASKING WHETHER IT EXISTS, because
 * three failures are possible and only one of them is "absent":
 *
 *  - absent:   typeof is not 'function';
 *  - inert:    present, returns its input unchanged, decomposes nothing;
 *  - throwing: present, raises when called.
 *
 * A typeof check sees the first and misses the other two. The third is the
 * dangerous one: it would leave CAN_NORMALIZE true and make foldForSearch
 * throw on every keystroke of the critical path. Calling it once, inside a
 * try, turns a search that could crash into a search that degrades.
 *
 * The witness is e-acute, whose NFD form is two code points. One character is
 * enough: an engine that decomposes this one carries the tables.
 */
export interface NormalizeSupport {
  /** Whether the function exists at all. */
  present: boolean;
  /** Whether calling it decomposes. False if absent, inert or throwing. */
  decomposes: boolean;
  /** What the call threw, if it threw. Null otherwise. */
  failure: string | null;
}

export function probeNormalize(): NormalizeSupport {
  if (typeof String.prototype.normalize !== 'function') {
    return { present: false, decomposes: false, failure: null };
  }

  try {
    return {
      present: true,
      // e-acute decomposes into e + combining acute accent: two code units.
      decomposes: '\u00e9'.normalize('NFD').length === 2,
      failure: null,
    };
  } catch (error) {
    return {
      present: true,
      decomposes: false,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Settled once, at module load: the engine does not change underneath us. */
const CAN_NORMALIZE = probeNormalize().decomposes;

/**
 * Two aligned strings rather than a map literal, so a test can assert they are
 * the same length — which catches the one mistake this shape invites.
 *
 * a-acute .. a-ring, c-cedilla, e-grave .. e-diaeresis, i-grave .. i-diaeresis,
 * n-tilde, o-grave .. o-tilde, u-grave .. u-diaeresis, y-acute, y-diaeresis.
 */
const ACCENTED =
  '\u00e0\u00e2\u00e4\u00e1\u00e3\u00e5' +
  '\u00e7' +
  '\u00e8\u00e9\u00ea\u00eb' +
  '\u00ec\u00ed\u00ee\u00ef' +
  '\u00f1' +
  '\u00f2\u00f3\u00f4\u00f6\u00f5' +
  '\u00f9\u00fa\u00fb\u00fc' +
  '\u00fd\u00ff';

const PLAIN = 'aaaaaa' + 'c' + 'eeee' + 'iiii' + 'n' + 'ooooo' + 'uuuu' + 'yy';

/** The ligatures, the one case a single replacement letter cannot answer. */
const LIGATURES: readonly (readonly [string, string])[] = [
  ['\u00e6', 'ae'],  // U+00E6
  ['\u0153', 'oe'],  // U+0153
  ['\u00df', 'ss'],  // U+00DF
];

/** Combining Diacritical Marks: the block NFD decomposes an accent into. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

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
 * So that an unaccented term finds an accented name and the reverse — asymmetry
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

/**
 * What the fold is actually doing on this engine, for the development
 * diagnostic on the settings screen.
 *
 * IT EXISTS BECAUSE THE ANSWER CANNOT BE REACHED ANY OTHER WAY. Node always
 * takes the normalize branch, so the branch that will run on the phone is
 * never the one the suite exercises. And a behavioural check on the device --
 * "does creme find Creme" -- passes either way, because the table runs AFTER
 * NFD and covers the whole of French on its own. The two witnesses below are
 * chosen to separate the branches rather than to confirm both at once.
 */
export interface FoldDiagnostic extends NormalizeSupport {
  /**
   * French witness. Folds on BOTH paths, the table knowing e-grave and
   * i-circumflex, so a wrong answer here means the fold is broken outright.
   */
  french: string;
  /**
   * Beyond-French witness: Vietnamese pho, a real Open Food Facts product
   * name. Its o carries a horn AND a hook above, neither of which the table
   * knows, so it folds to 'pho' only when the engine decomposes. THIS is the
   * line that says which branch ran.
   */
  beyondFrench: string;
}

export function describeFoldSupport(): FoldDiagnostic {
  return {
    ...probeNormalize(),
    french: foldForSearch('Cr\u00e8me fra\u00eeche'),
    beyondFrench: foldForSearch('Ph\u1edf'),
  };
}
