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
