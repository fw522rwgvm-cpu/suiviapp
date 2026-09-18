import type { Equipment, Muscle } from '@/core/db/schema';

/**
 * The exercises the application can offer a brand-new library (slice 11).
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
 * application. Installing thirty-three of them uninvited hands somebody that
 * act as a chore.
 *
 * So: a screen offers the list, everything pre-ticked, and one transaction
 * writes what was kept. Idempotent BY NAME — an exercise already called that is
 * skipped, never duplicated — which is ensureOffFood's get-or-create shape.
 *
 * ## WHAT IS DELIBERATELY NOT HERE: THE FOUR NOTES
 *
 * Specs 6.3 gives an exercise four notes — exécution, réglage, respiration,
 * erreurs fréquentes — and this catalogue fills none of them. They are written
 * for one person's body and one person's mistakes, and the session screen now
 * displays them during every workout (specs 14.28 no 2). Generic text there
 * would be four paragraphs nobody wrote, read during every set, teaching the
 * eye to skip the place where a real note will one day be.
 *
 * ## AND WHAT IT COST TO CONFRONT THE VOCABULARY
 *
 * The fifteen muscles and eight equipment values were invented in slice 10 and
 * had never met a real exercise (specs 14.20 no 1). This is the first thing
 * that confronts them, and the three findings are recorded here rather than
 * discovered again:
 *
 *  - `shoulders` IS ONE WORD FOR THREE MUSCLES that are trained separately.
 *    A lateral raise, a rear-delt fly and an overhead press work different
 *    heads, and this catalogue tags all three `shoulders`. Kept as one group by
 *    explicit decision — and the body map agrees, since `deltoids` is a single
 *    region there, so splitting would have produced three values lighting the
 *    same shape.
 *  - `forearms` AND `kettlebell` HAVE NO ENTRY. No exercise here is primarily a
 *    forearm movement, which is exactly the false negative slice 10's
 *    secondary-muscle weighting was built for — they appear as secondary eight
 *    times. No kettlebell drawing exists in the source at all.
 *  - `glutes` HAS EXACTLY ONE, and it is a judgement: the deadlift is filed
 *    glutes-primary rather than lower-back-primary. Both readings are defended
 *    in print by people who train; this one is chosen so the group is not
 *    permanently grey on the map.
 */

/** One catalogue entry, before it becomes an exercise. */
export interface CatalogExercise {
  /**
   * Stable key, and the media reference.
   *
   * It is what `exercise.media_uri` holds, prefixed — see MEDIA_SCHEME. Stable
   * because an archive exported today has to still find its drawing in a binary
   * built next year, and a name can be corrected.
   */
  key: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  /** Measured in seconds rather than repetitions (specs 14.21 no 1). */
  tracksDuration?: boolean;
}

/**
 * The prefix that tells a bundled drawing from a file the user chose.
 *
 * ## ONE COLUMN, TWO NAMESPACES, AND THE VALUE SAYS WHICH
 *
 * Slice 10 defined `exercise.media_uri` as a file name relative to the
 * application's container: a thing that can be missing, that the JSON export
 * cannot restore, and that comes back when the folder is restored.
 *
 * A catalogue drawing is none of those. It is CODE — it ships in the binary, it
 * cannot be missing, and it survives a reinstall because the binary does. Two
 * different things.
 *
 * Storing "bench-press" bare and having the application work out which kind it
 * is would be one column with two meanings resolved by a lookup — the "two
 * answers to one question" shape this project removes wherever it appears. The
 * scheme makes it readable from the value alone, with nothing to consult.
 *
 * ## WHAT THE EXPORT DOES WITH EACH, WHICH IS THE SAME THING
 *
 * The column travels either way: the catalogue excludes TABLES, never columns,
 * and inventing per-column exclusion inside the one safety net there is would
 * be the worst possible place for a new mechanism (slice 10).
 *
 * The consequence is good. A `catalog:` value comes back ALIVE after a round
 * trip, because the drawing is in the binary — strictly better than a user's
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
 * Thirty-three exercises, and the criterion is not "as many as possible".
 *
 * The smallest set that makes an empty library immediately useful for building
 * a real routine: every muscle that HAS a primary movement here gets one, every
 * equipment value that exists in the source is represented, and one exercise is
 * measured in time — because `tracks_duration` had never met a real exercise
 * either, and this slice found it was written by nothing at all.
 *
 * The count is a dial. Each drawn exercise is about forty kilobytes of path
 * data in the bundle, so trimming the list is a one-line change with a
 * predictable effect.
 */
export const EXERCISE_CATALOG: readonly CatalogExercise[] = [
  // Pectoraux
  { key: 'developpe-couche', name: 'Développé couché', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell' },
  { key: 'developpe-incline-haltere', name: 'Développé incliné haltères', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { key: 'ecarte-couche', name: 'Écarté couché', primaryMuscle: 'chest', secondaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { key: 'pompes', name: 'Pompes', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders', 'abs'], equipment: 'bodyweight' },
  { key: 'dips', name: 'Dips', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: 'bodyweight' },

  // Dos
  { key: 'tractions', name: 'Tractions', primaryMuscle: 'lats', secondaryMuscles: ['biceps', 'forearms', 'traps'], equipment: 'bodyweight' },
  { key: 'tirage-vertical', name: 'Tirage vertical', primaryMuscle: 'lats', secondaryMuscles: ['biceps', 'forearms'], equipment: 'cable' },
  { key: 'rowing-barre', name: 'Rowing barre', primaryMuscle: 'lats', secondaryMuscles: ['biceps', 'traps', 'lower_back', 'forearms'], equipment: 'barbell' },
  { key: 'shrugs', name: 'Shrugs', primaryMuscle: 'traps', secondaryMuscles: ['forearms'], equipment: 'barbell' },

  // Chaîne postérieure
  {
    key: 'souleve-de-terre',
    name: 'Soulevé de terre',
    // JUDGEMENT, FLAGGED: filed glutes-primary rather than lower-back-primary.
    // Both readings are defended by people who train; this one is chosen so
    // that `glutes` is not permanently grey on the body map.
    primaryMuscle: 'glutes',
    secondaryMuscles: ['lower_back', 'hamstrings', 'traps', 'forearms', 'quads'],
    equipment: 'barbell',
  },
  { key: 'souleve-de-terre-roumain', name: 'Soulevé de terre roumain', primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'lower_back'], equipment: 'barbell' },
  { key: 'extensions-lombaires', name: 'Extensions lombaires', primaryMuscle: 'lower_back', secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'other' },

  // Épaules
  { key: 'developpe-militaire', name: 'Développé militaire', primaryMuscle: 'shoulders', secondaryMuscles: ['triceps', 'traps'], equipment: 'barbell' },
  { key: 'elevations-laterales', name: 'Élévations latérales', primaryMuscle: 'shoulders', secondaryMuscles: ['traps'], equipment: 'dumbbell' },
  { key: 'oiseau', name: 'Oiseau', primaryMuscle: 'shoulders', secondaryMuscles: ['traps', 'lats'], equipment: 'dumbbell' },

  // Bras
  { key: 'curl-barre', name: 'Curl barre', primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], equipment: 'barbell' },
  { key: 'curl-marteau', name: 'Curl marteau', primaryMuscle: 'biceps', secondaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { key: 'extension-triceps-poulie', name: 'Extension triceps à la poulie', primaryMuscle: 'triceps', secondaryMuscles: [], equipment: 'cable' },
  { key: 'dips-sur-banc', name: 'Dips sur banc', primaryMuscle: 'triceps', secondaryMuscles: ['chest', 'shoulders'], equipment: 'bodyweight' },

  // Jambes
  { key: 'squat', name: 'Squat', primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings', 'lower_back', 'abs'], equipment: 'barbell' },
  { key: 'presse-a-cuisses', name: 'Presse à cuisses', primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'machine' },
  { key: 'fentes', name: 'Fentes', primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'dumbbell' },
  { key: 'leg-extension', name: 'Leg extension', primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'machine' },
  { key: 'leg-curl', name: 'Leg curl', primaryMuscle: 'hamstrings', secondaryMuscles: ['calves'], equipment: 'machine' },
  { key: 'machine-a-adducteurs', name: 'Machine à adducteurs', primaryMuscle: 'adductors', secondaryMuscles: [], equipment: 'machine' },

  // Mollets
  { key: 'mollets-debout', name: 'Mollets debout', primaryMuscle: 'calves', secondaryMuscles: [], equipment: 'barbell' },
  { key: 'mollets-assis', name: 'Mollets assis', primaryMuscle: 'calves', secondaryMuscles: [], equipment: 'machine' },
  { key: 'mollets-elastique', name: 'Mollets à l’élastique', primaryMuscle: 'calves', secondaryMuscles: [], equipment: 'band' },

  // Ceinture abdominale
  { key: 'crunch', name: 'Crunch', primaryMuscle: 'abs', secondaryMuscles: ['obliques'], equipment: 'bodyweight' },
  { key: 'releve-de-jambes', name: 'Relevé de jambes', primaryMuscle: 'abs', secondaryMuscles: ['obliques'], equipment: 'bodyweight' },
  { key: 'crunch-oblique', name: 'Crunch oblique', primaryMuscle: 'obliques', secondaryMuscles: ['abs'], equipment: 'bodyweight' },
  {
    key: 'gainage-lateral',
    name: 'Gainage latéral',
    primaryMuscle: 'obliques',
    secondaryMuscles: ['abs', 'shoulders'],
    equipment: 'bodyweight',
    tracksDuration: true,
  },
  {
    key: 'gainage',
    name: 'Gainage',
    primaryMuscle: 'abs',
    secondaryMuscles: ['obliques', 'shoulders'],
    equipment: 'bodyweight',
    tracksDuration: true,
    /*
      THE ONE WITH NO DRAWING, and it ships anyway.

      The source has a side plank and no front plank. "Gainage" is what everyone
      means when they say the word, and `tracks_duration` needs a canonical
      representative — so it is here without a medium, which is the path specs
      5.4 no 3 already requires to work: a missing medium shows a substitute and
      never crashes. Exercised for real on day one rather than waiting for the
      first user-chosen file to find out.
    */
  },
];
