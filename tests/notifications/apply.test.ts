import { describe, expect, it } from 'vitest';
import { formatKcal } from '../../src/core/format';
import { toLocalDate } from '../../src/core/date';
import { applyPlan, cancelAll } from '../../src/features/notifications/domain/apply';
import { diffSchedule } from '../../src/features/notifications/domain/diff';
import type {
  NotificationHost,
  PendingNotification,
} from '../../src/features/notifications/domain/host';
import { summaryContent } from '../../src/features/notifications/domain/messages';
import type { PlannedNotification } from '../../src/features/notifications/domain/plan';

/**
 * Applying a plan, against a fake notification centre.
 *
 * ## WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * It fixes the TAXONOMY of what we ask iOS — that an unchanged plan asks for
 * nothing, that changed figures replace rather than duplicate, that turning
 * everything off empties our own queue and touches nobody else's.
 *
 * It proves NOTHING about iOS honouring any of it. Exactly the limit the Open
 * Food Facts client has against an injected fetch, and it is worth restating
 * rather than letting the green tests imply otherwise: iOS fires nothing in
 * Node, and half of this slice is a conversation with the system.
 */

class FakeHost implements NotificationHost {
  pending: PendingNotification[] = [];
  readonly scheduled: string[] = [];
  readonly cancelled: string[] = [];

  getPermission() {
    return Promise.resolve('granted' as const);
  }

  requestPermission() {
    return Promise.resolve('granted' as const);
  }

  getPending() {
    return Promise.resolve([...this.pending]);
  }

  schedule(notification: PlannedNotification) {
    this.scheduled.push(notification.id);
    this.pending = [
      ...this.pending.filter((item) => item.id !== notification.id),
      {
        id: notification.id,
        title: notification.content.title,
        body: notification.content.body,
      },
    ];
    return Promise.resolve();
  }

  cancel(id: string) {
    this.cancelled.push(id);
    this.pending = this.pending.filter((item) => item.id !== id);
    return Promise.resolve();
  }
}

function planned(id: string, title: string, body: string): PlannedNotification {
  const [kind, fireDate] = id.split(':') as [PlannedNotification['kind'], string];
  return {
    kind,
    id,
    fireDate: toLocalDate(fireDate),
    subjectDate: toLocalDate(fireDate),
    at: Date.parse(`${fireDate}T07:30:00Z`),
    year: Number(fireDate.slice(0, 4)),
    month: Number(fireDate.slice(5, 7)),
    day: Number(fireDate.slice(8, 10)),
    hour: 7,
    minute: 30,
    content: { title, body },
  };
}

describe('diffSchedule', () => {
  it('asks for nothing when the plan already matches', () => {
    // Idempotence, and it is not a nicety: this runs on every foreground and on
    // every invalidation the bus raises. A quiet day must cost one read of the
    // pending queue and nothing else.
    const item = planned('weigh_in:2026-09-16', 'Pesée du matin', 'Aucune pesée.');
    const pending = [{ id: item.id, title: item.content.title, body: item.content.body }];

    expect(diffSchedule(pending, [item])).toEqual({ toCancel: [], toSchedule: [] });
  });

  it('cancels what is pending and no longer wanted', () => {
    const pending = [{ id: 'weigh_in:2026-09-15', title: 'Pesée du matin', body: 'Aucune pesée.' }];
    const diff = diffSchedule(pending, []);

    expect(diff.toCancel).toEqual(['weigh_in:2026-09-15']);
    expect(diff.toSchedule).toEqual([]);
  });

  it('replaces an occurrence whose text changed, rather than leaving it', () => {
    // The summary keeps its identifier all day while its text changes with
    // every meal. Matching on identity alone would leave the morning's figures
    // pending until midnight — which is the defect D14 names in as many words.
    const morning = planned('daily_summary:2026-09-15', 'Bilan de la journée', '300 kcal.');
    const evening = planned('daily_summary:2026-09-15', 'Bilan de la journée', '1 820 kcal.');
    const pending = [
      { id: morning.id, title: morning.content.title, body: morning.content.body },
    ];

    const diff = diffSchedule(pending, [evening]);
    expect(diff.toCancel).toEqual([evening.id]);
    expect(diff.toSchedule.map((item) => item.id)).toEqual([evening.id]);
  });

  it('leaves alone a pending notification that is not ours', () => {
    // Slice 11's rest timer will live in the same queue. Anything we did not
    // plan and do not recognise is simply absent from both lists.
    const ours = planned('weigh_in:2026-09-16', 'Pesée du matin', 'Aucune pesée.');
    const pending = [
      { id: ours.id, title: ours.content.title, body: ours.content.body },
      { id: 'rest_timer:abc', title: 'Repos terminé', body: '' },
    ];

    const diff = diffSchedule(pending, [ours]);
    expect(diff.toCancel).toEqual(['rest_timer:abc']);
  });
});

describe('applyPlan', () => {
  it('cancels before it schedules', async () => {
    // Not cosmetic. When an occurrence is replaced because its text changed,
    // scheduling first would have both versions pending for an instant — and if
    // the cancel then failed, the STALE figures are the ones that survive. The
    // wrong direction of failure for the notification whose whole purpose is
    // carrying current figures.
    const host = new FakeHost();
    const order: string[] = [];
    host.pending = [
      { id: 'daily_summary:2026-09-15', title: 'Bilan de la journée', body: '300 kcal.' },
    ];
    const original = { cancel: host.cancel.bind(host), schedule: host.schedule.bind(host) };
    host.cancel = (id) => {
      order.push(`cancel:${id}`);
      return original.cancel(id);
    };
    host.schedule = (notification) => {
      order.push(`schedule:${notification.id}`);
      return original.schedule(notification);
    };

    await applyPlan(host, [
      planned('daily_summary:2026-09-15', 'Bilan de la journée', '1 820 kcal.'),
    ]);

    expect(order).toEqual([
      'cancel:daily_summary:2026-09-15',
      'schedule:daily_summary:2026-09-15',
    ]);
  });

  it('is a no-op the second time it runs on an unchanged plan', async () => {
    const host = new FakeHost();
    const plan = [planned('weigh_in:2026-09-16', 'Pesée du matin', 'Aucune pesée.')];

    await applyPlan(host, plan);
    expect(host.scheduled).toEqual(['weigh_in:2026-09-16']);

    await applyPlan(host, plan);
    expect(host.scheduled).toEqual(['weigh_in:2026-09-16']);
    expect(host.cancelled).toEqual([]);
  });

  it('empties the queue when nothing is planned any more', async () => {
    const host = new FakeHost();
    await applyPlan(host, [planned('weigh_in:2026-09-16', 'Pesée du matin', 'Aucune pesée.')]);
    await applyPlan(host, []);

    expect(host.pending).toEqual([]);
  });
});

describe('cancelAll', () => {
  it('removes only the kinds it is given', async () => {
    // Deliberately not cancelAllScheduledNotificationsAsync: that would also
    // drop anything a future slice scheduled, and slice 11's rest timer is not
    // ours to remove.
    const host = new FakeHost();
    host.pending = [
      { id: 'weigh_in:2026-09-16', title: 'Pesée du matin', body: '' },
      { id: 'daily_summary:2026-09-15', title: 'Bilan', body: '' },
      { id: 'rest_timer:abc', title: 'Repos terminé', body: '' },
    ];

    await cancelAll(host, ['weigh_in', 'daily_summary']);

    expect(host.pending.map((item) => item.id)).toEqual(['rest_timer:abc']);
  });
});

describe('summaryContent', () => {
  it('states the consumed figures alone when the day has no targets', () => {
    // Specs 9.3 asks for "consommé et restant" as though a target always
    // exists. A day with no template has none — dayTargets returns null — so
    // there is nothing to subtract from, and a "restant" computed against zero
    // would report the whole day as an overshoot.
    const content = summaryContent({ protein: 120, carbs: 200, fat: 60, kcal: 1820 }, null);

    // Through formatKcal rather than a literal: French groups thousands with a
    // NARROW NO-BREAK SPACE (U+202F), and a test spelling it with an ordinary
    // space would fail on a correct string — or, worse, pass once someone
    // "fixed" the formatter to emit the wrong character.
    expect(content.body).toContain(`${formatKcal(1820)} kcal`);
    expect(content.body).not.toContain('reste');
  });

  it('says by how much a target is passed rather than clamping at zero', () => {
    // Specs 8.3 has the screen say by how much, so the notification says it
    // too. Clamping would make every overshoot read as landing exactly on
    // target.
    const content = summaryContent(
      { protein: 160, carbs: 240, fat: 80, kcal: 2400 },
      { protein: 150, carbs: 220, fat: 70, kcal: 2100 },
    );

    expect(content.body).toContain('au-dessus');
    expect(content.body).not.toContain('restantes');
  });

  it('changes when the figures change, because that is the change detector', () => {
    const targets = { protein: 150, carbs: 220, fat: 70, kcal: 2100 };
    const morning = summaryContent({ protein: 20, carbs: 30, fat: 10, kcal: 300 }, targets);
    const evening = summaryContent({ protein: 120, carbs: 200, fat: 60, kcal: 1820 }, targets);

    expect(morning.body).not.toBe(evening.body);
  });

  it('does NOT change when a rounded figure is unmoved', () => {
    // The flip side, and it is a feature rather than a limit: the text is what
    // the user sees, so a change too small to display is a change not worth
    // waking the notification centre for. A tenth of a kilocalorie moves
    // nothing on screen and reschedules nothing.
    const targets = { protein: 150, carbs: 220, fat: 70, kcal: 2100 };
    const before = summaryContent({ protein: 120, carbs: 200, fat: 60, kcal: 1820 }, targets);
    const after = summaryContent({ protein: 120.02, carbs: 200, fat: 60, kcal: 1820.1 }, targets);

    expect(before.body).toBe(after.body);
  });
});
