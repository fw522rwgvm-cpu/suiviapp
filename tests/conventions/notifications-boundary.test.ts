import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * expo-notifications is reached from one directory, and nowhere else.
 *
 * ## WHY THIS IS A TEST RATHER THAN A NOTE
 *
 * Same device as the zod boundary, for a problem with a sharper edge. zod in
 * the wrong place costs a second declaration of the schema; expo-notifications
 * in the wrong place costs a CI CYCLE TO DIAGNOSE — the JS bundle does not
 * carry a native module, so `npm run bundle:ios` stays green while the screen
 * crashes on the device. Both @react-native-picker/picker and expo-camera
 * taught that, each once.
 *
 * The cheapest wrong move available is to reach for the package from the
 * Settings screen — scheduling something is one line, and it would work in
 * development against a binary that happens to have been rebuilt. The boundary
 * is asserted where erosion is visible: a build that fails, naming the file.
 *
 * MOVING THE BOUNDARY IS ALLOWED. Widening the list below is a deliberate act
 * with a diff attached, which is the entire point. What is refused is doing it
 * without noticing.
 */

const ROOT = join(process.cwd(), 'src');

/** The one door to iOS. Widen deliberately, never by reflex. */
const ALLOWED = ['features/notifications/native'];

const PACKAGE = 'expo-notifications';

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

function importsPackage(source: string): boolean {
  // Covers `import ... from 'expo-notifications'`, `import 'expo-notifications'`
  // and `require('expo-notifications')`, and does not match a subpath of some
  // other package that merely ends the same way.
  return new RegExp(`(from|require\\()\\s*['"]${PACKAGE}(/[^'"]*)?['"]`).test(source);
}

describe('the expo-notifications boundary', () => {
  it('is imported only from features/notifications/native', () => {
    const offenders = sourceFiles(ROOT)
      .filter((path) => importsPackage(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path).split(sep).join('/'))
      .filter((path) => !ALLOWED.some((allowed) => path.startsWith(`${allowed}/`)));

    expect(offenders).toEqual([]);
  });

  it('is imported from there at all, so the boundary is not vacuously true', () => {
    // A test that passes because nothing imports the package would keep passing
    // if the native host were deleted, and the application would simply stop
    // scheduling. Asserted from the other side.
    const importers = sourceFiles(ROOT)
      .filter((path) => importsPackage(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path).split(sep).join('/'));

    expect(importers.length).toBeGreaterThan(0);
  });

  it('keeps the domain free of it, so the plan stays testable in Node', () => {
    // The consequence that matters day to day: buildPlan, the occurrences and
    // the diff run in this very suite, under three timezones, because nothing
    // they touch reaches a native module.
    const domain = sourceFiles(join(ROOT, 'features/notifications/domain'));
    const tainted = domain.filter((path) => importsPackage(readFileSync(path, 'utf8')));

    expect(tainted).toEqual([]);
  });
});
