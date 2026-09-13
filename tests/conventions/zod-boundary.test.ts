import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * zod validates what is foreign, and nothing else.
 *
 * ## WHY THIS IS A TEST RATHER THAN A NOTE
 *
 * The decision was taken twice, and the second time under pressure. Slice 2
 * declined zod for the export payload because that payload is not foreign —
 * its columns are already described by the Drizzle objects the migrations are
 * generated from, so a zod schema would be a second declaration of the same
 * schema, maintained by hand, free to drift from the first, inside the
 * validator of the only safety net the project has. Slice 4 then added zod for
 * Open Food Facts, where the payload genuinely is foreign.
 *
 * From that moment the library is in the tree, and every boundary-shaped
 * problem starts to look like a zod problem. The cheapest wrong move available
 * is to "tidy up" validate-payload.ts by rewriting it as a schema, which would
 * undo slice 2's reasoning silently and leave two descriptions of the database
 * to keep in step forever.
 *
 * So the boundary is asserted where erosion is visible: a build that fails,
 * naming the file. This is the same device as the test refusing the spelling
 * 'openfoodfacts' — a decision worth taking is a decision worth defending
 * against whoever next has a plausible reason to retake it.
 *
 * MOVING THE BOUNDARY IS ALLOWED. Widening the list below is a deliberate act
 * with a diff attached, which is the entire point. What is refused is doing it
 * without noticing.
 */

const ROOT = join(process.cwd(), 'src');

/** Where a foreign payload actually arrives. Widen deliberately, never by reflex. */
const ALLOWED = ['features/nutrition/off'];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/** Posix-style path relative to src/, so the allow-list reads the same anywhere. */
function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join('/');
}

const IMPORTS_ZOD = /(?:from\s+['"]zod(?:\/[^'"]*)?['"]|require\(\s*['"]zod)/;

describe('zod stays at the foreign boundary', () => {
  it('is imported only where a foreign payload arrives', () => {
    const offenders = sourceFiles(ROOT)
      .map(repoPath)
      .filter((path) => !ALLOWED.some((allowed) => path.startsWith(`${allowed}/`)))
      .filter((path) => IMPORTS_ZOD.test(readFileSync(join(ROOT, path), 'utf8')));

    expect(
      offenders,
      'zod belongs at a boundary where the payload is genuinely foreign. ' +
        'The export payload is not: it is already described by the Drizzle schema, ' +
        'and a zod copy of it would be a second declaration free to drift from the ' +
        'first, inside the validator of the only safety net there is (slice 2). ' +
        'If a new boundary really has arrived, widen ALLOWED in this file on purpose.',
    ).toEqual([]);
  });

  it('is imported where the Open Food Facts payload arrives, so this test can fail', () => {
    // The assertion above passes trivially on a repository with no zod in it
    // at all. This one is what makes it mean something: it fails if the parser
    // stops using zod, which is when the test above quietly stops checking.
    const parser = readFileSync(
      join(ROOT, 'features/nutrition/off/off-parse.ts'),
      'utf8',
    );

    expect(IMPORTS_ZOD.test(parser)).toBe(true);
  });

  it('keeps the export validator free of it, which is the decision at stake', () => {
    const validator = readFileSync(
      join(ROOT, 'features/backup/domain/validate-payload.ts'),
      'utf8',
    );

    expect(IMPORTS_ZOD.test(validator)).toBe(false);
  });
});
