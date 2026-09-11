#!/usr/bin/env node
/**
 * Runs the whole suite once per timezone (D15).
 *
 * The architecture asks for at least three zones, one west of Greenwich and one
 * beyond +12, as the only way to surface a class of bug that is invisible from
 * Paris in winter. Wiring this into `npm test` rather than a separate script is
 * deliberate: a check you have to remember to run is a check you will forget.
 *
 * The suite takes well under a second, so running it three times costs nothing
 * worth optimising.
 */

import { spawnSync } from 'node:child_process';

const ZONES = [
  'UTC',
  // West of Greenwich: the zone where new Date('2026-09-10') silently becomes
  // the 9th of September.
  'America/New_York',
  // Beyond +12, where the local date can be a day ahead of UTC.
  'Pacific/Kiritimati',
];

const passthrough = process.argv.slice(2);
let failed = false;

for (const zone of ZONES) {
  console.log(`\n=== TZ=${zone} ===`);
  const result = spawnSync('npx', ['vitest', 'run', ...passthrough], {
    stdio: 'inherit',
    env: { ...process.env, TZ: zone },
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`Suite failed under TZ=${zone}`);
  }
}

if (failed) {
  // npm drops platform-specific optional dependencies whenever the tree is
  // mutated (npm/cli#4828). It has bitten this project three times, always
  // right after an `expo install`, and the error it produces names rolldown
  // rather than the cause.
  console.error(
    '\nIf the failure above says "Cannot find native binding", the dependency\n' +
      'tree lost an optional package. Rebuild it with:\n' +
      '  rm -rf node_modules package-lock.json && npm install --ignore-scripts\n' +
      '(--ignore-scripts skips better-sqlite3 rebuilding itself for nothing:\n' +
      ' it ships prebuilt binaries, and building them needs make, which this\n' +
      ' machine does not have.)',
  );
}

process.exit(failed ? 1 : 0);
