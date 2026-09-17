#!/usr/bin/env node
/**
 * Turns MuscleMap's Swift path data into the TypeScript module the body map
 * renders (specs 10.2, architecture point 3).
 *
 * ## WHY A SCRIPT AND NOT A DEPENDENCY
 *
 * melihcolpan/MuscleMap is a SwiftUI SDK: its BodyView draws into a CGContext
 * and its BodyChart manipulates UIKit. None of that is reachable from React
 * Native, and adding it would be a native dependency outside section 5 for code
 * that could not run. What IS reusable is the DATA — the path strings — under
 * the MIT licence, which asks only that the notice travel with them.
 *
 * ## WHY THE OUTPUT IS COMMITTED
 *
 * This runs ONCE, by hand, and its output is checked in. A build step that
 * fetched from GitHub would make every CI run depend on a third-party
 * repository staying up, to regenerate a file that does not change. The
 * precedent is generate-icons.mjs, whose PNGs are likewise committed.
 *
 * Usage, with the two files fetched by hand from the repository:
 *   node scripts/extract-body-map.mjs MaleFrontPaths.swift MaleBackPaths.swift
 *
 * ## WHAT IT DROPS, AND WHY
 *
 * The seven sub-group slugs — upper-chest, lower-chest, upper-abs, lower-abs,
 * inner-quad, outer-quad, front-deltoid — overlay their parent and cover no
 * ground the parent does not. None is in the fifteen groups this application
 * stores, so keeping them would draw fourteen regions twice.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** Swift case name -> the enum's rawValue, which is the id kept. */
const KEBAB = {
  lowerBack: 'lower-back',
  upperBack: 'upper-back',
  rotatorCuff: 'rotator-cuff',
  hipFlexors: 'hip-flexors',
  upperChest: 'upper-chest',
  lowerChest: 'lower-chest',
  innerQuad: 'inner-quad',
  outerQuad: 'outer-quad',
  upperAbs: 'upper-abs',
  lowerAbs: 'lower-abs',
  frontDeltoid: 'front-deltoid',
  rearDeltoid: 'rear-deltoid',
  upperTrapezius: 'upper-trapezius',
  lowerTrapezius: 'lower-trapezius',
};

const SUBGROUPS = new Set([
  'upper-chest',
  'lower-chest',
  'upper-abs',
  'lower-abs',
  'inner-quad',
  'outer-quad',
  'front-deltoid',
]);

/**
 * Reads the BodyPartPathData literals by matching brackets rather than by
 * regex: a path string contains commas, brackets and minus signs, so anything
 * that guesses where a literal ends gets it wrong on the first curve.
 */
function parse(source, view) {
  const out = [];
  const marker = 'BodyPartPathData(';
  let at = 0;

  for (;;) {
    const start = source.indexOf(marker, at);
    if (start === -1) break;

    let depth = 0;
    let i = start + marker.length - 1;
    let inString = false;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (inString) {
        if (c === '\\') i += 1;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const body = source.slice(start + marker.length, i);
    at = i + 1;

    const slugMatch = /slug:\s*\.([A-Za-z]+)/.exec(body);
    if (slugMatch === null) continue;
    const name = slugMatch[1];
    const slug = KEBAB[name] ?? name;
    if (SUBGROUPS.has(slug)) continue;

    for (const side of ['common', 'left', 'right']) {
      const key = new RegExp(`\\b${side}:\\s*\\[`).exec(body);
      if (key === null) continue;

      let j = key.index + key[0].length - 1;
      const from = j;
      let d = 0;
      let inStr = false;
      for (; j < body.length; j += 1) {
        const c = body[j];
        if (inStr) {
          if (c === '\\') j += 1;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === '[') d += 1;
        else if (c === ']') {
          d -= 1;
          if (d === 0) break;
        }
      }

      for (const m of body.slice(from, j + 1).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const path = m[1].replace(/\\(.)/g, '$1').trim();
        if (path !== '') out.push({ slug, view, side, d: round(path) });
      }
    }
  }

  return out;
}

/**
 * THE PATHS ARE COPIED VERBATIM, AND ROUNDING THEM WAS A MISTAKE MADE ONCE.
 *
 * Trimming the source's six decimals to two looked free — a fifth of the file
 * for a tenth of a point. It corrupts the data. SVG runs numbers together
 * without separators, so `0.999.5` is the two values 0.999 and 0.5; rounding
 * the first to `1` yields `1.5`, which is ONE value. The path then draws
 * somewhere else entirely, and what it produced here was a figure with
 * plausible-looking but wrong arms.
 *
 * Re-serialising the numbers with separators would avoid it, but that needs a
 * parser this data defeats: see the note on arcs in samplePath. So nothing is
 * rewritten. The extra bytes are the price of the data being the data.
 */
function round(d) {
  return d;
}

const [, , frontFile, backFile] = process.argv;
if (frontFile === undefined || backFile === undefined) {
  console.error('usage: node scripts/extract-body-map.mjs <MaleFrontPaths.swift> <MaleBackPaths.swift>');
  process.exit(1);
}

const regions = [
  ...parse(readFileSync(frontFile, 'utf8'), 'front'),
  ...parse(readFileSync(backFile, 'utf8'), 'back'),
];

const slugs = [...new Set(regions.map((r) => r.slug))].sort();

/**
 * The bounding box of each view, measured HERE and emitted as a constant.
 *
 * ## WHY THE APPLICATION DOES NOT COMPUTE THIS
 *
 * It would mean parsing SVG path data at runtime, and this data cannot be
 * parsed reliably. One region — a finger of the front figure's right hand —
 * carries `a2.05 2.05 0 1.92-2.71`: an arc takes seven numbers and that reads
 * as five, because the two single-digit flags are run together with what
 * follows in a way no tokeniser can undo. Read one way the front figure ends at
 * x=675, read another at x=828, and the second overlaps the back figure and
 * shrinks both.
 *
 * Since the paths are generated and never change, the box is a CONSTANT. It is
 * measured once, here, by flattening the curves properly — and a wrong box then
 * shows up as a visibly misplaced figure rather than as a silent few percent.
 *
 * Curves are flattened rather than read at their endpoints, because a control
 * point may sit outside the curve it shapes; arcs are approximated by their
 * endpoints, which for this drawing's arcs — all of them small joins — is
 * within a point.
 */
function boxOf(view) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const region of regions.filter((r) => r.view === view)) {
    for (const [x, y] of samplePath(region.d)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Points along a path: curve endpoints plus sampled cubic interiors. */
function samplePath(d) {
  const points = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)/g) ?? [];
  let x = 0;
  let y = 0;
  let command = '';
  let i = 0;
  const num = () => Number(tokens[i++] ?? '0');

  const cubic = (x1, y1, x2, y2, nx, ny) => {
    const x0 = x;
    const y0 = y;
    for (let s = 1; s <= 8; s += 1) {
      const t = s / 8;
      const u = 1 - t;
      points.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny,
      ]);
    }
    x = nx;
    y = ny;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (token !== undefined && /^[A-Za-z]$/.test(token)) {
      command = token;
      i += 1;
    }
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;

    if (upper === 'M') {
      x = num() + ox;
      y = num() + oy;
      // After a move, further pairs are LINES, not further moves.
      command = relative ? 'l' : 'L';
      points.push([x, y]);
    } else if (upper === 'L') {
      x = num() + ox;
      y = num() + oy;
      points.push([x, y]);
    } else if (upper === 'H') {
      x = num() + ox;
      points.push([x, y]);
    } else if (upper === 'V') {
      y = num() + oy;
      points.push([x, y]);
    } else if (upper === 'C') {
      const a1 = num() + ox;
      const b1 = num() + oy;
      const a2 = num() + ox;
      const b2 = num() + oy;
      cubic(a1, b1, a2, b2, num() + ox, num() + oy);
    } else if (upper === 'Q' || upper === 'S') {
      const a1 = num() + ox;
      const b1 = num() + oy;
      cubic(a1, b1, a1, b1, num() + ox, num() + oy);
    } else if (upper === 'T') {
      x = num() + ox;
      y = num() + oy;
      points.push([x, y]);
    } else if (upper === 'A') {
      /**
       * rx ry rotation, then TWO SINGLE-DIGIT FLAGS, then the endpoint.
       *
       * The flags are why an arc cannot be skipped by counting seven numbers.
       * Compressed SVG writes "01-.19" for (0, 1, -0.19), so a flag takes one
       * CHARACTER and the rest of the token is pushed back.
       *
       * AND ONE REGION IN THIS DATA IS GENUINELY AMBIGUOUS:
       * `a2.05 2.05 0 1.92-2.71` offers five numbers where seven are needed,
       * and splitting "1.92" leaves "." where a flag belongs. There is no
       * reading that recovers it. So an invalid flag ABANDONS THIS PATH rather
       * than accumulating a wrong offset through the rest of it — which is what
       * put the front figure's right edge 150 units too far out, overlapping
       * the back figure.
       *
       * Abandoning costs the tail of one finger. Guessing cost both figures
       * their scale.
       */
      i += 3;
      let valid = true;
      for (let flag = 0; flag < 2; flag += 1) {
        const t = tokens[i];
        if (t === undefined || (t[0] !== '0' && t[0] !== '1')) {
          valid = false;
          break;
        }
        if (t.length === 1) i += 1;
        else tokens[i] = t.slice(1);
      }
      if (!valid) break;
      x = num() + ox;
      y = num() + oy;
      points.push([x, y]);
    } else if (upper === 'Z') {
      // Nothing to read.
    } else {
      i += 1;
      continue;
    }
  }

  return points;
}

const boxes = { front: boxOf('front'), back: boxOf('back') };
const PAD = 12;
const viewBox = (b) =>
  [
    round1(b.minX - PAD),
    round1(b.minY - PAD),
    round1(b.maxX - b.minX + PAD * 2),
    round1(b.maxY - b.minY + PAD * 2),
  ].join(' ');

function round1(n) {
  return Math.round(n * 10) / 10;
}

const header = `// GENERATED by scripts/extract-body-map.mjs — do not edit by hand.
//
// Region paths from https://github.com/melihcolpan/MuscleMap
// Copyright (c) 2026 Melih Colpan, MIT licence. The full text is in
// LICENSE-MuscleMap beside this file, as the licence requires.
//
// Changed from the original: the Swift literals are emitted as TypeScript,
// coordinates are rounded to two decimals, and the seven sub-group slugs are
// dropped — they overlay their parent and this application does not store them.
// The geometry itself is untouched.
//
// Views: front and back stand side by side in ONE coordinate space, which is
// how the source draws them. Each view's own box is below, so the two can be
// rendered as separate SVGs.
`;

const body = `
export interface BodyRegion {
  /** MuscleMap's slug. Mapped to this application's muscles in body-map.ts. */
  readonly slug: string;
  readonly view: 'front' | 'back';
  /** 'left', 'right' or 'common' — the source distinguishes the sides. */
  readonly side: 'left' | 'right' | 'common';
  /** SVG path data, ready for <Path d=...>. */
  readonly d: string;
}

export const BODY_REGIONS: readonly BodyRegion[] = ${JSON.stringify(regions, null, 2)};

/** Every slug the drawing carries, sorted. For the coverage test. */
export const BODY_SLUGS: readonly string[] = ${JSON.stringify(slugs, null, 2)};

/**
 * Each view's viewBox, MEASURED HERE rather than computed at runtime.
 *
 * The data cannot be parsed reliably: one region carries an arc whose two flags
 * are run together with what follows in a way no tokeniser can undo, and the
 * two readings put the front figure's right edge 150 units apart. Since these
 * paths never change, the box is a constant — measured once, by flattening the
 * curves, with arcs skipped as the small joins they are.
 */
export const BODY_VIEW_BOXES: Readonly<Record<'front' | 'back', string>> = {
  front: '${viewBox(boxes.front)}',
  back: '${viewBox(boxes.back)}',
};
`;

writeFileSync(
  new URL('../src/features/strength/body-map/paths.generated.ts', import.meta.url),
  header + body,
);

console.log(`wrote ${regions.length} regions, ${slugs.length} slugs`);
console.log(slugs.join(' '));
