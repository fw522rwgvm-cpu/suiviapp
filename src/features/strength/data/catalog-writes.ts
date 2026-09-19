import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import { exercise, exerciseSecondaryMuscle, type ExerciseId } from '@/core/db/schema';
import { readSetting } from '@/features/settings/data/settings-reads';
import { writeSetting } from '@/features/settings/data/settings-writes';
import { EXERCISE_CATALOG, catalogMediaUri, type CatalogExercise } from '../catalog/exercises';

/**
 * Installing exercises from the catalogue (specs 10.1, slice 11).
 *
 * ## AN EXPLICIT ACT, AND EMPHATICALLY NOT A MIGRATION
 *
 * Slice 5 refused a seed in a migration for the day templates, and this case
 * has a reason of its own that is stronger than the precedent: A MIGRATION IS
 * REPLAYED BY EVERY IMPORT (G4). A seed in `0010` would reinject these rows
 * into an archive that deliberately held none — and with fresh ULIDs, so
 * importing the same archive twice would produce two copies of everything. A
 * migration must be deterministic; newId() is not.
 *
 * It also obeys the rule that has held since slice 4, alongside
 * ensureMaterialized and ensureOffFood: what the user SAVES is written, what
 * they merely look at is not. A library that filled itself on first launch
 * would be data created by opening a screen.
 *
 * ## IDEMPOTENT BY NAME, WHICH IS ensureOffFood's SHAPE
 *
 * An exercise already called that is skipped, never duplicated. By NAME rather
 * than by media_uri, because the name is what the user sees and what they would
 * consider "already there" — somebody who typed "Squat" themselves before
 * opening this screen has a Squat, and installing a second one would be the
 * application disagreeing with them about their own library.
 *
 * The consequence, stated: a catalogue exercise the user renamed can be
 * installed again under its original name. That is the honest behaviour — the
 * renamed one is theirs now, and refusing would mean the catalogue silently
 * withholding an exercise because of an edit made months ago.
 */

/** What an install actually did, so the screen can say it rather than guess. */
export interface InstallResult {
  installed: number;
  skipped: number;
}

export function installCatalogExercises(
  db: AppDatabase,
  keys: readonly string[],
  defaultIncrementKg: number,
): InstallResult {
  const wanted = new Set(keys);
  const entries = EXERCISE_CATALOG.filter((entry) => wanted.has(entry.key));

  return db.transaction((tx) => {
    /**
     * ONE TRANSACTION for the whole install, and one read for the whole
     * comparison.
     *
     * Transactional because it is the rule for anything touching two tables —
     * and because thirty-three half-installed exercises is a worse state than
     * none, on an application specs 2.2 allows to be killed at any instant.
     *
     * The existing names are read ONCE rather than per entry: a query per
     * candidate is the per-row cost slice 4 refused when quick-add reached the
     * whole library, and here it would be thirty-three of them behind a button.
     */
    const taken = new Set(
      tx
        .select({ name: exercise.name })
        .from(exercise)
        .all()
        .map((row) => row.name),
    );

    const now = Date.now();
    let installed = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (taken.has(entry.name)) {
        skipped += 1;
        continue;
      }

      const id = newId<ExerciseId>();
      tx
        .insert(exercise)
        .values({
          id,
          name: entry.name,
          primaryMuscle: entry.primaryMuscle,
          equipment: entry.equipment,
          /**
           * The catalogue key, prefixed — never a file name.
           *
           * One column, two namespaces, and which one is readable from the
           * value alone. A drawing that ships in the binary and a file the user
           * chose are different things: the first cannot be missing and comes
           * back alive after an import, the second returns as text pointing at
           * nothing until the folder is restored.
           *
           * WRITTEN EVEN FOR `gainage`, WHICH HAS NO DRAWING. The key is what
           * the exercise IS, not a promise that a picture exists — and the
           * substitute of specs 5.4 no 3 is the same path an unknown key from a
           * newer binary takes. Withholding it would make "no drawing" mean two
           * different things depending on why.
           */
          mediaUri: catalogMediaUri(entry.key),
          incrementKg: defaultIncrementKg,
          tracksDuration: entry.tracksDuration === true ? 1 : 0,
          isFavorite: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      if (entry.secondaryMuscles.length > 0) {
        tx
          .insert(exerciseSecondaryMuscle)
          .values(entry.secondaryMuscles.map((muscle) => ({ exerciseId: id, muscle })))
          .run();
      }

      // Added to the set as we go: two catalogue entries can never share a name
      // (a test holds that), but a re-run inside one transaction would
      // otherwise not see what it just wrote.
      taken.add(entry.name);
      installed += 1;
    }

    return { installed, skipped };
  });
}

/**
 * Which catalogue names are already in the library.
 *
 * Read by the screen so the list can show what would be skipped BEFORE the
 * button is pressed — a confirmation that says "31 installés, 2 ignorés" after
 * the fact is a report; saying it in advance is a choice.
 */
export function installedCatalogNames(db: AppDatabase): Set<string> {
  const names = new Set(
    db
      .select({ name: exercise.name })
      .from(exercise)
      .all()
      .map((row) => row.name),
  );
  return new Set(EXERCISE_CATALOG.filter((entry) => names.has(entry.name)).map((e) => e.key));
}

export type { CatalogExercise };


/**
 * The key that records the default set has been installed once.
 *
 * A row of `setting`, which is the table that exists for exactly this — a fact
 * about the installation with no home of its own, the way `last_export_at` and
 * `off_suspended_until` are. No migration, no column.
 */
export const CATALOG_SEEDED_KEY = 'catalog_seeded_at';

/**
 * The exercises a fresh installation gets WITHOUT being asked (slice 11).
 *
 * ## THE ONES WITH A DRAWING, AND THAT IS THE CRITERION
 *
 * Requested: the common exercises should already be there. Five hundred and
 * twenty would not be a library, it would be a copy of the wger database — so
 * something has to choose, and "has a drawing" is the honest line rather than
 * an opinion about what is common. wger's contributors drew the exercises
 * people actually look up, so the set is curated by somebody who trained rather
 * than by a rule invented here.
 *
 * It has a second property that matters more than it sounds: the library that
 * results has a picture on EVERY row. A default set mixing drawn and undrawn
 * entries would make the substitute of specs 5.4 no 3 look like a defect on day
 * one, on a screen nobody has touched yet.
 *
 * The other three hundred and twenty-six stay one tap away, in the catalogue
 * screen, which is also where they can be searched and filtered.
 */
export function defaultCatalogKeys(): string[] {
  return EXERCISE_CATALOG.filter((entry) => entry.hasImage === true).map((entry) => entry.key);
}

/**
 * Installs the default set, once per installation.
 *
 * ## WHY A FLAG AND NOT "IS THE LIBRARY EMPTY"
 *
 * Emptiness is the obvious test and it is wrong in the one case that matters:
 * somebody who deliberately deleted every exercise would get all of them back
 * on the next launch, and specs 5.3 makes deleting an exercise the one act in
 * this application that destroys something. Undoing it on their behalf, at
 * launch, without asking, is the worst possible time to be helpful.
 *
 * So the flag says "this has been done", not "this is needed". Set even when
 * nothing was installed, because a library that already had every name is a
 * library where the question has been answered too.
 *
 * ## AND WHY THIS IS STILL NOT A MIGRATION
 *
 * G4 replays every migration on every import, so a seed in `0010` would
 * reinject these rows into an archive that deliberately held none — with fresh
 * ULIDs, so importing the same archive twice would double everything. That
 * argument is unchanged by installing automatically: what changed is WHO asks,
 * not WHERE it is written.
 *
 * An imported archive carries `setting`, so the flag travels with it: restoring
 * a backup does not re-seed. An archive older than this key seeds once, which
 * is right — it predates the catalogue.
 */
export function installDefaultCatalogOnce(
  db: AppDatabase,
  defaultIncrementKg: number,
  now: number,
): InstallResult | null {
  if (readSetting(db, CATALOG_SEEDED_KEY) !== null) return null;

  const result = installCatalogExercises(db, defaultCatalogKeys(), defaultIncrementKg);
  writeSetting(db, CATALOG_SEEDED_KEY, String(now));
  return result;
}
