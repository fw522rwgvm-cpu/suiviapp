import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { IOS_PENDING_LIMIT, diffSchedule } from '../../src/features/notifications/domain/diff';
import { summaryContent } from '../../src/features/notifications/domain/messages';
import { buildPlan, type PlanInput } from '../../src/features/notifications/domain/plan';
import { HORIZON_DAYS } from '../../src/features/notifications/domain/occurrences';

/**
 * What should be pending, and what should not (D14, specs 9.3).
 *
 * The half of this slice a test can hold. What it cannot: that iOS fires any of
 * it. Stated rather than implied — see the slice notes.
 */

const DAY = 86_400_000;

function allEnabled(): PlanInput['settings'] {
  return [
    { kind: 'weigh_in', enabled: true, hour: 7, minute: 30 },
    { kind: 'empty_journal', enabled: true, hour: 20, minute: 30 },
    { kind: 'daily_summary', enabled: true, hour: 21, minute: 30 },
    { kind: 'export_reminder', enabled: true, hour: 19, minute: 0 },
  ];
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  const now = overrides.now ?? new Date(2026, 8, 15, 6, 0, 0);
  return {
    settings: allEnabled(),
    cutoffHour: 0,
    now,
    today: toLocalDate('2026-09-15'),
    weighedToday: false,
    journalHasEntries: true,
    summary: { title: 'Bilan de la journée', body: 'Consommé : 1 800 kcal.' },
    lastExportAt: now.getTime() - DAY,
    exportReminderDays: 7,
    ...overrides,
  };
}

function kinds(plan: ReturnType<typeof buildPlan>, kind: string) {
  return plan.filter((item) => item.kind === kind);
}

describe('buildPlan — what each kind anticipates', () => {
  it('schedules a disabled kind not at all', () => {
    const plan = buildPlan(
      input({
        settings: allEnabled().map((setting) =>
          setting.kind === 'weigh_in' ? { ...setting, enabled: false } : setting,
        ),
      }),
    );
    expect(kinds(plan, 'weigh_in')).toHaveLength(0);
  });

  it('schedules the weigh-in across the whole horizon', () => {
    // Tomorrow's weight cannot be known, so tomorrow's reminder is scheduled
    // unconditionally and cancelled tomorrow, when the application runs. That
    // is the whole of D14's argument for why conditional cancellation is
    // reliable here: nothing outside the application can satisfy a condition.
    expect(kinds(buildPlan(input()), 'weigh_in')).toHaveLength(HORIZON_DAYS);
  });

  it('drops only TODAY’s weigh-in once the weight is recorded', () => {
    const plan = buildPlan(input({ weighedToday: true }));
    const found = kinds(plan, 'weigh_in');

    expect(found).toHaveLength(HORIZON_DAYS - 1);
    expect(found.some((item) => item.subjectDate === toLocalDate('2026-09-15'))).toBe(false);
    // Tomorrow's survives, which is the point: weighing today says nothing
    // about tomorrow.
    expect(found[0]?.subjectDate).toBe(toLocalDate('2026-09-16'));
  });

  it('drops only TODAY’s empty-journal notice once something is logged', () => {
    const withEntries = kinds(buildPlan(input({ journalHasEntries: true })), 'empty_journal');
    const without = kinds(buildPlan(input({ journalHasEntries: false })), 'empty_journal');

    expect(without).toHaveLength(HORIZON_DAYS);
    expect(withEntries).toHaveLength(HORIZON_DAYS - 1);
  });
});

describe('the summary is never scheduled ahead, and that is the decision', () => {
  it('plans exactly one summary — today’s', () => {
    // D14 says "planification anticipée sur 7 jours" as though the four kinds
    // were alike. The summary cannot be: its text IS the day's figures, and
    // tomorrow's figures do not exist. Seven would queue six notifications
    // announcing today's numbers on days they have nothing to do with.
    const found = kinds(buildPlan(input()), 'daily_summary');

    expect(found).toHaveLength(1);
    expect(found[0]?.subjectDate).toBe(toLocalDate('2026-09-15'));
  });

  it('stays silent on a day with no entry', () => {
    // empty_journal fires an hour earlier and says the same thing. Two
    // notifications saying one thing is the alert you dismiss without reading —
    // the kind slice 4 removed everywhere else.
    expect(kinds(buildPlan(input({ journalHasEntries: false })), 'daily_summary')).toHaveLength(0);
  });

  it('plans nothing at all once its hour has gone by', () => {
    // 22:00 against a 21:30 summary. Nothing is carried over to tomorrow with
    // today's figures — the whole reason this kind does not anticipate.
    const now = new Date(2026, 8, 15, 22, 0, 0);
    expect(kinds(buildPlan(input({ now })), 'daily_summary')).toHaveLength(0);
  });

  it('carries the figures it was given', () => {
    const summary = summaryContent(
      { protein: 120, carbs: 200, fat: 60, kcal: 1820 },
      { protein: 150, carbs: 220, fat: 70, kcal: 2100 },
    );
    const [planned] = kinds(buildPlan(input({ summary })), 'daily_summary');

    expect(planned?.content).toEqual(summary);
  });
});

describe('the export reminder is the one that computes its condition ahead', () => {
  it('schedules the day the export WILL go stale, not the days it is still fresh', () => {
    // last_export_at cannot move unless the application runs — and if it moves,
    // the plan is rebuilt. So whether day J+k will be overdue is known today,
    // arithmetically, rather than scheduled and then cancelled.
    //
    // Exported yesterday at 6am, threshold seven days: the export goes stale on
    // the 21st at 6am, so the 19:00 occurrence of the 21st is overdue by the
    // time it fires and every earlier one is not. Getting this wrong in either
    // direction is invisible — a reminder that never comes, or one that nags
    // about a fresh export — which is why the boundary is pinned rather than
    // the count.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const plan = buildPlan(input({ now, lastExportAt: now.getTime() - DAY }));

    expect(kinds(plan, 'export_reminder').map((item) => item.fireDate)).toEqual(['2026-09-21']);
  });

  it('schedules nothing at all while the export stays fresh throughout', () => {
    // Exported this morning: seven days from now is past the horizon, so not
    // one occurrence qualifies.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const plan = buildPlan(input({ now, lastExportAt: now.getTime() }));

    expect(kinds(plan, 'export_reminder')).toHaveLength(0);
  });

  it('schedules only the days that will actually be overdue', () => {
    // Exported five days ago, threshold seven: days 0 and 1 are inside, the
    // rest are not. The 19:00 occurrences of the next two days stay away.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const plan = buildPlan(input({ now, lastExportAt: now.getTime() - 5 * DAY }));
    const found = kinds(plan, 'export_reminder');

    expect(found.map((item) => item.fireDate)).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ]);
  });

  it('treats never having exported as overdue', () => {
    // The case the reminder exists for: specs 5.4 makes the export the only
    // safety net, and a phone that has never made one is the least protected it
    // will ever be.
    const plan = buildPlan(input({ lastExportAt: null }));
    expect(kinds(plan, 'export_reminder')).toHaveLength(HORIZON_DAYS);
  });

  it('reads a last export in the FUTURE as not overdue', () => {
    // A clock that moved, not a negative age. The rate limiter states the rule
    // this follows: being a little too permissive costs one missed reminder,
    // being too strict costs a feature that never works again.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const plan = buildPlan(input({ now, lastExportAt: now.getTime() + 30 * DAY }));

    expect(kinds(plan, 'export_reminder')).toHaveLength(0);
  });

  it('follows the settable delay rather than a hard-coded seven', () => {
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const plan = buildPlan(
      input({ now, lastExportAt: now.getTime() - 2 * DAY, exportReminderDays: 1 }),
    );
    expect(kinds(plan, 'export_reminder')).toHaveLength(HORIZON_DAYS);
  });
});

describe('the plan as a whole', () => {
  it('stays well under the iOS ceiling', () => {
    // Four kinds over seven days is twenty-eight against sixty-four. Asserted
    // rather than assumed, because a fifth kind lands in slice 11 and a longer
    // horizon is a one-character change. Nothing truncates at runtime: if this
    // ever fails, the answer is a shorter horizon chosen deliberately, not
    // dropping whichever occurrences sorted last.
    const plan = buildPlan(input({ lastExportAt: null, weighedToday: false }));
    expect(plan.length).toBeLessThan(IOS_PENDING_LIMIT);
  });

  it('is ordered soonest first, and is the same list twice', () => {
    const first = buildPlan(input());
    const second = buildPlan(input());

    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]!.at).toBeGreaterThanOrEqual(first[index - 1]!.at);
    }
  });

  it('uses no repeating trigger, so every occurrence is cancellable alone', () => {
    // The contradiction inside D14, resolved: a repeating trigger is ONE
    // pending entry, so tomorrow's occurrence could not be cancelled without
    // killing every one after it. Every occurrence here is its own dated entry.
    const plan = buildPlan(input());
    const ids = plan.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a write to a past date reschedules nothing (D14, and D8 cannot say so)', () => {
  it('produces an identical summary when the day’s figures have not moved', () => {
    // THE POINT OF THE WHOLE ARRANGEMENT. The change bus invalidates by table
    // predicate and says nothing about which date moved, and writing a by-hand
    // invalidation is forbidden outright. So the discrimination is not made on
    // the write: a write to a past date invalidates, the query refetches, the
    // day's figures come back identical, and the diff finds nothing to do.
    const consumed = { protein: 120, carbs: 200, fat: 60, kcal: 1820 };
    const targets = { protein: 150, carbs: 220, fat: 70, kcal: 2100 };

    const before = buildPlan(input({ summary: summaryContent(consumed, targets) }));
    const after = buildPlan(input({ summary: summaryContent(consumed, targets) }));

    expect(diffSchedule(
      before.map((item) => ({ id: item.id, title: item.content.title, body: item.content.body })),
      after,
    )).toEqual({ toCancel: [], toSchedule: [] });
  });

  it('replaces the summary when today’s figures DO move', () => {
    const targets = { protein: 150, carbs: 220, fat: 70, kcal: 2100 };
    const morning = buildPlan(
      input({ summary: summaryContent({ protein: 20, carbs: 30, fat: 10, kcal: 300 }, targets) }),
    );
    const evening = buildPlan(
      input({ summary: summaryContent({ protein: 120, carbs: 200, fat: 60, kcal: 1820 }, targets) }),
    );

    const diff = diffSchedule(
      morning.map((item) => ({ id: item.id, title: item.content.title, body: item.content.body })),
      evening,
    );

    expect(diff.toCancel).toEqual(['daily_summary:2026-09-15']);
    expect(diff.toSchedule.map((item) => item.id)).toEqual(['daily_summary:2026-09-15']);
  });
});
