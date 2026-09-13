import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate, weekday } from '../../src/core/date';
import type { DayTemplateId } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import { readTargets, resolveTemplate } from '../../src/features/nutrition/domain/planning';

/**
 * The three-level resolution of specs 8.1, as a pure function.
 *
 * Nothing here touches a database and nothing here touches the clock, which is
 * the property worth keeping: the planning is keyed by civil date and ISO
 * weekday, and both come out of a 'YYYY-MM-DD' string by integer arithmetic.
 * The suite runs under three timezones anyway and has nothing new to catch
 * here — which is the answer, not an omission.
 */

const TRAINING = newId<DayTemplateId>();
const REST = newId<DayTemplateId>();
const DEFAULT = newId<DayTemplateId>();

describe('resolveTemplate', () => {
  it('puts the override above everything else', () => {
    // "The ability to override a single date WITHOUT BREAKING the recurrence"
    // (specs 8.1): the weekday assignment is still there and still returned
    // the moment the override row goes away.
    expect(
      resolveTemplate({ override: REST, weekday: TRAINING, fallback: DEFAULT }),
    ).toEqual({ templateId: REST, level: 'override' });
  });

  it('falls to the recurrence when no date is overridden', () => {
    expect(resolveTemplate({ override: null, weekday: TRAINING, fallback: DEFAULT })).toEqual({
      templateId: TRAINING,
      level: 'weekday',
    });
  });

  it('falls to the default when the weekday carries no assignment', () => {
    expect(resolveTemplate({ override: null, weekday: null, fallback: DEFAULT })).toEqual({
      templateId: DEFAULT,
      level: 'default',
    });
  });

  it('answers nothing when the planning designates nothing', () => {
    // A fresh database, and also every database whose last template has just
    // been deleted. Specs 8.1 assumes a default always exists and never
    // describes its absence; this null is where that gap is answered.
    expect(resolveTemplate({ override: null, weekday: null, fallback: null })).toBeNull();
  });

  it('ignores a default that no longer exists rather than pointing at nothing', () => {
    // default_template_id lives in `setting`, a key/value table no constraint
    // can protect — so a dangling pointer arrives as `fallback: null` from the
    // read that could not find the template, and this function never has to
    // know the difference. The tolerance is the caller's; the rule is here.
    expect(resolveTemplate({ override: null, weekday: TRAINING, fallback: null })).toEqual({
      templateId: TRAINING,
      level: 'weekday',
    });
  });
});

describe('the weekday the planning is keyed by', () => {
  it('runs Monday to Sunday as 1 to 7, over a whole week', () => {
    // Restated here rather than only in tests/date because this is the module
    // that depends on it: planning_weekday documents 1 = Monday, and
    // Date.getDay() would give 0 for Sunday. The conversion lives in
    // core/date and predates this slice by four.
    const monday = toLocalDate('2026-09-07');
    expect([0, 1, 2, 3, 4, 5, 6].map((offset) => weekday(addDays(monday, offset)))).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe('readTargets', () => {
  it('reads the four columns as one value', () => {
    expect(
      readTargets({ targetProtein: 40, targetCarbs: 60, targetFat: 15, targetKcal: 535 }),
    ).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
  });

  it('reads a meal with no target at all as none', () => {
    expect(
      readTargets({
        targetProtein: null,
        targetCarbs: null,
        targetFat: null,
        targetKcal: null,
      }),
    ).toBeNull();
  });

  it('refuses a partial set, which would be a target nobody could read', () => {
    // All four or none. A meal carrying protein and nothing else would render
    // a banner with one bar and three blanks, and specs 8.1 describes targets
    // as belonging to a meal together.
    expect(
      readTargets({ targetProtein: 40, targetCarbs: null, targetFat: 15, targetKcal: 535 }),
    ).toBeNull();
    expect(
      readTargets({ targetProtein: null, targetCarbs: 60, targetFat: 15, targetKcal: 535 }),
    ).toBeNull();
  });

  it('keeps a zero, which is a target and not an absence', () => {
    // The trap the null checks exist to avoid: a falsy check would read a
    // legitimate "no carbs today" as no target at all.
    expect(
      readTargets({ targetProtein: 0, targetCarbs: 0, targetFat: 0, targetKcal: 0 }),
    ).toEqual({ protein: 0, carbs: 0, fat: 0, kcal: 0 });
  });
});
