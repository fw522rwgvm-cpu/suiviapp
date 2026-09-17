/**
 * Accent-insensitive folding, shared by every list this application searches.
 *
 * ## WHY THIS IS IN core, AND WHY IT IS ONLY THE FOLD
 *
 * It lived in features/nutrition/domain/food-search.ts from slice 3, where it
 * was written, and slice 10 gives it a second real user: exercises are searched
 * by name the way foods are, and Hermes is no more likely to carry Unicode
 * tables for one than for the other. The project's rule is that a component
 * moves to core at its second user, and this is that.
 *
 * What did NOT move is the SCORING. `scoreFood` and `searchFoods` stay where
 * they are, because a ranking is specific to what it ranks: "danone" is looking
 * for a brand, "poulie" for a piece of equipment, and those are not the same
 * ranks. Sharing the fold shares the part that is genuinely one problem —
 * the hard part, with two branches and an engine that may lack one — and
 * sharing the barème would have been sharing a coincidence.
 *
 * ## WHAT String.prototype.normalize ACTUALLY DOES ON THIS ENGINE
 *
 * HERMES IS NOT NODE, and the difference cannot be observed from a development
 * machine. Unicode normalisation needs decomposition tables, which an embedded
 * engine may reasonably leave out. The table below covers French; the full
 * range started to matter in slice 4, when Open Food Facts brought a worldwide
 * catalogue, and matters again here for any exercise name someone types.
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
 * What the engine can do, measured rather than assumed.
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
      decomposes: 'é'.normalize('NFD').length === 2,
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
  ['æ', 'ae'],  // U+00E6
  ['œ', 'oe'],  // U+0153
  ['ß', 'ss'],  // U+00DF
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
    french: foldForSearch('Crème fraîche'),
    beyondFrench: foldForSearch('Phở'),
  };
}
