import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Notification settings (schema 2.5, specs 9.3, 12, D14).
 *
 * Its own module, on the precedent weight.ts, planning.ts and off.ts set: a
 * domain with its own vocabulary gets its own schema file. Nothing here imports
 * another schema module and nothing imports this one — which is the shape of
 * the thing itself. A notification setting is attached to nothing, and section
 * 2.5 says so in as many words: no foreign key in either direction.
 *
 * That absence is why 0006 could leave this table out without taking any risk
 * (amendment 9.9 no 1): 0007 creates it whole, rebuilding nothing.
 *
 * ## WHAT THIS TABLE IS, AND WHAT IT IS NOT
 *
 * It is the STATE of four settings the user chooses. It is NOT the schedule.
 * What iOS currently holds in its pending queue is not stored anywhere, and
 * must not be: D9 forbids storing what can be derived, and iOS is the source of
 * truth for its own queue — getAllScheduledNotificationsAsync reads it. A
 * mirror kept here would be a second answer to one question, free to disagree
 * with the first, which is the defect shape this project has already chased out
 * of quantity prefill.
 *
 * And the rule the whole schema obeys: EVERY COLUMN MUST MAP TO A JSON SCALAR.
 * The exporter reads columns straight off these objects and throws on anything
 * that is not a string, a finite number or null, so `enabled` is an integer
 * typed 0 | 1, never mode: 'boolean'.
 */

/**
 * The closed set of notification kinds (specs 9.3, schema 2.5).
 *
 * Declared ONCE, as data, with the type derived from it — the shape
 * PORTION_NAMES, YIELD_TYPES and WEIGHT_GOAL_MODES set. A union of literals
 * cannot be walked at runtime, so a hand-kept pair would be free to drift, and
 * the place it would drift is the import validator.
 *
 * Not French: these are never displayed. The screen says « Rappel de pesée »;
 * these are what the scheduler branches on.
 */
export const NOTIFICATION_KINDS = [
  /** Morning, if no weight has been recorded for the current day (specs 9.3). */
  'weigh_in',
  /** Evening, if no entry has been recorded for the current day (specs 9.3). */
  'empty_journal',
  /** Fixed hour, carrying the day's macros — consumed and remaining (specs 9.3). */
  'daily_summary',
  /** Periodic, if the last export is older than a settable delay (specs 5.4, 9.3). */
  'export_reminder',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * One row per kind the user has touched (schema 2.5).
 *
 * ## NO CHECK ON `kind`, AND IT IS THE SAME REASONING AS food_portion.name
 *
 * The line slice 3 drew is not how likely a set is to move, it is WHAT
 * WIDENING IT WOULD BREAK. journal_entry.kind carries one because widening it
 * breaks the aggregation invariant — the clauseless SUM only holds because the
 * set is closed. weight_goal.mode carries one because it decides which column
 * is read, so a third mode falls through every branch and produces a plausible,
 * wrong rate.
 *
 * Neither holds here. Nothing is summed, nothing is derived, and the Settings
 * screen ENUMERATES THE FOUR KINDS FROM THE CODE and reads this table by key —
 * never the other way round. So a row with an unknown kind is a row nothing
 * reads. That is inert STRUCTURALLY rather than by care, the same way the
 * Open Food Facts cache and the personal library structurally never meet.
 *
 * ## AND THE WIDENING THIS COMMENT FORESAW DID NOT HAPPEN, WHICH IS BETTER
 *
 * It used to end: "widening is FORESEEN: slice 11 puts the rest timer on a
 * local notification. A CHECK would force a table rebuild there for the sake of
 * one enumeration value." The rest timer landed in slice 11 and added NO kind,
 * so no widening was needed — and the reason is worth recording where somebody
 * would otherwise add one.
 *
 * The rest timer has no switch and no hour: specs 9.3 describes it as a
 * consequence of validating a set, and specs 12 lists no setting for it. A row
 * here would state nothing.
 *
 * More importantly, ADDING IT WOULD BREAK IT. diffSchedule decides what the
 * daily planner owns by testing whether an identifier starts with a kind, and
 * cancels everything it owns that is not in the plan — on every foreground.
 * A `rest_timer` kind would hand the timer to a scheduler that has never heard
 * of it, which would cancel it in the middle of a workout, silently. The timer
 * lives in its own `rest:` namespace, and a test in tests/strength/rest-timer
 * asserts no kind is a prefix of it.
 *
 * The absence of a CHECK is still right, for the reasons above it. It simply
 * has not been spent yet.
 *
 * The barrier is the export catalogue's one_of rule, which runs BEFORE the
 * first insert and names table, row and column instead of citing a constraint —
 * which is what D7 wants from a file repaired by hand.
 *
 * ## THE CHECK ON `enabled`, AND WHY THAT ONE COSTS NOTHING
 *
 * ck_weight_goal_active, verbatim: a boolean can never widen, so constraining
 * it costs nothing, ever.
 *
 * ## NO CHECK ON `hour` OR `minute`, AND THAT IS A REFUSAL
 *
 * SQLite would allow one here where `setting` could never carry one, being
 * key/value TEXT. The possibility does not change the criterion. This project
 * answers a bad settings value the same way everywhere — normalizeCutoffHour
 * and normalizeAdherenceTolerance CLAMP, on the way in and on the way out, and
 * a settings row is never a reason to refuse to work. An hour of 25 is clamped
 * long before it reaches a trigger; it breaks no calculation.
 *
 * Clamping on both sides is not belt and braces: reading protects against a row
 * this application did not write, writing means the stored value is the one the
 * user will be shown back.
 *
 * NULLABLE, as section 2.5 declares. NULL means "never chosen" and reads as the
 * kind's default hour — the same absence-is-the-default rule settings-reads.ts
 * has applied since slice 2.
 *
 * ## NO ROWS ARE SEEDED
 *
 * An absent row and enabled = 0 say exactly the same thing, and the reader
 * returns the default for both. So an installation that never opens this screen
 * keeps the table empty and carries nothing in its export. Seeding four rows
 * would be four rows that state nothing.
 *
 * NO INDEX, AND NONE IS MISSING: `kind` IS the primary key, so SQLite indexes
 * it, and the table holds at most four rows.
 */
export const notificationSetting = sqliteTable(
  'notification_setting',
  {
    kind: text('kind').$type<NotificationKind>().primaryKey(),
    /** 0 or 1, never a boolean: every column must map to a JSON scalar. */
    enabled: integer('enabled').$type<0 | 1>().notNull().default(0),
    /** Local wall-clock hour, 0..23. NULL means the kind's default. */
    hour: integer('hour'),
    /** Local wall-clock minute, 0..59. NULL means the kind's default. */
    minute: integer('minute'),
  },
  (table) => [check('ck_notification_enabled', sql`${table.enabled} IN (0, 1)`)],
);

export type NotificationSettingRow = typeof notificationSetting.$inferSelect;
