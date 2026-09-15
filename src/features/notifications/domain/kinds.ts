import { NOTIFICATION_KINDS, type NotificationKind } from '@/core/db/schema';

/**
 * What each kind of notification is, and when it fires by default (specs 9.3).
 *
 * Pure: the defaults, the bounds and the shape. Nothing here knows the database
 * or React, so what a bad stored value becomes is testable in Node — the same
 * arrangement domain/preferences.ts has in features/settings.
 */

export { NOTIFICATION_KINDS, type NotificationKind };

/** A wall-clock time of day, local. Never an instant (D3). */
export interface NotificationTime {
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
}

/**
 * ASSUMPTION, FLAGGED: no document gives these four numbers.
 *
 * Specs 13 point 4 and architecture section 6 point 4 both list "default hours
 * of the four notifications" as an open question, "to be settled by use". So
 * these are chosen, not measured, and they are settings precisely so the guess
 * can be corrected without a migration.
 *
 * What the choices are trying to do:
 *
 *  - WEIGH_IN at 7:30. Specs 9.1 puts weighing "au réveil", and the cutoff hour
 *    is capped at 6 (specs 8.2), so any time from 6 onwards falls on the civil
 *    date of the day whatever the cutoff is set to. 7:30 is clear of that
 *    boundary rather than adjacent to it.
 *
 *  - EMPTY_JOURNAL at 20:30 and DAILY_SUMMARY at 21:30, an hour apart and in
 *    that order. The two must not both fire: a journal with nothing in it would
 *    otherwise produce "Journal vide" at half past eight and "0 kcal
 *    consommées" at half past nine, which is the same sentence twice, and the
 *    second is the alert you dismiss without reading. plan.ts keeps the summary
 *    silent on a day with no entry; the ordering is what makes the remaining
 *    one the useful one.
 *
 *  - EXPORT_REMINDER at 19:00, earliest of the three evening kinds, because it
 *    is the only one that asks for an action taking more than a tap — the
 *    share sheet, a destination, a file. Specs 5.4 makes it the one safety net
 *    there is.
 */
export const DEFAULT_NOTIFICATION_TIMES: Record<NotificationKind, NotificationTime> = {
  weigh_in: { hour: 7, minute: 30 },
  empty_journal: { hour: 20, minute: 30 },
  daily_summary: { hour: 21, minute: 30 },
  export_reminder: { hour: 19, minute: 0 },
};

const MAX_HOUR = 23;
const MAX_MINUTE = 59;

function clamp(value: number, max: number): number {
  const whole = Math.trunc(value);
  if (whole < 0) return 0;
  if (whole > max) return max;
  return whole;
}

/**
 * The stored time of a kind, or its default (specs 9.3).
 *
 * ## WHY THIS CLAMPS WHERE THE SCHEMA REFUSED A CHECK
 *
 * notification_setting.hour and .minute carry no CHECK, deliberately: SQLite
 * would allow one where `setting` never could, being key/value TEXT, but this
 * project answers a bad settings value the same way everywhere — it clamps, and
 * a settings row is never a reason to refuse to work. An archive repaired by
 * hand carrying hour 25 must import and read back as 23, not fail on a
 * constraint.
 *
 * So this function is the barrier, and it is the only one. It is applied on the
 * way IN as well as on the way out, which is not belt and braces: the two sides
 * answer different questions. Clamping on read protects against a row this
 * application did not write; clamping on write means the stored value is the
 * one the user will be shown back, so a setting can never read as something
 * other than what was chosen. writeCutoffHour makes exactly that argument.
 *
 * NULL means "never chosen" and reads as the kind's default — the same
 * absence-is-the-default rule settings-reads.ts has applied since slice 2. A
 * missing row and a corrupt value are the same thing to a caller.
 */
export function normalizeNotificationTime(
  kind: NotificationKind,
  hour: number | null | undefined,
  minute: number | null | undefined,
): NotificationTime {
  const fallback = DEFAULT_NOTIFICATION_TIMES[kind];

  return {
    hour:
      hour === null || hour === undefined || !Number.isFinite(hour)
        ? fallback.hour
        : clamp(hour, MAX_HOUR),
    // The minute falls back on its own rather than dragging the hour with it:
    // a row with a usable hour and a corrupt minute should keep the hour the
    // user chose. Two columns, two independent answers.
    minute:
      minute === null || minute === undefined || !Number.isFinite(minute)
        ? fallback.minute
        : clamp(minute, MAX_MINUTE),
  };
}

/**
 * What the user sees on the Settings screen (specs 9.3, 12).
 *
 * French, because these are displayed. The kinds themselves are not: they are
 * what the scheduler branches on.
 */
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  weigh_in: 'Rappel de pesée',
  empty_journal: 'Journal vide',
  daily_summary: 'Bilan de fin de journée',
  export_reminder: 'Rappel d’export',
};

/** One line saying what each one actually does, shown under its row. */
export const NOTIFICATION_DESCRIPTIONS: Record<NotificationKind, string> = {
  weigh_in: 'Le matin, si aucune pesée n’est enregistrée pour la journée.',
  empty_journal: 'En soirée, si rien n’a été ajouté au journal de la journée.',
  daily_summary: 'En fin de journée, avec les macros consommées et le restant.',
  export_reminder: 'Si le dernier export remonte à plus que le délai réglé.',
};
