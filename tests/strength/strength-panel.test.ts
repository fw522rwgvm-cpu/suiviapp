import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { newId } from '../../src/core/id';
import type { SessionId } from '../../src/core/db/schema';
import type { PanelSessionRow } from '../../src/features/strength/data/strength-panel-reads';
import {
  calendarWeeks,
  panelPoints,
  panelTotals,
  trainedDays,
} from '../../src/features/strength/domain/strength-panel';

/**
 * The arithmetic of the dashboard's strength panel (specs 10.6).
 *
 * Pure throughout, so the suite runs it under three time zones and the grid
 * below starts on a Monday in all of them (D3).
 */

const MINUTE = 60_000;

function aSession(date: string, over: Partial<PanelSessionRow> = {}): PanelSessionRow {
  return {
    id: newId<SessionId>(),
    date: toLocalDate(date),
    startedAt: 0,
    durationMs: 45 * MINUTE,
    volumeKg: 6000,
    reps: 120,
    setCount: 15,
    ...over,
  };
}

describe('the three series of specs 10.6', () => {
  it('keeps one point per session at the finest grain', () => {
    const points = panelPoints([aSession('2026-09-01'), aSession('2026-09-03')], 'day');

    expect(points).toHaveLength(2);
    expect(points[0]?.sessions).toBe(1);
    expect(points[0]?.durationMs).toBe(45 * MINUTE);
  });

  it('keeps two sessions of ONE day apart', () => {
    // A morning and an evening. Merging them by civil date would hide the
    // second on the only range fine enough to show it.
    const points = panelPoints([aSession('2026-09-01'), aSession('2026-09-01')], 'day');
    expect(points).toHaveLength(2);
  });

  it('takes the MEAN of a bucket for all three, with no exception', () => {
    /**
     * D9: "la somme n'est licite que pour les compteurs". Every one of the
     * three is a per-session figure, so a month summed is a figure nobody
     * trained in one session — and a partial bucket at the end of a range
     * would read as a collapse simply because the month is not over.
     *
     * This is the simpler half of the exercise page's decision, where three of
     * five series were already maxima and kept the max.
     */
    const points = panelPoints(
      [
        aSession('2026-09-01', { durationMs: 40 * MINUTE, volumeKg: 5000, reps: 100 }),
        aSession('2026-09-08', { durationMs: 60 * MINUTE, volumeKg: 7000, reps: 140 }),
      ],
      'month',
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.sessions).toBe(2);
    expect(points[0]?.durationMs).toBe(50 * MINUTE);
    expect(points[0]?.volumeKg).toBe(6000);
    expect(points[0]?.reps).toBe(120);
  });

  it('keeps a bodyweight bucket at null volume while averaging the rest', () => {
    // Zero would draw it at the floor of the volume chart — "you did nothing"
    // where the truth is "this is not measurable in kilograms".
    const points = panelPoints(
      [
        aSession('2026-09-01', { volumeKg: null, reps: 80 }),
        aSession('2026-09-08', { volumeKg: null, reps: 100 }),
      ],
      'month',
    );

    expect(points[0]?.volumeKg).toBeNull();
    expect(points[0]?.reps).toBe(90);
    expect(points[0]?.durationMs).toBe(45 * MINUTE);
  });

  it('groups a week onto its Monday', () => {
    // 1 and 3 September 2026 are a Tuesday and a Thursday of one week.
    const points = panelPoints(
      [aSession('2026-09-01'), aSession('2026-09-03'), aSession('2026-09-15')],
      'week',
    );

    expect(points.map((point) => point.date)).toEqual(['2026-08-31', '2026-09-14']);
  });
});

describe('the headline figures', () => {
  it('counts sessions and distinct DAYS, which are not the same number', () => {
    /**
     * Two sessions in one day is two sessions and one day, and the calendar
     * beside the figure marks one square. Counting the same thing twice
     * differently is the quiet disagreement this project treats as a defect.
     */
    const totals = panelTotals([
      aSession('2026-09-01'),
      aSession('2026-09-01'),
      aSession('2026-09-03'),
    ]);

    expect(totals.sessions).toBe(3);
    expect(totals.days).toBe(2);
  });

  it('averages the duration and the volume, and sums nothing but the count', () => {
    const totals = panelTotals([
      aSession('2026-09-01', { durationMs: 40 * MINUTE, volumeKg: 5000, reps: 100 }),
      aSession('2026-09-03', { durationMs: 60 * MINUTE, volumeKg: 7000, reps: 140 }),
    ]);

    expect(totals.meanDurationMs).toBe(50 * MINUTE);
    expect(totals.meanVolumeKg).toBe(6000);
    expect(totals.meanReps).toBe(120);
  });

  it('answers null rather than zero with nothing to average', () => {
    // A screen has to be able to say "pas encore de données" rather than print
    // a figure nobody's training produced.
    expect(panelTotals([])).toEqual({
      sessions: 0,
      days: 0,
      meanDurationMs: null,
      meanVolumeKg: null,
      meanReps: null,
    });
    // And a range of bodyweight sessions has a duration but no volume.
    expect(panelTotals([aSession('2026-09-01', { volumeKg: null })]).meanVolumeKg).toBeNull();
  });

  it('marks a day once however many sessions it carried', () => {
    const days = trainedDays([aSession('2026-09-01'), aSession('2026-09-01')]);
    expect(days.size).toBe(1);
    expect(days.has('2026-09-01')).toBe(true);
  });
});

describe('the calendar grid', () => {
  it('lays the range out in columns of seven, starting on a Monday', () => {
    // 2026-09-01 is a Tuesday; its column starts on Monday the 31st of August.
    const weeks = calendarWeeks(toLocalDate('2026-09-01'), toLocalDate('2026-09-14'));

    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.date).toBe('2026-08-31');
    expect(weeks[1]?.[0]?.date).toBe('2026-09-07');
  });

  it('marks the padding days as OUTSIDE the range', () => {
    /**
     * The state that is easy to forget. A grey square for a day the range
     * never covered would say "you did not train" about a day nobody was
     * asked about — and the first and last columns are full of them, purely
     * so the grid is square.
     */
    const weeks = calendarWeeks(toLocalDate('2026-09-01'), toLocalDate('2026-09-14'));
    const first = weeks[0] ?? [];

    // Monday the 31st of August is padding; Tuesday the 1st is the range.
    expect(first[0]?.inRange).toBe(false);
    expect(first[1]?.inRange).toBe(true);
    expect(first[1]?.date).toBe('2026-09-01');
  });

  it('covers a year without losing either end', () => {
    const weeks = calendarWeeks(toLocalDate('2025-09-20'), toLocalDate('2026-09-19'));
    const cells = weeks.flat();

    expect(cells.some((cell) => cell.date === '2025-09-20')).toBe(true);
    expect(cells.some((cell) => cell.date === '2026-09-19')).toBe(true);
    // Fifty-two or fifty-three columns, never more: the grid is the range.
    expect(weeks.length).toBeLessThanOrEqual(54);
  });

  it('answers one column for a reversed range instead of looping', () => {
    // Reachable only from a hand-repaired archive, which D7 says must stay
    // repairable. One week of padding beats an empty grid or a hang.
    const weeks = calendarWeeks(toLocalDate('2026-09-14'), toLocalDate('2026-09-01'));
    expect(weeks).toHaveLength(1);
  });
});
