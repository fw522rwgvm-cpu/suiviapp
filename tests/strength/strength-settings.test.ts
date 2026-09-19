import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS, readSetting } from '../../src/features/settings/data/settings-reads';
import { writeSetting } from '../../src/features/settings/data/settings-writes';
import {
  readProgressionIncrement,
  readRestAlert,
  writeProgressionIncrement,
  writeRestAlert,
} from '../../src/features/strength/data/strength-settings';
import {
  DEFAULT_PROGRESSION_INCREMENT_KG,
  MAX_PROGRESSION_INCREMENT_KG,
  MIN_PROGRESSION_INCREMENT_KG,
} from '../../src/features/strength/domain/exercise-draft';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The global progression increment (specs 6.3, 10.4, 12).
 *
 * `setting` is all TEXT, so every read is a parse — and the parse is what is
 * worth testing here rather than the upsert. A value this application did not
 * write has to come back as something ck_exercise_increment will accept, or the
 * first exercise created after a hand-repaired archive fails at the INSERT with
 * a constraint name and no field to point at.
 */

describe('the global progression increment', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = openTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('reads the flagged default when nothing has been chosen', () => {
    // A fresh database has no row, which is not a degraded state: it is every
    // installation on its first launch.
    expect(readProgressionIncrement(db.db)).toBe(DEFAULT_PROGRESSION_INCREMENT_KG);
  });

  it('round-trips a value somebody chose', () => {
    writeProgressionIncrement(db.db, 1.25);

    expect(readProgressionIncrement(db.db)).toBe(1.25);
  });

  it('clamps on the way in, so the stored value is the one shown back', () => {
    /**
     * Clamping on both sides is not belt and braces: reading protects against a
     * row this application did not write, writing means what is stored is what
     * the user will see next time they open the screen.
     */
    writeProgressionIncrement(db.db, 500);
    expect(readSetting(db.db, SETTING_KEYS.progressionIncrementKg)).toBe(
      String(MAX_PROGRESSION_INCREMENT_KG),
    );

    writeProgressionIncrement(db.db, 0);
    expect(readProgressionIncrement(db.db)).toBe(MIN_PROGRESSION_INCREMENT_KG);
  });

  it('survives a row no version of this application wrote', () => {
    /**
     * The hand-repaired archive case. Every one of these has to come back
     * positive, because the value lands in exercise.increment_kg and
     * ck_exercise_increment refuses anything else — with a constraint name, on
     * a screen whose job is to create an exercise.
     */
    for (const junk of ['', '   ', 'abc', '-3', '0', 'NaN', '1e400']) {
      writeSetting(db.db, SETTING_KEYS.progressionIncrementKg, junk);

      const value = readProgressionIncrement(db.db);
      expect(value, `stored ${JSON.stringify(junk)}`).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(MAX_PROGRESSION_INCREMENT_KG);
    }
  });

  it('is absent from a database nobody has touched, and carries nothing in an export', () => {
    // An absent row and the default say the same thing, so nothing is seeded —
    // notification_setting's rule. Four rows stating nothing would still travel
    // in every archive.
    expect(readSetting(db.db, SETTING_KEYS.progressionIncrementKg)).toBeNull();
  });
});

describe('the rest alert setting', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = openTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('is ON when nobody has been asked', () => {
    // An absent row means the question has never been put. The useful answer is
    // the behaviour the feature was asked for, not silence.
    expect(readRestAlert(db.db)).toBe(true);
  });

  it('round-trips both ways', () => {
    writeRestAlert(db.db, false);
    expect(readRestAlert(db.db)).toBe(false);

    writeRestAlert(db.db, true);
    expect(readRestAlert(db.db)).toBe(true);
  });

  it('CLAMPS A CORRUPT ROW TOWARDS ON', () => {
    /**
     * The direction every settings read in this project clamps: being a little
     * too generous costs a vibration nobody wanted, being too strict costs a
     * rest timer that ends in silence with nothing on screen to explain it —
     * and that reads as a broken feature rather than as a broken row.
     *
     * A hand-repaired archive can put anything here: `setting` is a key/value
     * table in TEXT and carries no CHECK.
     */
    writeSetting(db.db, SETTING_KEYS.restAlertEnabled, 'yes');
    expect(readRestAlert(db.db)).toBe(true);

    writeSetting(db.db, SETTING_KEYS.restAlertEnabled, '');
    expect(readRestAlert(db.db)).toBe(true);

    // Only the literal "0" turns it off, which is what writeRestAlert stores.
    writeSetting(db.db, SETTING_KEYS.restAlertEnabled, '0');
    expect(readRestAlert(db.db)).toBe(false);
  });
});
