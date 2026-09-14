import { DEFAULT_CUTOFF_HOUR } from '@/core/date';
// From the tokens module directly, never the '@/core/theme' barrel: the
// barrel re-exports ThemeProvider, which imports react-native, and pulling
// react-native into a module the Node suite reaches makes rolldown fail on its
// Flow source. tokens.ts imports nothing — it is values, not components.
import type { ThemePreference } from '@/core/theme/tokens';

/**
 * The preferences the application reads about itself (specs 8.8, 12).
 *
 * Pure: bounds, defaults and the shape. Nothing here knows the database or
 * React, so what a bad stored value becomes is testable in Node.
 *
 * Only three live here, and they are the three slice 7 introduces. The others
 * already in `setting` — last_export_at, export_reminder_days,
 * off_suspended_until, default_template_id — are not preferences the user sets
 * from this screen: they are state the application keeps about itself, and
 * they already have their readers where they are used. Gathering all eight
 * here would be a layer built for later, which section 7 rules out.
 */
export interface Preferences {
  /** Light / dark / system (specs 8.8). */
  theme: ThemePreference;
  /** The hour at which "today" turns over, 0 to 6 (specs 8.2). */
  cutoffHour: number;
  /** Slack allowed on each of the four macros, in percent (specs 8.7). */
  adherenceTolerancePct: number;
}

/**
 * ASSUMPTION, FLAGGED: no document gives this number.
 *
 * Specs 8.7 asks for a "tolerance threshold, adjustable, expressed as a
 * percentage and applied to the four macros" and never says what it starts at.
 * Ten is chosen because it is the figure this domain already speaks in, and
 * because the value is a setting precisely so a guess can be corrected without
 * a migration.
 *
 * ## IT IS ITS OWN CONSTANT, AND THAT IS THE WHOLE POINT
 *
 * Three unrelated rules of this application now carry the number ten:
 *
 *  - KCAL_DISCREPANCY_THRESHOLD — whether a FOOD's declared calories agree
 *    with its own macros (specs 5.1). A nutritional rule.
 *  - KCAL_OVERSHOOT_KCAL — no longer ten at all, and that is the proof: it
 *    became fifty kilocalories, absolute, the day a percentage was found to
 *    grant most slack exactly where a target is hardest to hold.
 *  - this one — how far a DAY may sit from its goal and still count.
 *
 * Sharing a constant between any two of them would tie a display rule to a
 * nutritional one for ever, which is the mistake amendment 9.5 no 12 was
 * written to prevent. It is repeated here rather than assumed remembered.
 */
export const DEFAULT_ADHERENCE_TOLERANCE_PCT = 10;

/**
 * Bounds, and they are deliberately wide.
 *
 * One percent is the tightest setting that still means something; a hundred
 * means "twice the target counts", which is no longer a threshold but is a
 * legitimate thing to ask for on the way to turning the figure off. Refusing
 * values in between would be inventing a rule no document asks for.
 */
export const MIN_ADHERENCE_TOLERANCE_PCT = 1;
export const MAX_ADHERENCE_TOLERANCE_PCT = 100;

/**
 * Clamps a stored percentage, the way normalizeCutoffHour clamps an hour.
 *
 * The value comes out of a TEXT column, so it can be absent, corrupted, or
 * repaired by hand into something absurd. A settings row is never a reason to
 * refuse to work: a bad one reads as the default, a wrong one reads as the
 * nearest bound.
 */
export function normalizeAdherenceTolerance(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DEFAULT_ADHERENCE_TOLERANCE_PCT;
  }
  const whole = Math.trunc(value);
  if (whole < MIN_ADHERENCE_TOLERANCE_PCT) return MIN_ADHERENCE_TOLERANCE_PCT;
  if (whole > MAX_ADHERENCE_TOLERANCE_PCT) return MAX_ADHERENCE_TOLERANCE_PCT;
  return whole;
}

/**
 * What the application runs on before anything has been chosen, and what it
 * falls back to for a row it cannot read.
 *
 * A fresh database has no row for any of the three, which is not a degraded
 * state: it is the state of every installation on its first launch.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  cutoffHour: DEFAULT_CUTOFF_HOUR,
  adherenceTolerancePct: DEFAULT_ADHERENCE_TOLERANCE_PCT,
};
