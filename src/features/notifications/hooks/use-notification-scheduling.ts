import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { currentLocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import {
  day,
  dayMeal,
  journalEntry,
  notificationSetting,
  setting,
  weightMeasure,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import { dayTargets } from '@/features/nutrition/domain/day-plan';
import { readDay, readDayHasEntries, readDayTotals } from '@/features/nutrition/data/day-reads';
import {
  readCutoffHour,
  readExportReminderDays,
  readLastExportAt,
} from '@/features/settings/data/settings-reads';
import { readWeight } from '@/features/weight/data/weight-reads';
import { applyPlan } from '../domain/apply';
import { summaryContent } from '../domain/messages';
import { buildPlan, type PlanInput } from '../domain/plan';
import { readNotificationSettings } from '../data/notification-reads';
import { getNotificationHost } from '../host-registry';

/**
 * Keeps the notification centre holding exactly what the plan says (D14).
 *
 * Mounted once, in app/_layout, beside useSweepOffCacheOnce — the precedent for
 * "wiring that runs for the lifetime of the application". What it does and why
 * lives here; mounting it there is wiring.
 *
 * ## HOW THE SUMMARY IS RESCHEDULED WITHOUT ANYONE FILTERING BY DATE
 *
 * D14 wants the summary rescheduled on every write concerning the CURRENT day,
 * and explicitly not on a write to a past date. The change bus cannot express
 * that: it invalidates by table predicate and says nothing about which date
 * moved (D8). Writing a by-hand invalidation to bridge the gap is forbidden
 * outright by the project's absolute rules.
 *
 * So the discrimination is not made on the write at all. This query composes
 * the day's figures; the bus invalidates it on any journal_entry change, the
 * query refetches, and:
 *
 *  - a write to TODAY produces different figures, so a different summary body,
 *    so the diff cancels and reschedules;
 *  - a write to a PAST date produces IDENTICAL figures, so an identical body,
 *    so the diff finds nothing to do.
 *
 * "A write to a past date reschedules nothing" is a consequence of the data not
 * having moved, not of anyone having checked a date. The cost is a refetch for
 * nothing, which is exactly the cost the bus already accepts in writing: "a
 * refetch for nothing, never a wrong figure".
 *
 * Which is also why the comparison below is on the SERIALISED plan and not on
 * the query object — React Query hands back a new object on every refetch.
 */

const planKeys = {
  input: () => ['notifications', 'plan-input'] as const,
};

function readPlanInput(): PlanInput {
  const db = getAppDatabase();

  // THE CLOCK IS READ HERE, NOT THROUGH useToday. useToday is frozen against
  // the clock on purpose — it re-reads only when the cutoff setting changes, so
  // that a label does not move under a list because midnight went past while it
  // was open. A scheduler needs the opposite: the day it is planning for must
  // be the day it actually is, every time it runs.
  const now = new Date();
  const cutoffHour = readCutoffHour(db);
  const today = currentLocalDate(cutoffHour, now);

  const consumed = readDayTotals(db, today);
  const journalHasEntries = readDayHasEntries(db, today);

  return {
    settings: readNotificationSettings(db),
    cutoffHour,
    now,
    today,
    weighedToday: readWeight(db, today) !== null,
    journalHasEntries,
    // Composed only when there is something to summarise, so a day with nothing
    // logged cannot produce a body at all — the plan drops the occurrence
    // anyway, and this keeps the two from disagreeing.
    summary: journalHasEntries
      ? summaryContent(consumed, dayTargets(readDay(db, today).meals))
      : null,
    lastExportAt: readLastExportAt(db),
    exportReminderDays: readExportReminderDays(db),
  };
}

export function useNotificationScheduling(): void {
  const { data, refetch } = useQuery({
    queryKey: planKeys.input(),
    queryFn: readPlanInput,
    initialData: readPlanInput,
    // Every table any condition reads. Declared next to the query, from the
    // schema objects rather than from strings, so the bus invalidates it and
    // nothing anywhere keeps a list (D8).
    meta: readsFrom(notificationSetting, setting, weightMeasure, journalEntry, day, dayMeal),
  });

  /**
   * Re-read on every foreground (D14, specs 9.3).
   *
   * refetch() rather than invalidateQueries: nothing here enumerates a key, and
   * the bus stays the only thing that turns a table change into an
   * invalidation. Coming back to the application is not a write — it is the
   * clock having moved, which is a reason for THIS query to re-read itself and
   * for nothing else to happen.
   *
   * It is also what makes the seven-day horizon roll forward: each foreground
   * plans one more day at the far end and drops the ones that have passed.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    const plan = buildPlan(data);

    // The change detector. Serialised, because React Query returns a new object
    // every refetch and the question is whether the PLAN changed — not whether
    // something was read again.
    const signature = JSON.stringify(
      plan.map((item) => [item.id, item.at, item.content.title, item.content.body]),
    );
    if (signature === lastApplied.current) return;
    lastApplied.current = signature;

    void applyPlan(getNotificationHost(), plan).catch(() => {
      // Swallowed, exactly as the backup rotation of G1 and the cache sweep
      // swallow their own. A notification centre that refuses is never a reason
      // for the application not to work — and the next foreground tries again.
      //
      // The signature is left as applied rather than rolled back: a failed
      // apply that retried on every render would hammer the native bridge on
      // the one screen the user is looking at.
    });
  }, [data]);
}
