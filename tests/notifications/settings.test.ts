import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_TIMES,
  NOTIFICATION_KINDS,
  normalizeNotificationTime,
} from '../../src/features/notifications/domain/kinds';
import {
  anyNotificationEnabled,
  readNotificationSetting,
  readNotificationSettings,
} from '../../src/features/notifications/data/notification-reads';
import {
  setNotificationEnabled,
  setNotificationTime,
} from '../../src/features/notifications/data/notification-writes';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('normalizeNotificationTime', () => {
  it('reads an absent time as the kind default', () => {
    // NULL means "never chosen", which is the absence-is-the-default rule
    // settings-reads.ts has applied since slice 2. A missing row and a corrupt
    // value are the same thing to a caller.
    expect(normalizeNotificationTime('weigh_in', null, null)).toEqual(
      DEFAULT_NOTIFICATION_TIMES.weigh_in,
    );
  });

  it('clamps rather than refusing, which is why the column has no CHECK', () => {
    // The whole reason 0007 carries no CHECK on hour or minute: an archive
    // repaired by hand must import and read back sensibly, never fail on a
    // constraint. A settings row is never a reason to refuse to work.
    expect(normalizeNotificationTime('weigh_in', 25, 99)).toEqual({ hour: 23, minute: 59 });
    expect(normalizeNotificationTime('weigh_in', -4, -1)).toEqual({ hour: 0, minute: 0 });
  });

  it('keeps a usable hour when only the minute is corrupt', () => {
    // Two columns, two independent answers. Falling back on the kind default
    // for BOTH would throw away an hour the user really did choose, which is
    // the quiet kind of wrong: the notification still fires, just not when it
    // was asked to.
    expect(normalizeNotificationTime('daily_summary', 22, Number.NaN)).toEqual({
      hour: 22,
      minute: DEFAULT_NOTIFICATION_TIMES.daily_summary.minute,
    });
  });

  it('truncates a fractional hour instead of rounding it up', () => {
    expect(normalizeNotificationTime('empty_journal', 20.9, 30.9)).toEqual({
      hour: 20,
      minute: 30,
    });
  });

  it('gives every kind a default, so no kind can be unschedulable', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const time = DEFAULT_NOTIFICATION_TIMES[kind];
      expect(time.hour).toBeGreaterThanOrEqual(0);
      expect(time.hour).toBeLessThanOrEqual(23);
      expect(time.minute).toBeGreaterThanOrEqual(0);
      expect(time.minute).toBeLessThanOrEqual(59);
    }
  });

  it('puts the weigh-in clear of the latest possible cutoff', () => {
    // Specs 8.2 caps the cutoff at 6, so any reminder at or after 6 lands on
    // the civil date of the day whatever the cutoff is set to. This pins the
    // default clear of that boundary rather than adjacent to it — the reserve
    // specs 14.15 left open for this slice.
    expect(DEFAULT_NOTIFICATION_TIMES.weigh_in.hour).toBeGreaterThanOrEqual(6);
  });

  it('puts the empty-journal notice BEFORE the summary', () => {
    // The two must never both be useful at once, and the ordering is what makes
    // the surviving one the useful one. plan.ts keeps the summary silent on a
    // day with no entry; if the order flipped, the silence would arrive first
    // and the notice second.
    const notice = DEFAULT_NOTIFICATION_TIMES.empty_journal;
    const summary = DEFAULT_NOTIFICATION_TIMES.daily_summary;
    expect(notice.hour * 60 + notice.minute).toBeLessThan(summary.hour * 60 + summary.minute);
  });
});

describe('reading notification settings', () => {
  it('returns all four kinds from an empty table', () => {
    // An installation that has never opened the screen has no rows at all, and
    // that is not a degraded state: it is every installation on first launch.
    const settings = readNotificationSettings(database.db);
    expect(settings.map((setting) => setting.kind)).toEqual([...NOTIFICATION_KINDS]);
    expect(settings.every((setting) => !setting.enabled)).toBe(true);
  });

  it('IGNORES a row whose kind is not one of the four', () => {
    // The property that makes the missing CHECK safe rather than merely
    // acceptable, asserted rather than left to the comment. The read iterates
    // over the CODE and looks each kind up, so an archive carrying rest_timer —
    // or anything else — cannot reach the scheduler.
    database.raw
      .prepare('INSERT INTO notification_setting (kind, enabled, hour, minute) VALUES (?, ?, ?, ?)')
      .run('rest_timer', 1, 12, 0);

    const settings = readNotificationSettings(database.db);
    expect(settings.map((setting) => setting.kind)).toEqual([...NOTIFICATION_KINDS]);
    expect(anyNotificationEnabled(database.db)).toBe(false);
  });

  it('reads back a stored hour out of range as the clamped one', () => {
    database.raw
      .prepare('INSERT INTO notification_setting (kind, enabled, hour, minute) VALUES (?, ?, ?, ?)')
      .run('weigh_in', 1, 31, 77);

    expect(readNotificationSetting(database.db, 'weigh_in')).toEqual({
      kind: 'weigh_in',
      enabled: true,
      hour: 23,
      minute: 59,
    });
  });
});

describe('writing notification settings', () => {
  it('stores the choice and reads it back unchanged', () => {
    setNotificationEnabled(database.db, 'daily_summary', true, { hour: 21, minute: 15 });

    expect(readNotificationSetting(database.db, 'daily_summary')).toEqual({
      kind: 'daily_summary',
      enabled: true,
      hour: 21,
      minute: 15,
    });
    expect(anyNotificationEnabled(database.db)).toBe(true);
  });

  it('upserts rather than duplicating', () => {
    setNotificationEnabled(database.db, 'weigh_in', true, { hour: 7, minute: 0 });
    setNotificationEnabled(database.db, 'weigh_in', false, { hour: 8, minute: 0 });

    const rows = database.raw
      .prepare('SELECT COUNT(*) AS n FROM notification_setting')
      .get() as { n: number };
    expect(rows.n).toBe(1);
    expect(readNotificationSetting(database.db, 'weigh_in').enabled).toBe(false);
  });

  it('stores the clamped time, so a setting never reads back as something else', () => {
    // Clamping on write is not a repeat of clamping on read: the two answer
    // different questions. This one means the stored row and the row the screen
    // shows are the same thing. writeCutoffHour makes the same argument.
    setNotificationEnabled(database.db, 'weigh_in', true, { hour: 99, minute: 99 });

    const row = database.raw
      .prepare('SELECT hour, minute FROM notification_setting WHERE kind = ?')
      .get('weigh_in') as { hour: number; minute: number };
    expect(row).toEqual({ hour: 23, minute: 59 });
  });

  it('changes the time of a kind that was never enabled', () => {
    // Choosing an hour before turning something on is ordinary. The row does
    // not exist yet, so `enabled` takes its column default of 0 — which is the
    // truthful state: a time was chosen, nothing was turned on.
    setNotificationTime(database.db, 'export_reminder', { hour: 18, minute: 45 });

    expect(readNotificationSetting(database.db, 'export_reminder')).toEqual({
      kind: 'export_reminder',
      enabled: false,
      hour: 18,
      minute: 45,
    });
  });

  it('leaves the flag alone when only the time changes', () => {
    setNotificationEnabled(database.db, 'empty_journal', true, { hour: 20, minute: 0 });
    setNotificationTime(database.db, 'empty_journal', { hour: 21, minute: 30 });

    expect(readNotificationSetting(database.db, 'empty_journal')).toEqual({
      kind: 'empty_journal',
      enabled: true,
      hour: 21,
      minute: 30,
    });
  });
});
