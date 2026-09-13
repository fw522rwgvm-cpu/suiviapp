import { describe, expect, it } from 'vitest';
import { addDays, toLocalDate, weekday } from '../../src/core/date';
import type { DayTemplateId } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import {
  matchMealsToPlan,
  readTargets,
  resolveTemplate,
} from '../../src/features/nutrition/domain/planning';

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

describe('matchMealsToPlan', () => {
  it('pairs a day and a plan that agree', () => {
    const match = matchMealsToPlan(
      ['Petit-déjeuner', 'Déjeuner', 'Dîner'],
      ['Petit-déjeuner', 'Déjeuner', 'Dîner'],
    );

    expect(match.pairs).toEqual([
      { day: 0, plan: 0 },
      { day: 1, plan: 1 },
      { day: 2, plan: 2 },
    ]);
    expect(match.missing).toEqual([]);
    expect(match.unclaimed).toEqual([]);
  });

  it('does not shift when a meal in the middle has been deleted', () => {
    // THE DEFECT THIS FUNCTION EXISTS FOR. Index to index, the plan's dinner
    // would land on the day's snack and write its targets there — plausible
    // figures, simply the wrong ones, and nothing on screen would say so.
    const match = matchMealsToPlan(
      ['Petit-déjeuner', 'Déjeuner', 'Collation'],
      ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation'],
    );

    expect(match.pairs).toEqual([
      { day: 0, plan: 0 },
      { day: 1, plan: 1 },
      // The snack answers to the snack, not to the dinner that sits where it
      // used to.
      { day: 2, plan: 3 },
    ]);
    expect(match.missing).toEqual([2]);
    expect(match.unclaimed).toEqual([]);
  });

  it('reports a meal of the plan the day does not have', () => {
    const match = matchMealsToPlan(['Déjeuner'], ['Petit-déjeuner', 'Déjeuner']);

    expect(match.missing).toEqual([0]);
    expect(match.pairs).toEqual([{ day: 0, plan: 1 }]);
  });

  it('reports a meal of the day the plan does not mention', () => {
    const match = matchMealsToPlan(['Petit-déjeuner', 'Dîner'], ['Petit-déjeuner']);

    expect(match.pairs).toEqual([{ day: 0, plan: 0 }]);
    expect(match.unclaimed).toEqual([1]);
    expect(match.missing).toEqual([]);
  });

  it('pairs snacks in order and hands back the remainder', () => {
    // The one kind that repeats, so there is no single match to find. Three in
    // the plan against one on the day pairs the first and reports two missing.
    const match = matchMealsToPlan(
      ['Collation'],
      ['Collation', 'Collation', 'Collation'],
    );

    expect(match.pairs).toEqual([{ day: 0, plan: 0 }]);
    expect(match.missing).toEqual([1, 2]);
  });

  it('leaves the day’s extra snacks unclaimed rather than pairing them twice', () => {
    const match = matchMealsToPlan(
      ['Collation', 'Collation', 'Collation'],
      ['Collation'],
    );

    expect(match.pairs).toEqual([{ day: 0, plan: 0 }]);
    expect(match.unclaimed).toEqual([1, 2]);
  });

  it('never claims one meal of the day twice', () => {
    // The property the whole thing rests on: a day meal takes targets from at
    // most one plan meal, whatever the two lists look like.
    const match = matchMealsToPlan(
      ['Collation', 'Déjeuner'],
      ['Collation', 'Collation', 'Déjeuner', 'Déjeuner'],
    );

    const claimed = match.pairs.map((pair) => pair.day);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('accounts for every meal on both sides, always', () => {
    const dayNames = ['Petit-déjeuner', 'Collation', 'Collation'];
    const planNames = ['Petit-déjeuner', 'Dîner', 'Collation'];
    const match = matchMealsToPlan(dayNames, planNames);

    expect(match.pairs.length + match.missing.length).toBe(planNames.length);
    expect(match.pairs.length + match.unclaimed.length).toBe(dayNames.length);
  });

  it('handles an empty plan and an empty day', () => {
    expect(matchMealsToPlan([], [])).toEqual({ pairs: [], missing: [], unclaimed: [] });
    expect(matchMealsToPlan(['Déjeuner'], []).unclaimed).toEqual([0]);
    expect(matchMealsToPlan([], ['Déjeuner']).missing).toEqual([0]);
  });

  it('leaves a name from before the closed list unclaimed rather than guessing', () => {
    const match = matchMealsToPlan(['Pré-entraînement', 'Déjeuner'], ['Déjeuner']);

    expect(match.pairs).toEqual([{ day: 1, plan: 0 }]);
    expect(match.unclaimed).toEqual([0]);
  });
});
