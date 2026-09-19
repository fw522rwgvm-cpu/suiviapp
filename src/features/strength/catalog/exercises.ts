import { EXERCISE_CATALOG, type CatalogExercise } from './catalog.generated';

/**
 * The exercises the application can offer a brand-new library (specs 10.1).
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * Specs 10.1 describes a library with a creation button and nothing else, so an
 * installation starts empty: the one place in the whole application that asks
 * for a quarter of an hour before it can do anything. Twenty exercises typed by
 * hand, each with a muscle, a set of secondaries and a piece of equipment,
 * before the first workout.
 *
 * ## IT IS OFFERED, NEVER INSTALLED — AND NOT A MIGRATION
 *
 * Slice 5 refused a seed in a migration for the day templates, and the
 * precedent holds here for a REASON OF ITS OWN, which is stronger than the
 * precedent: a migration is replayed by every import (G4). A seed in `0010`
 * would reinject these rows into an archive that deliberately held none — and
 * with fresh ULIDs, so importing the same archive twice would produce two
 * copies of everything. A migration has to be deterministic; newId() is not.
 *
 * And specs 5.3 makes deleting an exercise the one destructive act in this
 * application. Installing five hundred of them uninvited hands somebody that
 * act as a chore — which is why the screen opens on a search and installs what
 * was chosen, rather than everything by default.
 *
 * So: a screen offers the list and one transaction writes what was kept.
 * Idempotent BY NAME — an exercise already called that is skipped, never
 * duplicated — which is ensureOffFood's get-or-create shape.
 *
 * ## THE LIST ITSELF IS GENERATED, AND THAT IS THE POINT
 *
 * It used to be thirty-three entries written by hand from everkinetic's English
 * titles, then five hundred and twenty from wger. Eight hundred and seventy-six
 * now come from free-exercise-db, which is public domain — see
 * catalog.generated.ts for what that third switch cost and bought, and
 * ./LICENSE.md for the provenance.
 *
 * The FRENCH NAMES are the part that is not generated from the source: it is
 * English only, so the translation is this project's own and lives in
 * scripts/exercise-names-fr.mjs.
 *
 * ## WHAT IS DELIBERATELY NOT HERE: THE FOUR NOTES
 *
 * Specs 6.3 gives an exercise four notes — exécution, réglage, respiration,
 * erreurs fréquentes — and this catalogue fills none of them. They are written
 * for one person's body and one person's mistakes, and the session screen now
 * displays them during every workout (specs 14.28 no 2). Generic text there
 * would be four paragraphs nobody wrote, read during every set, teaching the
 * eye to skip the place where a real note will one day be.
 */

export { EXERCISE_CATALOG };
export type { CatalogExercise };

/**
 * The prefix that tells a bundled drawing from a file the user chose.
 *
 * ## ONE COLUMN, TWO NAMESPACES, AND THE VALUE SAYS WHICH
 *
 * Slice 10 defined `exercise.media_uri` as a file name relative to the
 * application's container: a thing that can be missing, that the JSON export
 * cannot restore, and that comes back when the folder is restored.
 *
 * A catalogue drawing is none of those. It is an ASSET OF THE BINARY — it ships
 * with the app, it cannot be missing, and it survives a reinstall because the
 * binary does. Two different things.
 *
 * Storing "squat" bare and having the application work out which kind it is
 * would be one column with two meanings resolved by a lookup — the "two answers
 * to one question" shape this project removes wherever it appears. The scheme
 * makes it readable from the value alone, with nothing to consult.
 *
 * ## WHAT THE EXPORT DOES WITH EACH, WHICH IS THE SAME THING
 *
 * The column travels either way: the catalogue excludes TABLES, never columns,
 * and inventing per-column exclusion inside the one safety net there is would
 * be the worst possible place for a new mechanism (slice 10).
 *
 * The consequence is good. A `catalog:` value comes back ALIVE after a round
 * trip, because the image is in the binary — strictly better than a user's
 * medium, which returns as text pointing at nothing until the folder is
 * restored. And a key this build does not know falls back to the substitute
 * specs 5.4 no 3 already requires.
 */
export const MEDIA_SCHEME = 'catalog:';

export function catalogMediaUri(key: string): string {
  return `${MEDIA_SCHEME}${key}`;
}

/** The catalogue key a media_uri names, or null when it names a file. */
export function catalogKeyOf(mediaUri: string | null): string | null {
  if (mediaUri === null || !mediaUri.startsWith(MEDIA_SCHEME)) return null;
  return mediaUri.slice(MEDIA_SCHEME.length);
}

/**
 * The catalogue minus what the library already holds (specs 10.1).
 *
 * ## A RULE, NOT A RENDER, WHICH IS WHY IT IS HERE
 *
 * Conventions section 4 keeps business decisions out of components, and "which
 * exercises may still be offered" is one: it decides what the screen can add,
 * what its filter strips advertise, and what its counter says. Inline in the
 * JSX it would be three readings of the same subtraction, free to drift.
 *
 * ## WHAT THE KEYS ARE
 *
 * `installed` holds CATALOGUE KEYS, as installedCatalogNames() returns them —
 * which resolves a library row to a catalogue entry BY NAME, because that is
 * what the install is idempotent on. So an exercise somebody typed by hand
 * under a catalogue name hides that entry too, and it should: installing it
 * would be the application contradicting them about their own library.
 */
export function offerableCatalog(installed: ReadonlySet<string>): CatalogExercise[] {
  return EXERCISE_CATALOG.filter((entry) => !installed.has(entry.key));
}
