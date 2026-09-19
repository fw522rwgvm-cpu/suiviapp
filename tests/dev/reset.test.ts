import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { toLocalDate } from '../../src/core/date';
import { newId } from '../../src/core/id';
import { MUSCLES, exercise, session, sessionBlock, type SessionId } from '../../src/core/db/schema';
import { resetDatabase } from '../../src/dev/reset';
import { allSchemaTableNames } from '../../src/features/backup/domain/table-catalog';
import {
  CATALOG_SEEDED_KEY,
  installCatalogExercises,
  installDefaultCatalogOnce,
  defaultCatalogKeys,
} from '../../src/features/strength/data/catalog-writes';
import { EXERCISE_CATALOG } from '../../src/features/strength/catalog/exercises';
import { readSetting } from '../../src/features/settings/data/settings-reads';
import { writeSetting } from '../../src/features/settings/data/settings-writes';
import { seedJournal } from '../../src/dev/seed';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * Emptying the database (D15), against a real SQLite file.
 *
 * It is a development-only button, but what it has to be right about is not:
 * a reset that silently left a table behind would look like it worked, and the
 * stale rows would surface as impossible data days later.
 */

let db: TestDatabase;

beforeEach(() => {
  db = openTestDatabase();
});

afterEach(() => {
  db.close();
});

function count(table: string): number {
  const rows = db.db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM "${table}"`));
  return rows[0]?.n ?? 0;
}

describe('emptying the database', () => {
  it('LEAVES NOT ONE ROW IN ANY TABLE OF THE SCHEMA', () => {
    /**
     * The assertion is over allSchemaTableNames() rather than over a list
     * written here, and that is the whole point: a table added in slice 12 is
     * covered without anybody remembering, and a reset that missed one fails
     * here rather than on a phone.
     */
    seedJournal(db.db, { endDate: toLocalDate('2026-09-19'), days: 30, seed: 7 });
    installCatalogExercises(db.db, EXERCISE_CATALOG.slice(0, 5).map((e) => e.key), 2.5);
    writeSetting(db.db, 'theme', 'dark');
    const sessionId = newId<SessionId>();
    db.db
      .insert(session)
      .values({
        id: sessionId,
        date: toLocalDate('2026-09-19'),
        status: 'done',
        startedAt: 1,
        endedAt: 2,
      })
      .run();
    db.db.insert(sessionBlock).values({ id: newId(), sessionId, position: 0 }).run();

    // Something was actually there, or the assertions below prove nothing.
    const filled = allSchemaTableNames().filter((name) => count(name) > 0);
    expect(filled.length).toBeGreaterThan(5);

    resetDatabase(db.db);

    for (const name of allSchemaTableNames()) {
      expect(count(name), `${name} still holds rows`).toBe(0);
    }
  });

  it('reports how many tables it cleared', () => {
    expect(resetDatabase(db.db).tables).toBe(allSchemaTableNames().length);
  });

  it('leaves the connection with its foreign keys back on', () => {
    /**
     * The PRAGMA is turned off around the delete — journal_entry references
     * itself and session_set references exercise, so no order of DELETEs
     * satisfies every row. Leaving it off afterwards would silently remove the
     * barrier every later write relies on, for the rest of the session.
     */
    db.raw.pragma('foreign_keys = ON');
    resetDatabase(db.db);

    expect(db.raw.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('can be run twice', () => {
    resetDatabase(db.db);
    expect(() => resetDatabase(db.db)).not.toThrow();
  });
});

describe('the default exercises', () => {
  it('installs the strength movements, and nothing else', () => {
    /**
     * The criterion is the SOURCE's category rather than an opinion about what
     * is common — and it is a subset, which is the point: the stretches, the
     * cardio, the plyometrics and the strongman work stay in the catalogue to
     * be chosen.
     */
    const report = installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_000);

    expect(report?.installed).toBe(defaultCatalogKeys().length);
    expect(defaultCatalogKeys().length).toBeGreaterThan(100);
    expect(defaultCatalogKeys().length).toBeLessThan(EXERCISE_CATALOG.length);
    expect(count('exercise')).toBe(defaultCatalogKeys().length);
  });

  it('GIVES EVERY DEFAULT ROW A PICTURE', () => {
    /**
     * The property that used to be definitional and is now DERIVED, which is
     * why it needs a test of its own.
     *
     * The old criterion was literally "has a drawing", so this could not fail.
     * The criterion is now the source's category, and nothing about a category
     * promises an image — so a source that stopped shipping photographs for one
     * of them would put the substitute of specs 5.4 no 3 on a library nobody
     * has touched yet, on day one, and read as a defect rather than as a
     * missing file.
     */
    const defaults = new Set(defaultCatalogKeys());
    const withoutImage = EXERCISE_CATALOG.filter(
      (entry) => defaults.has(entry.key) && entry.hasImage !== true,
    );

    expect(withoutImage.map((entry) => entry.name)).toEqual([]);
  });

  it('covers every muscle, so no filter opens empty on a fresh library', () => {
    // A default library that never trains a muscle makes that muscle's filter
    // return nothing on the first visit, which reads as a broken screen rather
    // than as a library somebody has not filled in yet.
    const defaults = new Set(defaultCatalogKeys());
    const reached = new Set(
      EXERCISE_CATALOG.filter((entry) => defaults.has(entry.key)).map(
        (entry) => entry.primaryMuscle,
      ),
    );

    expect(MUSCLES.filter((muscle) => !reached.has(muscle))).toEqual([]);
  });

  it('does nothing the second time, on a flag rather than on emptiness', () => {
    installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_000);

    expect(installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_001)).toBeNull();
    expect(count('exercise')).toBe(defaultCatalogKeys().length);
  });

  it('DOES NOT COME BACK after the library is emptied by hand', () => {
    /**
     * THE CASE THAT DECIDES THE FLAG.
     *
     * Emptiness is the obvious test and it is wrong exactly here: specs 5.3
     * makes deleting an exercise the one act in this application that destroys
     * something, so undoing it on somebody's behalf, at launch, without asking,
     * is the worst possible moment to be helpful.
     */
    installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_000);
    db.db.delete(exercise).run();

    expect(installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_002)).toBeNull();
    expect(count('exercise')).toBe(0);
  });

  it('comes back after the database is EMPTIED, because the flag goes with it', () => {
    // The other side, and it is what makes the dev reset button useful: wiping
    // the database is wiping the flag, so the next launch is a fresh install in
    // every respect rather than a fresh install with no exercises.
    installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_000);
    resetDatabase(db.db);

    expect(readSetting(db.db, CATALOG_SEEDED_KEY)).toBeNull();
    expect(installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_003)).not.toBeNull();
    expect(count('exercise')).toBe(defaultCatalogKeys().length);
  });

  it('records the flag even when it installed nothing', () => {
    // A library that already held every name is a library where the question
    // has been answered too — otherwise this would re-ask on every launch.
    installCatalogExercises(db.db, defaultCatalogKeys(), 2.5);

    const report = installDefaultCatalogOnce(db.db, 2.5, 1_789_600_000_000);

    expect(report?.installed).toBe(0);
    expect(readSetting(db.db, CATALOG_SEEDED_KEY)).not.toBeNull();
  });
});
