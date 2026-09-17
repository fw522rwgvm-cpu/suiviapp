import type { AppDatabase } from '@/core/db/database';
import { readSetting, SETTING_KEYS } from '@/features/settings/data/settings-reads';
import { writeSetting } from '@/features/settings/data/settings-writes';
import { normalizeProgressionIncrement } from '../domain/exercise-draft';

/**
 * The one setting this domain owns (specs 12, "Musculation — Incrément de
 * progression global par défaut").
 *
 * ## WHY IT IS READ HERE AND NOT IN settings-reads.ts
 *
 * The precedent is off-gateway.ts, which reads off_suspended_until the same
 * way: settings-reads.ts owns the KEY and the generic readSetting, and the
 * domain that gives the value meaning reads it. The alternative would put
 * normalizeProgressionIncrement — a fact about barbell plates — in
 * settings/domain/preferences.ts, beside the theme.
 *
 * It is deliberately NOT in readPreferences(). That call exists to be
 * synchronous on a component's first render, for three values every screen
 * needs. This one is needed at exactly one moment: when an exercise is created.
 */

/** Kilograms. Clamped on the way out, as every settings read in this project is. */
export function readProgressionIncrement(db: AppDatabase): number {
  const raw = readSetting(db, SETTING_KEYS.progressionIncrementKg);
  if (raw === null) return normalizeProgressionIncrement(null);
  const parsed = Number(raw);
  // Number('') is 0 and Number('abc') is NaN: normalize answers both with the
  // default rather than storing a zero increment, which ck_exercise_increment
  // would then refuse at the INSERT with a constraint name.
  return normalizeProgressionIncrement(raw.trim() === '' ? null : parsed);
}

/** Clamped on the way in too, so the stored value is the one shown back. */
export function writeProgressionIncrement(db: AppDatabase, kg: number): void {
  writeSetting(
    db,
    SETTING_KEYS.progressionIncrementKg,
    String(normalizeProgressionIncrement(kg)),
  );
}

