import { addDays, currentLocalDate, localDateOf, type LocalDate } from '@/core/date';
import type { NotificationKind } from './kinds';

/**
 * When a notification fires, and which day it is about (D14, specs 9.3).
 *
 * Pure, and the one piece of this slice that a test can genuinely hold: iOS
 * fires nothing in Node, so what is verifiable is the arithmetic of dates and
 * hours, under several timezones. Everything downstream — the conditions, the
 * plan, the diff — is built on this.
 */

/**
 * HOW FAR AHEAD, and the number is not arbitrary.
 *
 * Specs 9.3 and D14: "planification anticipée sur 7 jours", and the reminders
 * "s'épuisent d'eux-mêmes" if the application is not opened for seven days —
 * which is also the SideStore certificate lifetime, so a phone that has not
 * been handled in a week has a bigger problem than a missed reminder.
 */
export const HORIZON_DAYS = 7;

export interface Occurrence {
  kind: NotificationKind;
  /**
   * Stable identity: kind plus the civil date it FIRES on.
   *
   * What makes applying a plan a diff rather than a teardown. Rescheduling the
   * same occurrence twice is the same identifier, so it replaces instead of
   * duplicating, and cancelling is "not in the desired plan any more" rather
   * than a call someone has to remember to make.
   *
   * Keyed on the firing date and not the subject date, because two occurrences
   * of one kind can share a subject — see fireDate below — but never a firing
   * day.
   */
  id: string;
  /** The civil date this occurrence fires on. */
  fireDate: LocalDate;
  /**
   * The civil date the notification is ABOUT, which is not always the one it
   * fires on.
   *
   * ## THE RESERVE SPECS 14.15 LEFT OPEN FOR THIS SLICE, RESOLVED
   *
   * Specs 9.1 puts weighing "au réveil"; specs 8.2 lets the day turn over
   * anywhere from 0h to 6h. The reminder has to decide what "today" is with no
   * screen open, so the two could contradict each other.
   *
   * They cannot, because this is not computed as "the reminder for day D". An
   * occurrence is an INSTANT, and the date it concerns is what the whole
   * application would call today at that instant — currentLocalDate, the same
   * function, applied to the firing moment. The condition then reads the same
   * date, so the reminder and the check can never disagree.
   *
   * The ordinary case is safe without any of this: the cutoff is capped at 6,
   * so every hour from 6 onwards has fireDate === subjectDate. The case that
   * needs it is a 5:30 reminder with a 6h cutoff, where the notification is
   * about YESTERDAY — which is exactly what the cutoff means, and what specs
   * 14.15 already says about weighing at 3am.
   */
  subjectDate: LocalDate;
  /** Epoch ms of the trigger. Used to order and to compare against now. */
  at: number;
  /**
   * The wall-clock parts iOS needs.
   *
   * Carried rather than recomputed at the native boundary, so that the one
   * untested module has no arithmetic in it. And wall-clock parts rather than
   * `at`, because expo-notifications' DATE trigger is not a date at all: it
   * builds UNTimeIntervalNotificationTrigger from timeIntervalSinceNow, a delay
   * in seconds frozen at scheduling time, which drifts across a daylight saving
   * change. Only the CALENDAR trigger produces a real
   * UNCalendarNotificationTrigger, which is wall-clock and survives the clock
   * moving. That is D3 at the native boundary: a civil date is the business
   * key, and subtracting milliseconds from an instant is what addDays exists
   * not to do.
   */
  year: number;
  /** 1-12, as iOS wants it — never a JavaScript 0-11 month. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Every firing of one kind within the horizon, soonest first.
 *
 * Occurrences already in the past are dropped: iOS refuses a trigger that has
 * gone by — UNTimeIntervalNotificationTrigger throws on a non-positive
 * interval, which is why the package wraps the construction in a catch — and a
 * reminder for this morning at nine, scheduled at noon, is not something anyone
 * wants to receive.
 *
 * `now` is a parameter rather than read here, for the reason currentLocalDate
 * makes its cutoff required: a function that reads the clock itself cannot be
 * tested, and this is the arithmetic the whole slice rests on.
 */
export function occurrencesFor(
  kind: NotificationKind,
  time: { hour: number; minute: number },
  cutoffHour: number,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
): Occurrence[] {
  const today = localDateOf(now);
  const nowMs = now.getTime();
  const found: Occurrence[] = [];

  // One extra day beyond the horizon is never generated: the horizon is a count
  // of days from today inclusive, so day 0 is today — whose occurrence may
  // already have passed — and day 6 is the seventh.
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const fireDate = addDays(today, offset);
    const [year, month, day] = fireDate.split('-').map(Number) as [number, number, number];

    // Local calendar fields, so the instant is the one the WALL CLOCK shows on
    // that date — the same way core/date reads fields rather than formatting or
    // parsing. On the spring-forward night an hour does not exist and the
    // platform normalises forward; iOS does the same with a calendar trigger,
    // so the two agree.
    const instant = new Date(year, month - 1, day, time.hour, time.minute, 0, 0);
    const at = instant.getTime();
    if (at <= nowMs) continue;

    found.push({
      kind,
      id: `${kind}:${fireDate}`,
      fireDate,
      subjectDate: currentLocalDate(cutoffHour, instant),
      at,
      year,
      month,
      day,
      hour: time.hour,
      minute: time.minute,
    });
  }

  return found;
}
