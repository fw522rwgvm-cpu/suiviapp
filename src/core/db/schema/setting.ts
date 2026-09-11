import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Key/value settings (schema 2.1).
 *
 * Deliberately a key/value table rather than one column per preference, so
 * that adding a preference never costs a migration.
 *
 * Unlike every other table of the schema, this one carries no created_at /
 * updated_at: section 2.1 spells its columns out explicitly.
 *
 * Known keys, as of V1: theme, day_cutoff_hour, adherence_tolerance_pct,
 * default_template_id, last_export_at, progression_increment_default_kg,
 * intervals_sync_frequency, export_reminder_days.
 */
export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type SettingRow = typeof setting.$inferSelect;
