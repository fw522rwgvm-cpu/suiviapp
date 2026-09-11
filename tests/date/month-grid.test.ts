import { describe, expect, it } from 'vitest';
import {
  monthGrid,
  nextMonth,
  previousMonth,
  toLocalDate,
  type LocalDate,
} from '../../src/core/date';

/**
 * Month layout (D3).
 *
 * A calendar that lays a month out one column off is the most plausible wrong
 * thing this application could draw: it looks like a calendar, and the date
 * under the finger is not the date that gets written. The week starts on
 * Monday, which is exactly where an off-by-one hides.
 *
 * Runs under three timezones like the rest of the suite, because nothing here
 * may ever touch a Date.
 */

describe('monthGrid', () => {
  it('pads the first week so day one lands in its own column', () => {
    // 2026-09-01 is a Tuesday: one blank before it.
    const september = monthGrid(toLocalDate('2026-09-15'));
    expect(september.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02']);
  });

  it('needs six blanks for a month opening on a Sunday', () => {
    // 2026-03-01 is a Sunday, the worst case of a Monday-first week.
    const march = monthGrid(toLocalDate('2026-03-20'));
    expect(march.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(march[6]).toBe('2026-03-01');
  });

  it('needs no blank at all for a month opening on a Monday', () => {
    // 2026-06-01 is a Monday.
    expect(monthGrid(toLocalDate('2026-06-10'))[0]).toBe('2026-06-01');
  });

  it('holds every day of the month, and no day of another', () => {
    const grid = monthGrid(toLocalDate('2026-02-10'));
    const days = grid.filter((cell): cell is LocalDate => cell !== null);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days.at(-1)).toBe('2026-02-28');
  });

  it('counts the extra day of a leap February', () => {
    const days = monthGrid(toLocalDate('2028-02-01')).filter((cell) => cell !== null);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2028-02-29');
  });

  it('lays the same month out whatever day of it is asked for', () => {
    expect(monthGrid(toLocalDate('2026-09-01'))).toEqual(monthGrid(toLocalDate('2026-09-30')));
  });
});

describe('month steps', () => {
  it('lands on the first of the neighbouring month', () => {
    expect(previousMonth(toLocalDate('2026-09-15'))).toBe('2026-08-01');
    expect(nextMonth(toLocalDate('2026-09-15'))).toBe('2026-10-01');
  });

  it('crosses the year without losing it', () => {
    expect(previousMonth(toLocalDate('2026-01-20'))).toBe('2025-12-01');
    expect(nextMonth(toLocalDate('2026-12-20'))).toBe('2027-01-01');
  });

  it('never lands on a day that does not exist', () => {
    // Stepping back from the 31st of March by "a month" is the classic way to
    // arrive at the 31st of February. Both functions answer the first, so the
    // question cannot arise.
    expect(previousMonth(toLocalDate('2026-03-31'))).toBe('2026-02-01');
    expect(nextMonth(toLocalDate('2026-01-31'))).toBe('2026-02-01');
  });
});
