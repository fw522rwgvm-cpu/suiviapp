import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import { exercise, exerciseSecondaryMuscle, type ExerciseId } from '@/core/db/schema';
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
