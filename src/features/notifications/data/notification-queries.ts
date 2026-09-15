import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import { notificationSetting, setting } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import type { NotificationKind, NotificationTime } from '../domain/kinds';
import { readExportReminderDays } from '@/features/settings/data/settings-reads';
import { writeExportReminderDays } from '@/features/settings/data/settings-writes';
import { readNotificationSettings, type NotificationSetting } from './notification-reads';
import { setNotificationEnabled, setNotificationTime } from './notification-writes';

/**
 * Reads are hooks; writes are the functions of notification-writes.ts (D8).
 *
 * Not one onSuccess, as everywhere since slice 1. A write touches
 * notification_setting, SQLite reports it, and the bus invalidates whatever
 * declared reading that table — which is this query and the scheduling one, and
 * nothing has to know that.
 */

export const notificationKeys = {
  settings: () => ['notifications', 'settings'] as const,
};

/**
 * The four settings, available on the FIRST render.
 *
 * initialData for the reason usePreferences has it: the scheduling hook reads
 * this and decides whether to touch the notification centre at all, and a value
 * arriving one tick later would have it decide from an empty list — which reads
 * as "nothing is enabled" and would cancel everything, once, on every launch.
 *
 * Honest rather than optimistic: the database is local, synchronous and known
 * open (this runs below the gate), so it is a real read and not a guess to be
 * corrected later.
 */
export function useNotificationSettings(): NotificationSetting[] {
  const { data } = useQuery({
    queryKey: notificationKeys.settings(),
    queryFn: () => readNotificationSettings(getAppDatabase()),
    initialData: () => readNotificationSettings(getAppDatabase()),
    meta: readsFrom(notificationSetting),
  });

  return data;
}

export function useSetNotificationEnabled() {
  return useMutation({
    mutationFn: (input: { kind: NotificationKind; enabled: boolean; time: NotificationTime }) =>
      Promise.resolve(
        setNotificationEnabled(getAppDatabase(), input.kind, input.enabled, input.time),
      ),
  });
}

/**
 * How many days before the export counts as stale (specs 5.4, 9.3).
 *
 * Read here rather than through the backup feature's freshness query, because
 * the two want different things from the same key: that one composes an AGE
 * against the clock and goes stale on its own, this one is the raw setting a
 * control edits. Sharing it would make the settings row re-read every time the
 * clock moved.
 *
 * Declared as reading `setting`, so the bus invalidates both when it changes.
 */
export function useExportReminderDays(): number {
  const { data } = useQuery({
    queryKey: ['notifications', 'export-reminder-days'] as const,
    queryFn: () => readExportReminderDays(getAppDatabase()),
    initialData: () => readExportReminderDays(getAppDatabase()),
    meta: readsFrom(setting),
  });

  return data;
}

export function useSetExportReminderDays() {
  return useMutation({
    mutationFn: (days: number) =>
      Promise.resolve(writeExportReminderDays(getAppDatabase(), days)),
  });
}

export function useSetNotificationTime() {
  return useMutation({
    mutationFn: (input: { kind: NotificationKind; time: NotificationTime }) =>
      Promise.resolve(setNotificationTime(getAppDatabase(), input.kind, input.time)),
  });
}
