import type { LocalDate } from '@/core/date';
import type { NotificationKind } from './kinds';
import { contentFor, type NotificationContent } from './messages';
import { HORIZON_DAYS, occurrencesFor, type Occurrence } from './occurrences';

/**
 * Which occurrences should actually be pending, and what each one says (D14).
 *
 * Pure. Everything it needs about the database arrives as an argument, so the
 * whole of "what should be scheduled" is decided in Node, against a clock the
 * test owns. What is left for the untestable side is one call per occurrence.
 */

export interface PlannedNotification extends Occurrence {
  content: NotificationContent;
}

export interface PlanInput {
  /** The four settings, as readNotificationSettings returns them. */
  settings: readonly {
    kind: NotificationKind;
    enabled: boolean;
    hour: number;
    minute: number;
  }[];
  /** Specs 8.2, 0..6. Decides which civil date an occurrence is about. */
  cutoffHour: number;
  now: Date;
  /** The date the application currently calls today — currentLocalDate(cutoff). */
  today: LocalDate;
  /** Whether a weight is already recorded for `today`. */
  weighedToday: boolean;
  /** Whether `today` has at least one journal entry. */
  journalHasEntries: boolean;
  /** Composed from the day's totals and targets, or null if there is nothing to say. */
  summary: NotificationContent | null;
  /** Instant of the last successful export, or null if there has never been one. */
  lastExportAt: number | null;
  /** Days before the export is considered stale (specs 5.4). */
  exportReminderDays: number;
  horizonDays?: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * THE FOUR KINDS DO NOT ANTICIPATE THE SAME WAY, AND THAT IS THE SHAPE OF THIS
 * FUNCTION.
 *
 * D14 says "planification anticipée sur 7 jours" as though the four were alike.
 * They are not, and taking the sentence literally would ship two defects:
 *
 *  - WEIGH_IN and EMPTY_JOURNAL do anticipate, fully. Their text carries no
 *    figure, and tomorrow's condition is genuinely unknown today, so all seven
 *    occurrences are scheduled and the one for today is dropped the moment its
 *    condition is met. That is exactly D14's "annulation immédiate", and it is
 *    reliable for the reason D14 gives: when the user weighs, the application
 *    is running.
 *
 *  - DAILY_SUMMARY CANNOT. Its text is the day's figures, and tomorrow's
 *    figures do not exist. Scheduling seven would queue six notifications
 *    announcing today's numbers on days they have nothing to do with — six
 *    plausible, wrong messages, which is the one thing this project refuses.
 *    So only the occurrence for the current day is planned. The cost, stated:
 *    on a day the application is never opened, no summary fires. That is
 *    correct rather than merely acceptable — a day with nothing logged has
 *    nothing to announce, and empty_journal already covers it.
 *
 *  - EXPORT_REMINDER anticipates BETTER than the others, and is the only one
 *    that can. Its condition depends on last_export_at, which cannot change
 *    unless the application runs — so whether day J+k will be overdue is known
 *    today, arithmetically. Occurrences that will not be overdue are never
 *    scheduled, rather than scheduled and cancelled.
 *
 * ## NO REPEATING TRIGGERS, ANYWHERE
 *
 * D14 also says "déclencheurs répétitifs préférés partout où c'est possible",
 * for the 64-notification ceiling. That sentence contradicts the annulation
 * conditionnelle in the same paragraph: a repeating trigger is ONE pending
 * entry, so tomorrow's occurrence cannot be cancelled without killing every
 * one after it. And the ceiling is not close — four kinds over seven days is
 * twenty-eight — so the reason for the preference does not apply. Amendment
 * recorded in architecture 9.13.
 */
export function buildPlan(input: PlanInput): PlannedNotification[] {
  const horizon = input.horizonDays ?? HORIZON_DAYS;
  const planned: PlannedNotification[] = [];

  for (const setting of input.settings) {
    if (!setting.enabled) continue;

    const occurrences = occurrencesFor(
      setting.kind,
      { hour: setting.hour, minute: setting.minute },
      input.cutoffHour,
      input.now,
      // The summary never looks past the current day; see above.
      setting.kind === 'daily_summary' ? 1 : horizon,
    );

    for (const occurrence of occurrences) {
      if (!shouldSchedule(occurrence, input)) continue;
      planned.push({
        ...occurrence,
        content: contentFor(occurrence.kind, input.summary),
      });
    }
  }

  // Soonest first, then by kind, so two plans built from the same input are the
  // same list. The diff does not need it — it matches on id — but a stable
  // order is what makes a failing test readable.
  return planned.sort((left, right) => left.at - right.at || left.kind.localeCompare(right.kind));
}

function shouldSchedule(occurrence: Occurrence, input: PlanInput): boolean {
  switch (occurrence.kind) {
    case 'weigh_in':
      // Only the occurrence about a day we can see into is ever suppressed.
      // Tomorrow's is scheduled unconditionally, because tomorrow's weight
      // cannot be known — and it will be cancelled tomorrow, when the
      // application runs, which is the whole of D14's argument for why this is
      // reliable.
      return !(occurrence.subjectDate === input.today && input.weighedToday);

    case 'empty_journal':
      return !(occurrence.subjectDate === input.today && input.journalHasEntries);

    case 'daily_summary':
      // Only ever about today, by construction above. Silent on a day with no
      // entry: empty_journal fires half an hour earlier and says the same
      // thing, and two notifications saying one thing is the alert you dismiss
      // without reading — the kind slice 4 removed everywhere else.
      return occurrence.subjectDate === input.today && input.journalHasEntries;

    case 'export_reminder':
      return exportOverdueAt(occurrence.at, input);
  }
}

/**
 * Whether the export will be stale by the time this occurrence fires.
 *
 * Computable ahead, unlike the other three, because last_export_at only moves
 * while the application runs — and if it moves, this whole plan is rebuilt.
 *
 * Never having exported counts as overdue. That is the case the reminder exists
 * for: specs 5.4 makes the export the only safety net, and a phone that has
 * never made one is the least protected it will ever be.
 *
 * The clock is not trusted in one direction only: a last export in the FUTURE
 * is a phone whose clock moved, and it reads as "not overdue" rather than as a
 * negative age. The rule the rate limiter states and this follows — being a
 * little too permissive costs one missed reminder, being too strict costs a
 * feature that never works again.
 */
function exportOverdueAt(at: number, input: PlanInput): boolean {
  if (input.lastExportAt === null) return true;
  if (input.lastExportAt > at) return false;
  return at - input.lastExportAt > input.exportReminderDays * MS_PER_DAY;
}
