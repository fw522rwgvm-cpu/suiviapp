import { eq } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { notificationSetting } from '@/core/db/schema';
import {
  DEFAULT_NOTIFICATION_TIMES,
  NOTIFICATION_KINDS,
  normalizeNotificationTime,
  type NotificationKind,
  type NotificationTime,
} from '../domain/kinds';

/**
 * Reads of notification_setting (schema 2.5, specs 9.3).
 *
 * Plain functions taking the database as a parameter, like every access
 * function since slice 1, so they run in Node against a real SQLite file.
 * Nothing here imports a native module — expo-notifications is reached only
 * from features/notifications/native, and a convention test enforces it.
 */

/** A kind's setting as the application uses it: never null, always usable. */
export interface NotificationSetting extends NotificationTime {
  kind: NotificationKind;
  enabled: boolean;
}

/**
 * THE ITERATION IS OVER THE CODE, AND THE TABLE IS READ BY KEY.
 *
 * This is the direction that makes the missing CHECK on `kind` safe rather than
 * merely acceptable. The four kinds come from NOTIFICATION_KINDS — the
 * constant — and each one looks itself up. A row whose kind is not one of the
 * four is therefore a row NOTHING READS: it cannot reach the scheduler, cannot
 * appear on the Settings screen, and cannot be enabled by an archive.
 *
 * Written the other way round — SELECT * and branch on what comes back — an
 * imported archive could hand the scheduler a kind it has no branch for, and
 * the schema would have had to carry a CHECK to prevent it. The structure is
 * what buys the freedom slice 11 will want when it adds the rest timer.
 *
 * It is also why this returns all four rather than what is stored: an absent
 * row and a disabled one say the same thing, so the caller never has to know
 * which it got.
 */
export function readNotificationSettings(db: AppDatabase): NotificationSetting[] {
  const rows = db
    .select({
      kind: notificationSetting.kind,
      enabled: notificationSetting.enabled,
      hour: notificationSetting.hour,
      minute: notificationSetting.minute,
    })
    .from(notificationSetting)
    .all();

  const stored = new Map(rows.map((row) => [row.kind as string, row]));

  return NOTIFICATION_KINDS.map((kind) => {
    const row = stored.get(kind);
    const time = normalizeNotificationTime(kind, row?.hour ?? null, row?.minute ?? null);
    return { kind, enabled: row?.enabled === 1, ...time };
  });
}

/** One kind, for a screen that only needs one. Same fallbacks, same clamping. */
export function readNotificationSetting(
  db: AppDatabase,
  kind: NotificationKind,
): NotificationSetting {
  const rows = db
    .select({
      enabled: notificationSetting.enabled,
      hour: notificationSetting.hour,
      minute: notificationSetting.minute,
    })
    .from(notificationSetting)
    .where(eq(notificationSetting.kind, kind))
    .all();

  const row = rows[0];
  const time = normalizeNotificationTime(kind, row?.hour ?? null, row?.minute ?? null);
  return { kind, enabled: row?.enabled === 1, ...time };
}

/**
 * Whether anything at all is enabled.
 *
 * Read by the scheduling hook to decide whether to ask iOS for anything: with
 * all four off there is nothing to schedule and nothing to cancel, and the
 * application must never touch the notification centre on a phone whose owner
 * has not asked it to. Specs 9.3 is explicit that authorisation is requested on
 * activation in the Settings, never at first launch.
 */
export function anyNotificationEnabled(db: AppDatabase): boolean {
  return readNotificationSettings(db).some((setting) => setting.enabled);
}

export { DEFAULT_NOTIFICATION_TIMES };
