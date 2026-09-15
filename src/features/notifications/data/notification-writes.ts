import type { AppDatabase } from '@/core/db/database';
import { notificationSetting } from '@/core/db/schema';
import { normalizeNotificationTime, type NotificationKind } from '../domain/kinds';

/**
 * Writes to notification_setting (schema 2.5, specs 9.3).
 *
 * Nothing here imports a native module, and nothing enumerates a query to
 * invalidate: the write touches notification_setting, SQLite reports it, and
 * the change bus invalidates whatever declared reading that table (D8).
 *
 * ## THE WRITE IS THE CHOICE, NOT THE SCHEDULE
 *
 * Nothing in this file talks to iOS. Enabling a notification stores a 1; what
 * iOS then holds pending is recomputed from this plus the clock, by the
 * scheduling hook, on the next render the bus triggers. Writing here and
 * scheduling there is the same separation ensureMaterialized and ensureOffFood
 * have: one transaction records what the user did, and the consequence is
 * derived rather than kept in step by hand.
 */

/**
 * Upsert, so a caller never has to know whether the row existed.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one. The rule that every multi-row operation is explicitly
 * transactional is about operations touching more than one row.
 *
 * The time is written alongside the flag rather than left alone, because a row
 * inserted by a toggle with hour NULL would read back as the default — which is
 * correct, but means the row does not say what the screen shows. Writing the
 * normalised time makes the stored row and the displayed row the same thing.
 */
export function setNotificationEnabled(
  db: AppDatabase,
  kind: NotificationKind,
  enabled: boolean,
  time: { hour: number; minute: number },
): void {
  const { hour, minute } = normalizeNotificationTime(kind, time.hour, time.minute);
  const flag = enabled ? 1 : 0;

  db.insert(notificationSetting)
    .values({ kind, enabled: flag, hour, minute })
    .onConflictDoUpdate({
      target: notificationSetting.kind,
      set: { enabled: flag, hour, minute },
    })
    .run();
}

/**
 * The hour of a kind, leaving its flag alone (specs 9.3: "à heure réglable").
 *
 * Normalised on the way IN as well as on the way out, which is not belt and
 * braces: clamping on read protects against a row this application did not
 * write, clamping on write means the stored value is the one the user will be
 * shown back. writeCutoffHour makes exactly that argument, one feature over.
 *
 * Inserting rather than only updating, because changing the time of a kind that
 * has never been enabled is an ordinary thing to do — the row may not exist
 * yet, and `enabled` then takes its column default of 0, which is the truthful
 * state: a time was chosen, nothing was turned on.
 */
export function setNotificationTime(
  db: AppDatabase,
  kind: NotificationKind,
  time: { hour: number; minute: number },
): void {
  const { hour, minute } = normalizeNotificationTime(kind, time.hour, time.minute);

  db.insert(notificationSetting)
    .values({ kind, hour, minute })
    .onConflictDoUpdate({
      target: notificationSetting.kind,
      set: { hour, minute },
    })
    .run();
}
