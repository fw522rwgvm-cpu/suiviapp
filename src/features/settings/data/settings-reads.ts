import { eq } from 'drizzle-orm';
import { normalizeCutoffHour } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { setting } from '@/core/db/schema';
// tokens, not the '@/core/theme' barrel: see the note in domain/preferences.ts.
import { parseThemePreference, type ThemePreference } from '@/core/theme/tokens';
import {
  normalizeAdherenceTolerance,
  type Preferences,
} from '../domain/preferences';

/**
 * Reads of the key/value settings (schema 2.1).
 *
 * Plain functions taking the database as a parameter, like every access
 * function since slice 1, so they run in Node against a real SQLite file.
 *
 * The table is key/value rather than one column per preference, so that adding
 * a preference never costs a migration. The price is that everything is TEXT
 * and every read is a parse — which is why no caller ever sees a raw string
 * and every value has a typed reader with a fallback.
 *
 * A missing key and a corrupted value are the same thing to a caller: the
 * default. A settings row is never a reason to refuse to work.
 */

/**
 * The keys actually in service.
 *
 * Section 2.1 lists eight. Six are here as of slice 7; the last two —
 * progression_increment_default_kg and intervals_sync_frequency — arrive with
 * their features in V3 and V4. Declaring them early would be a layer built
 * "for later", which section 7 rules out.
 */
export const SETTING_KEYS = {
  /** Light / dark / system (specs 8.8), slice 7. */
  theme: 'theme',
  /**
   * The hour at which "today" turns over, 0 to 6 (specs 8.2, 8.8), slice 7.
   *
   * IT DECIDES A DEFAULT AND NOTHING ELSE. Specs 8.2 is explicit: the setting
   * only moves the date PROPOSED by default, it changes nothing already
   * stored, and a wrong date is corrected in one gesture. So a corrupt row
   * here can put the Journal on the wrong day for a moment; it can never put
   * an entry on the wrong day behind the user's back.
   */
  dayCutoffHour: 'day_cutoff_hour',
  /** Slack allowed on each of the four macros, in percent (specs 8.7), slice 7. */
  adherenceTolerancePct: 'adherence_tolerance_pct',
  /** Instant of the last successful export, epoch ms (specs 5.4). */
  lastExportAt: 'last_export_at',
  /** How many days before the Settings screen highlights it (specs 5.4). */
  exportReminderDays: 'export_reminder_days',
  /**
   * Instant until which remote Open Food Facts calls are suspended, epoch ms
   * (D11, slice 4).
   *
   * THE ONE PIECE OF RATE-LIMITER STATE THAT IS PERSISTED, and it is here
   * rather than in a table of its own because `setting` exists precisely so
   * that remembering one value never costs a migration.
   *
   * Its counterpart — the per-minute sliding window — deliberately is NOT
   * stored: it expires in sixty seconds, and one SQLite write per remote
   * request to protect it would be a bad trade. This one is different because
   * losing it has a cost outside the phone: the server has said stop, and an
   * application killed and restarted that starts again is how an IP gets
   * banned (specs 2.2 requires surviving a forced quit at any moment).
   *
   * It rides along in an export, `setting` being an exported table. Harmless:
   * by the time an archive is imported the instant is long past, and a past
   * instant reads as expired. rate-limit.ts also refuses one too far ahead to
   * be anything but a clock that moved.
   */
  offSuspendedUntil: 'off_suspended_until',
  /**
   * The default day template, applying to any weekday with no assignment
   * (specs 8.1, 8.8), slice 5.
   *
   * THE ONE POINTER IN THE APPLICATION NO CONSTRAINT CAN PROTECT. `setting` is
   * key/value TEXT: there is no foreign key to declare here and nothing to
   * cascade, where planning_weekday and planning_override both carry one.
   *
   * It is answered on both sides. Deleting a template clears this key in the
   * same transaction — the rule — and readDefaultTemplateId checks that the
   * template still exists before returning it — the guarantee. Only the second
   * survives an archive written by another binary, or a row repaired by hand.
   *
   * It rides along in an export, `setting` being an exported table, and that
   * is correct: the templates travel with it, so the pointer still resolves on
   * the receiving device.
   */
  defaultTemplateId: 'default_template_id',
  /**
   * The increment a NEW exercise starts from, in kilograms (specs 6.3, 10.4,
   * 12), slice 10.
   *
   * Section 2.1 reserved this key from the start and slice 7 left it out with
   * the note that it "arrives with its feature in V3". This is that.
   *
   * ## IT IS AN INITIAL VALUE, NEVER A FALLBACK, AND THAT IS THE WHOLE POINT
   *
   * Specs 6.3 and 10.4 both say the increment is "propre à l'exercice,
   * initialisé depuis la valeur globale des Réglages". So it is read ONCE, when
   * an exercise is created, and copied into exercise.increment_kg. It is never
   * read again for that exercise.
   *
   * Read on every access instead, changing this setting would silently rewrite
   * the progression of every exercise ever created — which "propre à
   * l'exercice" rules out, and which nothing on screen would explain.
   *
   * That is also why exercise.increment_kg carries NO SQL DEFAULT: a default
   * there would be a second source for the same initial value, free to drift
   * from this one. Two paths to one number agree almost always, and the day
   * they diverge both are plausible — the defect shape slice 4 chased out of
   * quantity prefill.
   */
  progressionIncrementKg: 'progression_increment_default_kg',
} as const;

/**
 * Days before the export indicator is highlighted.
 *
 * ASSUMPTION, FLAGGED: the specs ask for the age to be "highlighted beyond a
 * delay" (5.4) and never give the delay. Seven days is chosen to coincide with
 * the SideStore certificate cycle, which already imposes a weekly rhythm on
 * this project: the reminder then lands on a day the phone is being handled
 * anyway. The value is a setting precisely so this guess can be corrected
 * without a migration.
 */
export const DEFAULT_EXPORT_REMINDER_DAYS = 7;

export function readSetting(db: AppDatabase, key: string): string | null {
  const rows = db
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, key))
    .all();
  return rows[0]?.value ?? null;
}

/** A whole number, or the fallback. Never NaN, never a partial parse. */
export function readIntegerSetting(
  db: AppDatabase,
  key: string,
  fallback: number | null,
): number | null {
  const raw = readSetting(db, key);
  if (raw === null) return fallback;

  // Number('') is 0 and Number('4 h') is NaN, so the shape is checked first.
  // A settings row written by hand, or by a botched import, must not decide
  // that the last export happened at the epoch.
  if (!/^-?\d+$/.test(raw.trim())) return fallback;

  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : fallback;
}

/** Instant of the last successful export, or null if there has never been one. */
export function readLastExportAt(db: AppDatabase): number | null {
  const value = readIntegerSetting(db, SETTING_KEYS.lastExportAt, null);
  // A negative instant would be a date before 1970: a corrupted row, not a
  // very old export.
  return value !== null && value >= 0 ? value : null;
}

/**
 * Bounds, and they exist because slice 9 finally gives this a control.
 *
 * One day is the tightest setting that still means something — "remind me if I
 * did not export yesterday". Thirty is a month, past which the reminder has
 * stopped being a safety net and become an annual ritual; specs 5.4 makes the
 * export the only protection there is, and the weight exists nowhere else at
 * all (specs 9.1).
 *
 * Wider than they need to be on purpose, the way the adherence tolerance is:
 * refusing values in between would be inventing a rule no document asks for.
 */
export const MIN_EXPORT_REMINDER_DAYS = 1;
export const MAX_EXPORT_REMINDER_DAYS = 30;

/**
 * Clamps the delay, the way normalizeCutoffHour clamps an hour.
 *
 * Bounds belong to the rule rather than to the storage, so this sits beside the
 * default it falls back to and is applied on both sides of the column.
 */
export function normalizeExportReminderDays(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DEFAULT_EXPORT_REMINDER_DAYS;
  }
  const whole = Math.trunc(value);
  if (whole < MIN_EXPORT_REMINDER_DAYS) return MIN_EXPORT_REMINDER_DAYS;
  if (whole > MAX_EXPORT_REMINDER_DAYS) return MAX_EXPORT_REMINDER_DAYS;
  return whole;
}

export function readExportReminderDays(db: AppDatabase): number {
  const value = readIntegerSetting(
    db,
    SETTING_KEYS.exportReminderDays,
    DEFAULT_EXPORT_REMINDER_DAYS,
  );
  return value !== null && value > 0 ? value : DEFAULT_EXPORT_REMINDER_DAYS;
}

/**
 * The stored theme preference, or 'system' (specs 8.8).
 *
 * parseThemePreference lives in core/theme beside the tokens it decides, and
 * is reused rather than restated: an unknown value must read as 'system' in
 * exactly one place, or two readings of the same column are free to disagree.
 */
export function readThemePreference(db: AppDatabase): ThemePreference {
  return parseThemePreference(readSetting(db, SETTING_KEYS.theme));
}

/**
 * The hour at which the day turns over, clamped to 0..6 (specs 8.2).
 *
 * Clamped by core/date's own function, for the same reason: the bounds belong
 * to the rule, not to the storage. This module only knows which key holds it.
 */
export function readCutoffHour(db: AppDatabase): number {
  return normalizeCutoffHour(readIntegerSetting(db, SETTING_KEYS.dayCutoffHour, null));
}

/** Slack allowed on each of the four macros, in percent (specs 8.7). */
export function readAdherenceTolerancePct(db: AppDatabase): number {
  return normalizeAdherenceTolerance(
    readIntegerSetting(db, SETTING_KEYS.adherenceTolerancePct, null),
  );
}

/**
 * The three preferences, in one call.
 *
 * ## IT IS READ SYNCHRONOUSLY, AND THAT IS ITS ENTIRE REASON TO EXIST
 *
 * Every one of these has to be available on a component's FIRST render, not a
 * tick later:
 *
 *  - the theme decides what colour the first frame is painted;
 *  - the cutoff decides which day the Journal opens on, and the Journal freezes
 *    that date in its initial state (specs 7: always today, never the last date
 *    consulted).
 *
 * A value that arrives one render late is the defect this project has already
 * met twice — the quantity wheels that spun as they opened, and the carousel
 * whose key changed in an effect. Both had the same cause: a value produced
 * AFTER the render that needed it. The answer both times was to make the value
 * exist first, and this is that answer for preferences.
 *
 * Three reads on a primary key, on a local synchronous database. There is
 * nothing here to batch and nothing to measure.
 */
export function readPreferences(db: AppDatabase): Preferences {
  return {
    theme: readThemePreference(db),
    cutoffHour: readCutoffHour(db),
    adherenceTolerancePct: readAdherenceTolerancePct(db),
  };
}
