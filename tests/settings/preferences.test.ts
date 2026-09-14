import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CUTOFF_HOUR } from '../../src/core/date';
import {
  DEFAULT_ADHERENCE_TOLERANCE_PCT,
  DEFAULT_PREFERENCES,
  MAX_ADHERENCE_TOLERANCE_PCT,
  MIN_ADHERENCE_TOLERANCE_PCT,
  normalizeAdherenceTolerance,
} from '../../src/features/settings/domain/preferences';
import {
  readAdherenceTolerancePct,
  readCutoffHour,
  readPreferences,
  readThemePreference,
  SETTING_KEYS,
} from '../../src/features/settings/data/settings-reads';
import {
  writeAdherenceTolerancePct,
  writeCutoffHour,
  writeSetting,
  writeThemePreference,
} from '../../src/features/settings/data/settings-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The three preferences slice 7 introduces (specs 8.8, 12).
 *
 * What is worth testing here is not the upsert — settings.test.ts already
 * covers that — it is what a BAD ROW becomes. `setting` is key/value TEXT, so
 * every value arrives as a string that may have been written by an older
 * binary, by an imported archive, or repaired by hand. D15's criterion applies
 * directly: a cutoff that silently reads as 0 instead of 4 does not crash and
 * does not look wrong, it puts the Journal on the wrong day.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('defaults, on a database that has never been configured', () => {
  it('answers every preference without a single row', () => {
    expect(readPreferences(database.db)).toEqual(DEFAULT_PREFERENCES);
  });

  it('starts the day at midnight and the tolerance at its own constant', () => {
    expect(DEFAULT_PREFERENCES.cutoffHour).toBe(DEFAULT_CUTOFF_HOUR);
    expect(DEFAULT_PREFERENCES.adherenceTolerancePct).toBe(
      DEFAULT_ADHERENCE_TOLERANCE_PCT,
    );
    expect(DEFAULT_PREFERENCES.theme).toBe('system');
  });
});

describe('round trip', () => {
  it('reads back exactly what was written', () => {
    writeThemePreference(database.db, 'dark');
    writeCutoffHour(database.db, 4);
    writeAdherenceTolerancePct(database.db, 15);

    expect(readPreferences(database.db)).toEqual({
      theme: 'dark',
      cutoffHour: 4,
      adherenceTolerancePct: 15,
    });
  });

  it('stores the clamped value, not the one asked for', () => {
    // The stored value has to be the one that will be SHOWN back, or a setting
    // reads as something other than what was chosen.
    writeCutoffHour(database.db, 23);
    writeAdherenceTolerancePct(database.db, 900);

    expect(readCutoffHour(database.db)).toBe(6);
    expect(readAdherenceTolerancePct(database.db)).toBe(MAX_ADHERENCE_TOLERANCE_PCT);
  });
});

describe('a row this application did not write', () => {
  it('reads an unknown theme as system rather than throwing', () => {
    writeSetting(database.db, SETTING_KEYS.theme, 'sepia');
    expect(readThemePreference(database.db)).toBe('system');
  });

  it('reads an empty theme as system', () => {
    // '' would be the shape of a hand-repaired archive, and Number('') being 0
    // is the mistake this whole module exists to refuse.
    writeSetting(database.db, SETTING_KEYS.theme, '');
    expect(readThemePreference(database.db)).toBe('system');
  });

  it.each([
    ['', DEFAULT_CUTOFF_HOUR],
    ['4 h', DEFAULT_CUTOFF_HOUR],
    ['minuit', DEFAULT_CUTOFF_HOUR],
    ['-2', 0],
    ['11', 6],
    ['4', 4],
  ])('reads a cutoff of %o as %i', (stored, expected) => {
    writeSetting(database.db, SETTING_KEYS.dayCutoffHour, stored);
    expect(readCutoffHour(database.db)).toBe(expected);
  });

  it.each([
    ['', DEFAULT_ADHERENCE_TOLERANCE_PCT],
    ['dix pour cent', DEFAULT_ADHERENCE_TOLERANCE_PCT],
    ['0', MIN_ADHERENCE_TOLERANCE_PCT],
    ['-5', MIN_ADHERENCE_TOLERANCE_PCT],
    ['4000', MAX_ADHERENCE_TOLERANCE_PCT],
    ['15', 15],
  ])('reads a tolerance of %o as %i', (stored, expected) => {
    writeSetting(database.db, SETTING_KEYS.adherenceTolerancePct, stored);
    expect(readAdherenceTolerancePct(database.db)).toBe(expected);
  });
});

describe('normalizeAdherenceTolerance', () => {
  it('falls back rather than returning NaN', () => {
    expect(normalizeAdherenceTolerance(Number.NaN)).toBe(DEFAULT_ADHERENCE_TOLERANCE_PCT);
    expect(normalizeAdherenceTolerance(null)).toBe(DEFAULT_ADHERENCE_TOLERANCE_PCT);
    expect(normalizeAdherenceTolerance(undefined)).toBe(DEFAULT_ADHERENCE_TOLERANCE_PCT);
    expect(normalizeAdherenceTolerance(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_ADHERENCE_TOLERANCE_PCT,
    );
  });

  it('truncates rather than rounding, like the cutoff does', () => {
    expect(normalizeAdherenceTolerance(12.9)).toBe(12);
  });
});

describe('the three keys are the ones schema 2.1 names', () => {
  // Spelled out rather than derived: these strings are what an archive carries
  // and what a hand-repaired row must match. A rename would be a silent loss of
  // every stored preference, so it has to be a deliberate edit here too.
  it('uses the documented snake_case names', () => {
    expect(SETTING_KEYS.theme).toBe('theme');
    expect(SETTING_KEYS.dayCutoffHour).toBe('day_cutoff_hour');
    expect(SETTING_KEYS.adherenceTolerancePct).toBe('adherence_tolerance_pct');
  });
});
