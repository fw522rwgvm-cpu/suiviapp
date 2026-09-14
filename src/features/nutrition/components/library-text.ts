/**
 * How an empty library says why it is empty (D10: no internationalisation
 * library).
 *
 * A text module rather than ternaries in the JSX, on the precedent
 * portion-text.ts and recipe-text.ts set: wording that has a rule in it is a
 * pure function, so it can be tested and so two screens cannot word the same
 * fact two ways.
 */

/** Which half of the library is on screen. */
export type LibraryKind = 'foods' | 'recipes';

/**
 * Why the list is empty, said in the terms of what is actually empty.
 *
 * THREE DIFFERENT SILENCES, and telling them apart is the whole point: a
 * library with nothing in it wants to know how to fill it, a search with no
 * hit wants to see the term it did not match, and a tag with no recipe wants
 * to see the tag. One message for all three would answer none of them.
 *
 * The first version of this lived inline and was three conditions deep, with a
 * branch that could not be reached — which is exactly the kind of thing that
 * reads as correct until the day it renders.
 */
export function libraryEmptyMessage({
  kind,
  held,
  term,
  tag,
}: {
  kind: LibraryKind;
  /** How many the library holds, before any filtering. */
  held: number;
  /** Already trimmed. */
  term: string;
  /** Null for the foods, which have no tags. */
  tag: string | null;
}): string {
  if (held === 0) {
    return kind === 'foods'
      ? 'Aucun aliment. Touchez + pour en créer un : nom, macros pour 100 g, et des portions si vous en utilisez.'
      : 'Aucune recette. Touchez + pour en créer une : elle calcule ses macros depuis ses ingrédients.';
  }

  if (term !== '') {
    return tag === null
      ? `Aucun résultat pour « ${term} ».`
      : `Aucun résultat pour « ${term} » parmi les recettes « ${tag} ».`;
  }

  // Nothing typed and the library is not empty, so only a tag can have emptied
  // the list — and only the recipes have tags. The last case is unreachable
  // from the screen and still says something true rather than nothing.
  return tag === null ? 'Rien à afficher.' : `Aucune recette « ${tag} ».`;
}
