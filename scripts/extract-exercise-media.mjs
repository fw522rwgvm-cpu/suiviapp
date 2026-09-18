#!/usr/bin/env node
/**
 * Turns everkinetic's two-pose SVGs into the TypeScript module the catalogue
 * draws (specs 10.1, slice 11).
 *
 * ## THE LICENCE, AND IT IS THE REASON THIS SCRIPT IS SHORT
 *
 * everkinetic/data is CC-BY-SA 4.0, by Greg Priday. That is COPYLEFT, which
 * this project refused once before — Wikimedia was turned down for the body map
 * on exactly that ground — so it is used here only because it was approved
 * explicitly, and because nothing else exists: every animated exercise set in
 * circulation traces back to Gym Visual or another commercial vendor, and the
 * one calling itself public domain is Bodybuilding.com's photographs relabelled
 * by somebody who did not own them.
 *
 * What ShareAlike asks: attribution, the licence text travelling with the work,
 * and any ADAPTATION licensed the same way. The generated module is an
 * adaptation, so src/features/strength/catalog/LICENSE.md carries the
 * notice in the same folder, so moving a directory cannot separate them —
 * which is what assets/fonts/OFL.txt already does for Nunito. CC 4.0 says in as
 * many words that a collection does not put the rest of the collection under
 * the licence, so the application's own code is untouched.
 *
 * ## WHY A SCRIPT, AND WHY ITS OUTPUT IS COMMITTED
 *
 * The same two reasons extract-body-map.mjs gives. A build step fetching from
 * GitHub would make every CI run depend on a third-party repository staying up,
 * to regenerate a file that never changes. And an asset nobody can regenerate
 * is a decision nobody can revisit — the rule generate-icons.mjs was written
 * under.
 *
 * Usage:
 *   node scripts/extract-exercise-media.mjs
 *
 * ## THREE THINGS CHECKED RATHER THAN ASSUMED
 *
 * 1. THE TWO POSES SHARE A viewBox. Measured on five exercises before any of
 *    this was written, because the PNG renderings do NOT — they are cropped to
 *    their own ink, 947x1064 against 948x860 for the bench press, which would
 *    have made a two-frame loop jump. The SVGs are not cropped, both poses of
 *    an exercise carry the same box, and the script REFUSES a pair that does
 *    not: an alignment that silently stops holding is the defect this check
 *    exists for.
 *
 * 2. THE STRUCTURE IS UNIFORM: one <svg>, two <g> — fill #FFF for the paper and
 *    #333 for the ink — and paths under them. No gradient, no filter, no clip
 *    path, no embedded raster. That is what react-native-svg renders, and it is
 *    what lets the drawing take the theme's colours instead of being a white
 *    rectangle on a dark card.
 *
 * 3. THE PATHS ARE COPIED VERBATIM. Slice 10's lesson, paid for in wrong arms:
 *    SVG runs numbers together without separators, so `0.999.5` is 0.999 then
 *    0.5, and rounding the first to `1` yields `1.5` — ONE number where there
 *    were two. Nothing here reformats a `d` attribute.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'src/features/strength/catalog/drawings.generated.ts');
const BASE = 'https://raw.githubusercontent.com/everkinetic/data/master/dist/svg';

/**
 * Catalogue key -> everkinetic's numeric id.
 *
 * Kept HERE rather than on the catalogue entries, and that is deliberate: the
 * catalogue is what the application ships and reasons about, in French, with
 * its own vocabulary. This table is provenance — it belongs to the extraction,
 * it is read once by hand, and nothing at runtime should be able to reach a
 * third party's identifier.
 *
 * `gainage` is absent on purpose: the source has a side plank and no front
 * plank. It ships without a drawing, which exercises the substitute path specs
 * 5.4 no 3 requires, on day one rather than on the first user-chosen file.
 */
const SOURCES = {
  'developpe-couche': '0042',
  'developpe-incline-haltere': '0061',
  'ecarte-couche': '0056',
  pompes: '0077',
  dips: '0054',
  tractions: '0087',
  /*
    NOT the wide-grip pulldown (0097) nor the plain bent-over row (0298): the
    source lists both in its JSON and ships a drawing for NEITHER — 293
    exercises, 269 drawings. Found by the script failing on a 404, which is why
    it fails rather than skipping. The two nearest drawn movements are used
    instead, and what differs is a grip.
  */
  'tirage-vertical': '0096',
  'rowing-barre': '0026',
  shrugs: '0030',
  'souleve-de-terre': '0099',
  'souleve-de-terre-roumain': '0118',
  'extensions-lombaires': '0103',
  'developpe-militaire': '0004',
  'elevations-laterales': '0018',
  oiseau: '0023',
  'curl-barre': '0211',
  'curl-marteau': '0213',
  'extension-triceps-poulie': '0205',
  'dips-sur-banc': '0162',
  squat: '0122',
  'presse-a-cuisses': '0127',
  fentes: '0115',
  'leg-extension': '0142',
  'leg-curl': '0117',
  'machine-a-adducteurs': '0157',
  'mollets-debout': '0278',
  'mollets-assis': '0279',
  'mollets-elastique': '0274',
  crunch: '0291',
  'releve-de-jambes': '0021',
  'crunch-oblique': '0293',
  'gainage-lateral': '0113',
};

/** The two poses of a movement: the bottom and the top. */
const POSES = { relaxed: 'relaxation', contracted: 'tension' };

/**
 * Which group is the paper and which is the ink — decided by POSITION, checked
 * by brightness.
 *
 * ## THE FIRST RULE WAS BY HEX, AND THE SOURCE DISAGREED
 *
 * Five files were inspected before this script was written, and all five used
 * exactly #FFF and #333. Matching those two hexes failed on the sixth — #fff
 * lowercase — and then on the deadlift, whose ink is #2e2e2c in one pose and
 * #40413f in the other. Surveyed across all sixty-four files afterwards: the
 * structure is two groups, paper then ink, in 64 of 64; the ink hex varies in
 * 2 of 64.
 *
 * So the STRUCTURE is what holds and the colour is what drifts. The order
 * decides, and brightness is only a guard against a drawing that is not this
 * kind of drawing at all — a coloured one would come out as a silhouette with
 * nothing to say about it.
 *
 * Mapping them to two theme tokens rather than keeping the hexes is the whole
 * reason to take the SVG instead of the PNG: black ink on a white sheet inside
 * a dark card is a hole in the page.
 */
const PAPER_MIN_BRIGHTNESS = 0.8;
const INK_MAX_BRIGHTNESS = 0.45;

/** 0..1, and deliberately not a luminance: this is a threshold, not a contrast. */
function brightness(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const channels = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
  return (channels[0] + channels[1] + channels[2]) / 3;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

/**
 * Reads the viewBox and the paths of each group.
 *
 * By bracket and quote matching rather than by regex over the whole file: a
 * path's `d` contains commas, minus signs and letters, and anything that
 * guesses where an attribute ends gets it wrong on the first curve. The same
 * reason extract-body-map.mjs parses by brackets.
 */
function parse(svg, label) {
  const box = /viewBox="([^"]+)"/.exec(svg);
  if (box === null) throw new Error(`${label}: no viewBox`);

  const groups = { paper: [], ink: [] };
  const order = ['paper', 'ink'];
  let cursor = 0;
  let seen = 0;
  let current = null;

  while (cursor < svg.length) {
    const open = svg.indexOf('<', cursor);
    if (open === -1) break;
    const close = svg.indexOf('>', open);
    if (close === -1) break;
    const tag = svg.slice(open, close + 1);
    cursor = close + 1;

    if (tag.startsWith('<g')) {
      const fill = /fill="([^"]+)"/.exec(tag);
      if (fill === null) throw new Error(`${label}: a group has no fill`);
      const role = order[seen];
      if (role === undefined) throw new Error(`${label}: more than two groups`);

      const level = brightness(fill[1]);
      if (level === null) throw new Error(`${label}: fill ${fill[1]} is not a hex colour`);
      if (role === 'paper' && level < PAPER_MIN_BRIGHTNESS) {
        throw new Error(`${label}: the first group is not paper (${fill[1]})`);
      }
      if (role === 'ink' && level > INK_MAX_BRIGHTNESS) {
        throw new Error(`${label}: the second group is not ink (${fill[1]})`);
      }

      current = role;
      seen += 1;
      continue;
    }
    if (tag.startsWith('</g')) {
      current = null;
      continue;
    }
    if (tag.startsWith('<path')) {
      if (current === null) throw new Error(`${label}: a path sits outside any group`);
      const d = /\sd="([^"]*)"/.exec(tag);
      if (d === null) throw new Error(`${label}: a path has no d`);
      // VERBATIM. Never trimmed, never reformatted, never rounded.
      groups[current].push(d[1]);
      continue;
    }
  }

  if (seen !== 2) throw new Error(`${label}: expected two groups, found ${seen}`);
  if (groups.ink.length === 0) throw new Error(`${label}: no ink at all`);
  return { viewBox: box[1], ...groups };
}

async function main() {
  const entries = [];
  const keys = Object.keys(SOURCES).sort();

  for (const key of keys) {
    const id = SOURCES[key];
    const poses = {};
    for (const [name, suffix] of Object.entries(POSES)) {
      const url = `${BASE}/${id}-${suffix}.svg`;
      poses[name] = parse(await fetchText(url), `${key}/${name}`);
    }

    /**
     * THE CHECK THAT MAKES THE TWO-FRAME LOOP HONEST.
     *
     * A common box is what lets the poses simply alternate: no translation, no
     * scaling, no measured offsets. It holds for every pair in the source — and
     * a pair where it stopped holding would show as a figure jumping between
     * frames, which is exactly the kind of thing nothing here can look at. So
     * it is refused rather than compensated for.
     */
    if (poses.relaxed.viewBox !== poses.contracted.viewBox) {
      throw new Error(
        `${key}: the two poses do not share a viewBox ` +
          `(${poses.relaxed.viewBox} vs ${poses.contracted.viewBox})`,
      );
    }

    entries.push({ key, viewBox: poses.relaxed.viewBox, poses });
    process.stdout.write(
      `${key.padEnd(30)} ${id}  ${poses.relaxed.viewBox.padEnd(14)} ` +
        `${poses.relaxed.ink.length + poses.contracted.ink.length} ink paths\n`,
    );
  }

  const body = entries
    .map((entry) => {
      const pose = (name) => {
        const data = entry.poses[name];
        const list = (paths) =>
          paths.length === 0 ? '[]' : `[\n${paths.map((d) => `      ${quote(d)},`).join('\n')}\n    ]`;
        return `    { paper: ${list(data.paper)}, ink: ${list(data.ink)} }`;
      };
      return (
        `  ${JSON.stringify(entry.key)}: {\n` +
        `    viewBox: ${JSON.stringify(entry.viewBox)},\n` +
        `    relaxed: ${pose('relaxed').trim()},\n` +
        `    contracted: ${pose('contracted').trim()},\n` +
        `  },`
      );
    })
    .join('\n');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, HEADER + body + FOOTER, 'utf8');

  const bytes = readFileSync(OUT).byteLength;
  process.stdout.write(
    `\nWrote ${OUT}\n` +
      `${entries.length} exercises, ${(bytes / 1024).toFixed(0)} KiB of path data.\n`,
  );
}

function quote(value) {
  return JSON.stringify(value);
}

const HEADER = `// GENERATED by scripts/extract-exercise-media.mjs. Do not edit.
//
// Path data from everkinetic/data (https://github.com/everkinetic/data), by
// Greg Priday, under Creative Commons Attribution-ShareAlike 4.0 International.
// The notice and the full licence travel with it in assets/exercises/LICENSE.md.
//
// The paths are copied VERBATIM. SVG runs numbers together without separators,
// so 0.999.5 is two numbers and rounding the first to 1 makes it one — the
// defect slice 10 paid for in plausible, wrong arms.

/** One pose of a movement, as two lists of paths. */
export interface DrawingPose {
  /** Filled with the paper colour — the sheet the figure is cut out of. */
  paper: readonly string[];
  /** Filled with the ink colour — the lines. */
  ink: readonly string[];
}

export interface ExerciseDrawing {
  /**
   * Shared by both poses, which is what makes the loop a straight alternation.
   *
   * Verified at extraction and refused if it ever stops holding: the PNG
   * renderings of the same drawings are cropped to their own ink and do NOT
   * share a box, so a pair that lost this would make the figure jump between
   * frames.
   */
  viewBox: string;
  /** The bottom of the movement. */
  relaxed: DrawingPose;
  /** The top. */
  contracted: DrawingPose;
}

export const EXERCISE_DRAWINGS: Record<string, ExerciseDrawing> = {
`;

const FOOTER = `};
`;

await main();
