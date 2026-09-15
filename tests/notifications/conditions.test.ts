import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate, type LocalDate } from '../../src/core/date';
import { readDayHasEntries, readDayTotals } from '../../src/features/nutrition/data/day-reads';
import { addFreeEntry } from '../../src/features/nutrition/data/day-writes';
import { setWeight } from '../../src/features/weight/data/weight-writes';
import { readWeight } from '../../src/features/weight/data/weight-reads';
import { summaryContent } from '../../src/features/notifications/domain/messages';
import { buildPlan, type PlanInput } from '../../src/features/notifications/domain/plan';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The conditions, against a real SQLite file (D15, fifth by value).
 *
 * The plan tests above feed buildPlan by hand; these check that what the
 * database actually answers is what the plan is being told. A condition that
 * reads correctly and a plan that reacts correctly are two different claims,
 * and the seam between them is where "the reminder fired anyway" would live.
 */

const TODAY = toLocalDate('2026-09-15');
const YESTERDAY = toLocalDate('2026-09-14');

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

function planFor(overrides: Partial<PlanInput>): PlanInput {
  const now = new Date(2026, 8, 15, 6, 0, 0);
  return {
    settings: [
      { kind: 'weigh_in', enabled: true, hour: 7, minute: 30 },
      { kind: 'empty_journal', enabled: true, hour: 20, minute: 30 },
      { kind: 'daily_summary', enabled: true, hour: 21, minute: 30 },
      { kind: 'export_reminder', enabled: false, hour: 19, minute: 0 },
    ],
    cutoffHour: 0,
    now,
    today: TODAY,
    weighedToday: false,
    journalHasEntries: false,
    summary: null,
    lastExportAt: now.getTime(),
    exportReminderDays: 7,
    ...overrides,
  };
}

function freeEntry(date: LocalDate, kcal: number): void {
  addFreeEntry(database.db, {
    date,
    mealPosition: 0,
    name: 'Repas',
    macros: { protein: 10, carbs: 20, fat: 5, kcal },
  });
}

describe('the weigh-in condition', () => {
  it('is met by a weight on the day, and only that day', () => {
    setWeight(database.db, YESTERDAY, 78.4, Date.now());

    // Weighing yesterday says nothing about today: the reminder is still due.
    expect(readWeight(database.db, TODAY)).toBeNull();

    setWeight(database.db, TODAY, 78.2, Date.now());
    expect(readWeight(database.db, TODAY)).not.toBeNull();
  });

  it('silences today’s reminder and leaves the rest of the week standing', () => {
    setWeight(database.db, TODAY, 78.2, Date.now());

    const plan = buildPlan(
      planFor({ weighedToday: readWeight(database.db, TODAY) !== null }),
    );
    const weighIns = plan.filter((item) => item.kind === 'weigh_in');

    expect(weighIns.some((item) => item.subjectDate === TODAY)).toBe(false);
    expect(weighIns.length).toBeGreaterThan(0);
  });
});

describe('the empty-journal condition', () => {
  it('is met by an entry that carries no calories at all', () => {
    // THE REASON readDayHasEntries EXISTS rather than readDayTotals().kcal > 0.
    // Black coffee is an entry. A day holding one is not an empty journal, and
    // saying so would be the application not noticing what was logged.
    addFreeEntry(database.db, {
      date: TODAY,
      mealPosition: 0,
      name: 'Café noir',
      macros: { protein: 0, carbs: 0, fat: 0, kcal: 0 },
    });

    expect(readDayTotals(database.db, TODAY).kcal).toBe(0);
    expect(readDayHasEntries(database.db, TODAY)).toBe(true);

    const plan = buildPlan(planFor({ journalHasEntries: true }));
    expect(plan.some((item) => item.kind === 'empty_journal' && item.subjectDate === TODAY)).toBe(
      false,
    );
  });

  it('is not met by an entry on a past date', () => {
    freeEntry(YESTERDAY, 600);
    expect(readDayHasEntries(database.db, TODAY)).toBe(false);
  });
});

describe('the summary, and what a past write does to it', () => {
  it('carries today’s figures', () => {
    freeEntry(TODAY, 600);

    const consumed = readDayTotals(database.db, TODAY);
    const content = summaryContent(consumed, null);
    expect(content.body).toContain('600');
  });

  it('is UNCHANGED by a write to a past date — the whole D8 argument', () => {
    // The bus will invalidate on this write and the query will refetch; what
    // must not change is the summary. Asserted against the database rather than
    // against a hand-built input, because the claim is about what the READ
    // returns, which is the half a mocked input cannot check.
    freeEntry(TODAY, 600);
    const before = summaryContent(readDayTotals(database.db, TODAY), null);

    freeEntry(YESTERDAY, 2000);
    const after = summaryContent(readDayTotals(database.db, TODAY), null);

    expect(after).toEqual(before);
  });

  it('IS changed by a write to today', () => {
    freeEntry(TODAY, 600);
    const before = summaryContent(readDayTotals(database.db, TODAY), null);

    freeEntry(TODAY, 400);
    const after = summaryContent(readDayTotals(database.db, TODAY), null);

    expect(after).not.toEqual(before);
  });
});
