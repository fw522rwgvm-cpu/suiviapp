import type { PlannedNotification } from './plan';

/**
 * What to cancel and what to schedule, given what iOS already holds (D14).
 *
 * Pure, and it is what turns "annulation conditionnelle" from a call somebody
 * has to remember to make into a consequence of the plan. Nothing anywhere
 * cancels a notification: a notification is cancelled by no longer being in the
 * plan.
 *
 * That matters because the alternative fails quietly. A cancel written at the
 * weight write site would be a second place that knows the rules, free to
 * disagree with buildPlan — and the disagreement would show up as a reminder
 * that fires after you have already weighed, which reads as the application
 * not noticing.
 */

export interface ScheduleDiff {
  /** Identifiers to cancel, in the order they were found pending. */
  toCancel: string[];
  toSchedule: PlannedNotification[];
}

/**
 * ## WHY THIS COMPARES CONTENT AND NOT ONLY IDENTITY
 *
 * The summary keeps its identifier all day — one kind, one firing date — while
 * its text changes with every meal. Matching on identity alone would leave the
 * morning's figures pending until midnight, which is precisely the defect D14
 * calls out: "faute de quoi ses chiffres seraient ceux du matin".
 *
 * So an occurrence already pending with different content is cancelled and
 * scheduled again. iOS has no edit, and re-adding the same identifier is
 * documented to replace — but cancelling first is what makes that independent
 * of the platform honouring it.
 *
 * ## AND WHY IT IS IDEMPOTENT
 *
 * Applying the same plan twice must be a no-op, because it runs on every
 * foreground and on every invalidation the bus raises. An unchanged occurrence
 * appears in neither list, so a quiet day costs one read of the pending queue
 * and nothing else.
 */
export function diffSchedule(
  pending: readonly { id: string; title: string; body: string }[],
  desired: readonly PlannedNotification[],
): ScheduleDiff {
  const desiredById = new Map(desired.map((item) => [item.id, item]));
  const pendingById = new Map(pending.map((item) => [item.id, item]));

  const toCancel: string[] = [];
  for (const item of pending) {
    const wanted = desiredById.get(item.id);
    // Not wanted any more — the condition was met, or the setting was turned
    // off, or the day moved on and this occurrence is in the past.
    if (wanted === undefined) {
      toCancel.push(item.id);
      continue;
    }
    // Wanted, but saying something else.
    if (wanted.content.title !== item.title || wanted.content.body !== item.body) {
      toCancel.push(item.id);
    }
  }

  const cancelled = new Set(toCancel);
  const toSchedule = desired.filter((item) => {
    const already = pendingById.get(item.id);
    return already === undefined || cancelled.has(item.id);
  });

  return { toCancel, toSchedule };
}

/**
 * THE 64-NOTIFICATION CEILING, NAMED SO IT CANNOT BE EXCEEDED BY ACCIDENT.
 *
 * iOS keeps 64 pending notifications per application and silently ignores the
 * rest — silently being the problem. Four kinds over seven days is twenty-eight,
 * so there is no pressure today; this exists because a fifth kind arrives in
 * slice 11 and a longer horizon is a one-character change.
 *
 * A test asserts the plan stays under it. Nothing truncates at runtime: if this
 * is ever exceeded, the right answer is to shorten the horizon deliberately,
 * not to drop whichever occurrences happened to sort last.
 */
export const IOS_PENDING_LIMIT = 64;
