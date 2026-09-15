import { diffSchedule, type ScheduleDiff } from './diff';
import type { NotificationHost } from './host';
import type { PlannedNotification } from './plan';

/**
 * Makes the notification centre hold exactly the plan (D14).
 *
 * The decisions are all upstream and pure; this is the wiring that carries
 * them across. It takes the host as a parameter, the way every access function
 * since slice 1 takes the database, so it runs in Node against a fake.
 *
 * CANCELS BEFORE IT SCHEDULES, and the order is not cosmetic. When an
 * occurrence is being replaced because its text changed — the summary, every
 * time a meal is logged — scheduling first would have both versions pending for
 * an instant, and if the cancel then failed, the stale figures would be the
 * ones that survive. The wrong direction of failure for the one notification
 * whose whole purpose is to carry current figures.
 */
export async function applyPlan(
  host: NotificationHost,
  desired: readonly PlannedNotification[],
): Promise<ScheduleDiff> {
  const pending = await host.getPending();
  const diff = diffSchedule(pending, desired);

  for (const id of diff.toCancel) {
    await host.cancel(id);
  }
  for (const notification of diff.toSchedule) {
    await host.schedule(notification);
  }

  return diff;
}

/**
 * Removes everything this application has pending.
 *
 * Called when the last setting is turned off, and it is the reason applyPlan
 * alone is not enough: with no settings enabled the desired plan is empty, so
 * applyPlan would already cancel everything — but only if it is still being
 * called. This exists so that turning the feature off does not depend on
 * something continuing to run afterwards.
 *
 * Deliberately NOT cancelAllScheduledNotificationsAsync: that would also remove
 * anything scheduled by a future slice — the rest timer of slice 11 lives in
 * the same queue and is not ours to drop. Only what is pending under an
 * identifier we recognise goes.
 */
export async function cancelAll(host: NotificationHost, prefixes: readonly string[]): Promise<void> {
  const pending = await host.getPending();
  for (const item of pending) {
    if (prefixes.some((prefix) => item.id.startsWith(`${prefix}:`))) {
      await host.cancel(item.id);
    }
  }
}
