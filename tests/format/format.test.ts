import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  formatDayAndMonth,
  formatDayShort,
  formatDayTitle,
  formatKcal,
  formatLongDate,
  formatMacro,
  formatMacroWhole,
  formatQuantity,
  parseDecimal,
  weekdayName,
} from '../../src/core/format';

/**
 * Display formatting (specs 5.1).
 *
 * The date half runs under three timezones like everything else in this suite:
 * these functions must give the same answer at +14 as in Paris, and they do
 * because they never touch a Date. That is exactly the property worth pinning.
 */

const NBSP = '\u00A0';

describe('macro and calorie rounding', () => {
  it('shows macros to one decimal', () => {
    expect(formatMacro(20)).toBe('20,0');
    expect(formatMacro(20.44)).toBe('20,4');
    expect(formatMacro(20.45)).toBe('20,5');
  });

  it('shows calories whole and grouped', () => {
    expect(formatKcal(330)).toBe('330');
    expect(formatKcal(2450.4)).toBe(`2${NBSP}450`);
    expect(formatKcal(12345)).toBe(`12${NBSP}345`);
  });

  it('keeps a negative remainder negative, and never prints minus zero', () => {
    expect(formatKcal(-120)).toBe('-120');
    expect(formatMacro(-0.04)).toBe('0,0');
    expect(formatKcal(-0.2)).toBe('0');
  });

  it('drops a pointless decimal on a quantity', () => {
    expect(formatQuantity(120, 'g')).toBe(`120${NBSP}g`);
    expect(formatQuantity(12.5, 'ml')).toBe(`12,5${NBSP}ml`);
  });
});

describe('parseDecimal', () => {
  it('accepts both separators, because the keypad offers either', () => {
    expect(parseDecimal('20')).toBe(20);
    expect(parseDecimal('20,5')).toBe(20.5);
    expect(parseDecimal('20.5')).toBe(20.5);
    expect(parseDecimal(' 20,5 ')).toBe(20.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('0')).toBe(0);
  });

  it('returns null rather than NaN on anything that is not a number', () => {
    // An expected failure is a value, not an exception (conventions 4). NaN
    // would sail straight into a macro and store itself.
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    expect(parseDecimal('1 2')).toBeNull();
    expect(parseDecimal('12g')).toBeNull();
  });
});

describe('French dates', () => {
  it('names the weekday, counting Monday first', () => {
    // 2026-09-11 is a Friday; 2026-09-14 the Monday after.
    expect(weekdayName(toLocalDate('2026-09-11'))).toBe('vendredi');
    expect(weekdayName(toLocalDate('2026-09-14'))).toBe('lundi');
    expect(weekdayName(toLocalDate('2026-09-13'))).toBe('dimanche');
  });

  it('writes a date out in full', () => {
    expect(formatLongDate(toLocalDate('2026-09-11'))).toBe('vendredi 11 septembre 2026');
    expect(formatLongDate(toLocalDate('2026-01-01'))).toBe('jeudi 1 janvier 2026');
    expect(formatDayAndMonth(toLocalDate('2026-08-03'))).toBe('3 août');
  });
});

describe('formatDayShort — the label of the Journal bar', () => {
  const today = toLocalDate('2026-09-11');

  it('names the three days the user lives in', () => {
    expect(formatDayShort(today, today)).toBe("Aujourd'hui");
    expect(formatDayShort(toLocalDate('2026-09-10'), today)).toBe('Hier');
    expect(formatDayShort(toLocalDate('2026-09-12'), today)).toBe('Demain');
  });

  it('gives everything else an abbreviated weekday and a padded date', () => {
    // Padded so the label does not change width from the 9th to the 10th,
    // which in a navigation bar shifts the buttons beside it.
    expect(formatDayShort(toLocalDate('2026-09-15'), today)).toBe('mar. 15/09');
    expect(formatDayShort(toLocalDate('2026-03-04'), today)).toBe('mer. 04/03');
  });

  it('abbreviates all seven days', () => {
    // A whole week from a Monday, so every entry of the table is exercised
    // rather than the two that happen to appear above.
    const week = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ];
    const far = toLocalDate('2026-06-01');
    expect(week.map((day) => formatDayShort(toLocalDate(day), far).split(' ')[0])).toEqual([
      'lun.',
      'mar.',
      'mer.',
      'jeu.',
      'ven.',
      'sam.',
      'dim.',
    ]);
  });

  it('adds the year only when it is not the current one', () => {
    // Short in the common case, never ambiguous about an old entry — the rule
    // formatDayTitle already follows.
    expect(formatDayShort(toLocalDate('2025-09-15'), today)).toBe('lun. 15/09/2025');
  });

  it('stays short enough for a navigation bar', () => {
    // The whole reason this exists beside formatDayTitle: "mardi 15 septembre"
    // gets truncated next to two buttons.
    for (const day of ['2026-09-15', '2026-12-31', '2025-01-01']) {
      expect(formatDayShort(toLocalDate(day), today).length, day).toBeLessThanOrEqual(15);
    }
  });
});

describe('formatDayTitle', () => {
  const today = toLocalDate('2026-09-11');

  it('names the three days the user lives in', () => {
    expect(formatDayTitle(today, today)).toBe("Aujourd'hui");
    expect(formatDayTitle(toLocalDate('2026-09-10'), today)).toBe('Hier');
    expect(formatDayTitle(toLocalDate('2026-09-12'), today)).toBe('Demain');
  });

  it('dates anything further out, without the year when it is this one', () => {
    expect(formatDayTitle(toLocalDate('2026-09-08'), today)).toBe('mardi 8 septembre');
  });

  it('adds the year as soon as it differs, so an old entry is never ambiguous', () => {
    expect(formatDayTitle(toLocalDate('2025-12-31'), today)).toBe('mercredi 31 décembre 2025');
    expect(formatDayTitle(toLocalDate('2027-01-04'), today)).toBe('lundi 4 janvier 2027');
  });
});

describe('formatMacroWhole', () => {
  it('rounds to the nearest whole gram', () => {
    expect(formatMacroWhole(47.4)).toBe('47');
    expect(formatMacroWhole(47.5)).toBe('48');
    expect(formatMacroWhole(47.6)).toBe('48');
  });

  it('never shows a decimal, however small the fraction', () => {
    // The divergence from specs 5.1, taken on request and only for the totals
    // of a day or a meal: a tenth of a gram is a measurement on one food and
    // arithmetic noise on a sum of a dozen.
    expect(formatMacroWhole(0.4)).toBe('0');
    expect(formatMacroWhole(0.5)).toBe('1');
  });

  it('groups thousands like the calories do', () => {
    expect(formatMacroWhole(1234)).toBe(`1${' '}234`);
  });

  it('collapses a negative zero rather than printing one', () => {
    expect(formatMacroWhole(-0.2)).toBe('0');
  });

  it('leaves the per-entry formatter alone, which still carries its decimal', () => {
    // An individual entry keeps one decimal because there the figure IS the
    // measurement. Asserted side by side so the two cannot be merged by
    // accident.
    expect(formatMacro(47.5)).toBe('47,5');
    expect(formatMacroWhole(47.5)).toBe('48');
  });
});
