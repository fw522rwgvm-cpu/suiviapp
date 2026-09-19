#!/usr/bin/env node
/**
 * Builds the exercise catalogue from wger (specs 10.1, slice 11).
 *
 * ## WHY wger REPLACED everkinetic, WHICH THIS SCRIPT ALSO REPLACED
 *
 * The first version of this slice took everkinetic/data: 293 exercises, English
 * only, 269 two-pose SVG drawings, from which 32 were hand-named in French. That
 * was not enough exercises, and the constraint that made it hard to grow was
 * SIZE — an inlined SVG costs about 40 KB of path data in the JavaScript bundle,
 * parsed at every cold start, and the paths cannot be shortened: they contain
 * arcs, which is precisely the case slice 10 documented as undecidable to
 * re-serialise.
 *
 * wger settles it, and the reason is almost funny: IT ALREADY CONTAINS
 * everkinetic. Sixty-seven of its images are credited to them, already
 * translated into French by wger's contributors. So switching sources is not
 * trading one set for another — it is taking the same drawings plus five
 * hundred more exercises, with the naming done.
 *
 * | | everkinetic | wger |
 * | --- | --- | --- |
 * | exercises | 293, English | 903, of which 582 named in French |
 * | media | 269 two-pose SVG | 202 line-art PNG on French-named entries |
 * | licence | CC BY-SA 4.0, one author | CC BY-SA 3/4, credited per image |
 * | cost | ~40 KB each IN THE JS BUNDLE | ~60 KB each as an ASSET, never parsed |
 *
 * A PNG asset is structurally cheaper than an inlined path: Hermes never reads
 * it, so the bundle returns to what it was before this slice and the cost moves
 * to the part of the app that is loaded lazily.
 *
 * WHAT IS LOST, STATED: the two-pose animation. It matters less than it sounds,
 * because a wger drawing shows the start AND the end side by side with an arrow
 * — which is what the animation was saying, in a glance rather than in two
 * seconds. And a PNG does not take the theme, so the drawing sits on a white
 * card in both themes, the way a photograph would.
 *
 * ## WHY THE OUTPUT IS COMMITTED
 *
 * Same two reasons extract-body-map.mjs and generate-icons.mjs give. A build
 * step fetching from wger would make every CI run depend on a third-party
 * service staying up, to regenerate files that do not change. And an asset
 * nobody can regenerate is a decision nobody can revisit.
 *
 * Usage:
 *   node scripts/fetch-exercise-catalog.mjs
 */

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const IMAGES_DIR = join(ROOT, 'assets/exercises');
const CATALOG_OUT = join(ROOT, 'src/features/strength/catalog/catalog.generated.ts');
const IMAGES_OUT = join(ROOT, 'src/features/strength/catalog/images.generated.ts');
const LICENCE_OUT = join(ROOT, 'src/features/strength/catalog/LICENSE.md');

const API = 'https://wger.de/api/v2';
/** French. wger language ids are stable; 12 is fr. */
const FRENCH = 12;

/**
 * wger's muscles onto ours (specs 14.20 no 1).
 *
 * wger names muscles anatomically — Pectoralis major, Biceps femoris — where
 * this project names the group somebody labels an exercise with. The mapping is
 * one small table, and neither vocabulary bends to the other: making the schema
 * follow a third party's anatomy would tie the column to their database.
 *
 * `Serratus anterior` goes under `chest`, which is the choice body-map.ts
 * already made for the same muscle and for the same reason: everything that
 * recruits it — presses, push-ups, dips — recruits the chest.
 *
 * THREE OF OUR FIFTEEN HAVE NO wger EQUIVALENT: forearms, lower_back and
 * adductors. wger simply does not model them. They are reached by NAME_MUSCLES
 * below instead, which is a weaker instrument and says so.
 */
const MUSCLES = {
  'Anterior deltoid': 'shoulders',
  'Biceps brachii': 'biceps',
  Brachialis: 'biceps',
  'Biceps femoris': 'hamstrings',
  Gastrocnemius: 'calves',
  Soleus: 'calves',
  'Gluteus maximus': 'glutes',
  'Latissimus dorsi': 'lats',
  'Obliquus externus abdominis': 'obliques',
  'Pectoralis major': 'chest',
  'Serratus anterior': 'chest',
  'Quadriceps femoris': 'quads',
  'Rectus abdominis': 'abs',
  Trapezius: 'traps',
  'Triceps brachii': 'triceps',
};

/**
 * wger's equipment onto ours.
 *
 * `Bench` and `Incline bench` map to NOTHING on purpose: they are modifiers of
 * an exercise, not kit — an incline press IS a different exercise, and slice 10
 * settled that when it chose the eight values. A bench-only entry falls through
 * to the name rules below or ends with no equipment at all.
 */
const EQUIPMENT = {
  Barbell: 'barbell',
  'SZ-Bar': 'barbell',
  Dumbbell: 'dumbbell',
  Kettlebell: 'kettlebell',
  'Cable machine': 'cable',
  'Resistance band': 'band',
  'Pull-up bar': 'bodyweight',
  'none (bodyweight exercise)': 'bodyweight',
  'Gym mat': 'bodyweight',
  'Swiss Ball': 'other',
};

/**
 * THE GAP wger HAS AND WE DO NOT: there is no generic "machine".
 *
 * Leg press, leg curl, leg extension and the lat pulldown all come back with an
 * empty equipment list — the exercises exist, they are named in French, and
 * nothing says what they are performed on. Left alone they would be invisible
 * to the equipment filter of specs 10.1, which is the feature the vocabulary
 * exists for.
 *
 * So the name decides, and that is a WEAKER instrument than a field: it matches
 * French words and it will miss some. Stated rather than hidden. What it must
 * not do is guess wrongly, so every pattern here is a machine by definition
 * rather than by likelihood.
 */
const NAME_EQUIPMENT = [
  [/presse à (cuisses|jambes)|leg press/i, 'machine'],
  [/leg (curl|extension)|extension des jambes|flexion des jambes/i, 'machine'],
  [/tirage vertical|poulie haute|lat pull/i, 'cable'],
  [/tirage horizontal|rowing assis/i, 'cable'],
  [/\bmachine\b|multipresse|smith|guidée?/i, 'machine'],
  [/pec.?deck|butterfly|papillon/i, 'machine'],
  [/adducteur|abducteur/i, 'machine'],
  [/mollets? (assis|debout) à la machine/i, 'machine'],
  [/poulie|câble/i, 'cable'],
  [/haltères?\b/i, 'dumbbell'],
  [/\bbarre\b/i, 'barbell'],
  [/élastique|bande de résistance/i, 'band'],
  [/kettlebell/i, 'kettlebell'],
];

/**
 * The three muscles wger does not model, reached by name — and these OVERRIDE
 * what wger says.
 *
 * ## WHY OVERRIDING IS RIGHT HERE AND NOWHERE ELSE
 *
 * The first version only let a name rule SUPPLY a primary wger had left empty,
 * which sounded like the careful choice and reached none of these three: wger
 * always says something, so `primaries[0]` always won. A hyperextension came
 * back as hamstrings, an adduction as glutes.
 *
 * And those answers are not merely different from ours — they are the closest
 * thing wger CAN say, because its vocabulary has no erector spinae, no
 * forearms and no adductors at all. Deferring to it for a muscle it cannot
 * express is deferring to a forced choice.
 *
 * So the patterns have to be tight enough that the name alone settles it. Every
 * one here is the movement's definition rather than a likelihood: a
 * hyperextension IS a lower-back movement, a wrist curl IS a forearm one. What
 * is deliberately NOT here: `good morning` and `soulevé de terre`, which
 * genuinely work the hamstrings and the glutes as much as the spine — wger's
 * answer for those is defensible, so it stands.
 */
const NAME_MUSCLES = [
  [/curls? des poignets|(flexion|extension)s? des poignets|avant-bras/i, 'forearms'],
  [/hyperextension|extensions? lombaires|superman|banc à lombaires/i, 'lower_back'],
  [/adduction|adducteur/i, 'adductors'],
];

/** Movements measured in seconds rather than repetitions (specs 14.21 no 1). */
const TIMED = /gainage|planche|plank|chaise|isométri|suspension à la barre/i;

async function getAll(path) {
  let url = `${API}/${path}${path.includes('?') ? '&' : '?'}limit=200&format=json`;
  const out = [];
  while (url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    const page = await response.json();
    out.push(...page.results);
    url = page.next;
    process.stderr.write(`\r  ${path}: ${out.length}…`);
  }
  process.stderr.write('\n');
  return out;
}

/** ASCII, stable, and usable as both a media key and a file name. */
function slug(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function frenchName(exercise) {
  const translation = (exercise.translations ?? []).find(
    (item) => item.language === FRENCH && (item.name ?? '').trim() !== '',
  );
  return translation ? translation.name.trim().replace(/\s+/g, ' ') : null;
}

function musclesOf(exercise, name) {
  const primaries = (exercise.muscles ?? [])
    .map((muscle) => MUSCLES[muscle.name])
    .filter(Boolean);
  const secondaries = (exercise.muscles_secondary ?? [])
    .map((muscle) => MUSCLES[muscle.name])
    .filter(Boolean);

  // A name rule WINS, for the three muscles wger cannot express — see the note
  // on NAME_MUSCLES for why deferring to wger there is deferring to a forced
  // choice. Everywhere else wger's answer stands.
  const byName = NAME_MUSCLES.find(([pattern]) => pattern.test(name))?.[1];
  const primary = byName ?? primaries[0] ?? null;
  if (primary === null) return null;

  const rest = [...new Set([...primaries.slice(1), ...secondaries])].filter(
    (muscle) => muscle !== primary,
  );
  return { primary, secondary: rest };
}

function equipmentOf(exercise, name) {
  const stated = (exercise.equipment ?? []).map((item) => EQUIPMENT[item.name]).find(Boolean);
  if (stated) return stated;
  return NAME_EQUIPMENT.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/** The main image at 400 px, or null. */
function imageOf(exercise) {
  const images = exercise.images ?? [];
  if (images.length === 0) return null;
  const main = images.find((image) => image.is_main) ?? images[0];
  const url = main.thumbnails?.medium ?? main.image;
  if (!url) return null;
  return {
    url,
    author: (main.license_author ?? '').trim(),
    licence: main.license,
    source: (main.license_object_url ?? '').trim(),
  };
}

async function main() {
  const licences = new Map(
    (await getAll('license')).map((item) => [item.id, item.short_name]),
  );
  const exercises = await getAll('exerciseinfo');

  const entries = [];
  const seen = new Set();
  const authors = new Map();
  let noName = 0;
  let noMuscle = 0;

  for (const exercise of exercises) {
    const name = frenchName(exercise);
    if (name === null) {
      noName += 1;
      continue;
    }

    const muscles = musclesOf(exercise, name);
    if (muscles === null) {
      // No primary muscle is not a usable exercise: the column is NOT NULL, and
      // an exercise that lights nothing on the body map is one the map cannot
      // explain. Dropped rather than guessed at.
      noMuscle += 1;
      continue;
    }

    const key = slug(name);
    // Two French names can slug to the same thing, and the name is what the
    // install is idempotent on — so a collision would silently install one of
    // the two. First one wins, deterministically, because the API returns them
    // in id order.
    if (key === '' || seen.has(key)) continue;
    seen.add(key);

    entries.push({
      key,
      name,
      primaryMuscle: muscles.primary,
      secondaryMuscles: muscles.secondary,
      equipment: equipmentOf(exercise, name),
      tracksDuration: TIMED.test(name),
      image: imageOf(exercise),
    });
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));

  // Images, downloaded once and committed.
  rmSync(IMAGES_DIR, { recursive: true, force: true });
  mkdirSync(IMAGES_DIR, { recursive: true });

  let downloaded = 0;
  for (const entry of entries) {
    if (entry.image === null) continue;
    const response = await fetch(entry.image.url);
    if (!response.ok) {
      entry.image = null;
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(IMAGES_DIR, `${entry.key}.png`), bytes);
    downloaded += 1;
    const who = entry.image.author || '(non nommé)';
    authors.set(who, (authors.get(who) ?? 0) + 1);
    process.stderr.write(`\r  images: ${downloaded}…`);
  }
  process.stderr.write('\n');

  writeFileSync(CATALOG_OUT, catalogModule(entries), 'utf8');
  writeFileSync(IMAGES_OUT, imagesModule(entries), 'utf8');
  writeFileSync(LICENCE_OUT, licenceFile(entries, authors, licences), 'utf8');

  const bytes = readdirSync(IMAGES_DIR).reduce(
    (total, file) => total + statSync(join(IMAGES_DIR, file)).size,
    0,
  );

  process.stdout.write(
    `\n${entries.length} exercises, ${downloaded} with an image.\n` +
      `dropped: ${noName} with no French name, ${noMuscle} with no usable muscle.\n` +
      `images: ${(bytes / 1024 / 1024).toFixed(1)} MB in assets/exercises/\n` +
      `no equipment stated: ${entries.filter((e) => e.equipment === null).length}\n`,
  );
}

function catalogModule(entries) {
  const rows = entries
    .map((entry) => {
      const secondary =
        entry.secondaryMuscles.length === 0
          ? '[]'
          : `[${entry.secondaryMuscles.map((m) => JSON.stringify(m)).join(', ')}]`;
      const fields = [
        `key: ${JSON.stringify(entry.key)}`,
        `name: ${JSON.stringify(entry.name)}`,
        `primaryMuscle: ${JSON.stringify(entry.primaryMuscle)}`,
        `secondaryMuscles: ${secondary}`,
        `equipment: ${entry.equipment === null ? 'null' : JSON.stringify(entry.equipment)}`,
      ];
      if (entry.tracksDuration) fields.push('tracksDuration: true');
      if (entry.image !== null) fields.push('hasImage: true');
      return `  { ${fields.join(', ')} },`;
    })
    .join('\n');

  return `// GENERATED by scripts/fetch-exercise-catalog.mjs. Do not edit.
//
// Exercise data from wger (https://wger.de), under CC BY-SA and CC0 depending
// on the record. The notice and the per-image credits travel with it in
// ./LICENSE.md, in this folder.

import type { Equipment, Muscle } from '@/core/db/schema';

/** One catalogue entry, before it becomes an exercise. */
export interface CatalogExercise {
  /**
   * Stable key, and the media reference.
   *
   * It is what \`exercise.media_uri\` holds, prefixed — see MEDIA_SCHEME. Derived
   * from the French name, so it is readable in a database dump, and stable
   * because an archive exported today has to find its drawing in a binary built
   * next year.
   */
  key: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  /**
   * NULL means "not stated", which is a real answer rather than a gap.
   *
   * wger has no generic "machine" and leaves many entries with no equipment at
   * all; a name rule fills in what it can name for certain. What is left keeps
   * NULL, and slice 10 already decided what that means: an exercise with no
   * equipment matches NO filter, because pretending it matches would assert
   * something nobody said.
   */
  equipment: Equipment | null;
  /** Measured in seconds rather than repetitions (specs 14.21 no 1). */
  tracksDuration?: boolean;
  /** Whether assets/exercises/<key>.png exists. */
  hasImage?: boolean;
}

export const EXERCISE_CATALOG: readonly CatalogExercise[] = [
${rows}
];
`;
}

function imagesModule(entries) {
  const rows = entries
    .filter((entry) => entry.image !== null)
    .map(
      (entry) =>
        `  ${JSON.stringify(entry.key)}: require('../../../../assets/exercises/${entry.key}.png') as number,`,
    )
    .join('\n');

  return `// GENERATED by scripts/fetch-exercise-catalog.mjs. Do not edit.
//
// The image files themselves, kept apart from the catalogue that names them.
//
// \`require\` of a .png is a Metro instruction and nothing else: Node cannot
// parse it. Keeping it here is what lets catalog.generated.ts — the part a test
// can read — be imported from Node. The precedent is core/theme/nunito-assets.
//
// AND IT IS WHY THE BUNDLE DID NOT GROW. These are ASSETS: Hermes never parses
// them, where an inlined SVG path would be a megabyte of string constants read
// at every cold start.

export const EXERCISE_IMAGES: Record<string, number> = {
${rows}
};
`;
}

function licenceFile(entries, authors, licences) {
  const credited = [...authors]
    .sort((a, b) => b[1] - a[1])
    .map(([who, count]) => `- ${who} — ${count} image${count > 1 ? 's' : ''}`)
    .join('\n');

  const used = [...new Set(entries.map((e) => e.image?.licence).filter((id) => id !== undefined))]
    .map((id) => `- ${licences.get(id) ?? `licence ${id}`}`)
    .join('\n');

  return `# Exercise catalogue — attribution and licence

The exercise names, muscles and equipment in \`catalog.generated.ts\`, and every
image in \`assets/exercises/\`, come from:

**wger** — <https://wger.de> — the wger Workout Manager exercise database.

The database is community-contributed and each record carries its own licence.
Those in use here:

${used}

Fetched by \`scripts/fetch-exercise-catalog.mjs\`. Nothing is modified: the images
are wger's own 400 px renderings, byte for byte, and the names are the French
translations as wger's contributors wrote them. What this project adds is a
mapping onto its own fifteen muscles and eight equipment values, which is its
own work and not an adaptation of wger's.

---

## Image credits

CC BY and CC BY-SA require the author to be named where one is recorded. wger
records it per image; where it is blank, the work is credited to the wger
project itself.

${credited}

A large share of these are credited to **Everkinetic**, whose drawings wger
imported and translated — the same source this slice used before switching, and
the reason switching cost nothing in coverage.

---

## Why a licensed asset is in this repository, where real data never is

D15 and the \`.gitignore\` forbid real exports and anything derived from real
measurements reaching a public repository. That rule is about **the user's
data**, and it is not this.

The precedent is already here: \`assets/fonts/\` holds four Nunito files with
\`OFL.txt\` beside them. A licensed third-party asset, carried with its notice, is
a different thing from a real workout or a real weight.

## And why the licence matters even though one person uses the application

Because the REPOSITORY is public (D15) and the IPAs are published as GitHub
releases. Copyright restricts copying and distribution, not private use — and
both of those are distribution, whoever runs the app afterwards. "Only I use it"
would hold for a private repository with private releases; it does not hold
here, and CC BY-SA costs nothing worth taking a risk to avoid.

## What was refused, and why

| Source | Media | Actual licence | Verdict |
| --- | --- | --- | --- |
| Gym Visual, redistributed by several "MIT" datasets | animated GIF | The repository is MIT; the media is © Gym Visual and its terms require buying a licence to use it | refused |
| \`yuhonas/free-exercise-db\` | photographs | Declares itself Unlicense. The images are Bodybuilding.com's studio photographs of an identifiable person; the declaration was not the declarant's to make | refused |
| \`everkinetic/data\` | two-pose SVG | CC BY-SA 4.0, genuinely granted | used first, then superseded — wger contains it, in French |
| **wger** | line-art PNG | **CC BY-SA 3 and 4, credited per image** | **in use** |
`;
}

await main();
