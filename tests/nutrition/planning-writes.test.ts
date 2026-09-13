import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate, weekday } from '../../src/core/date';
import { setting, type DayTemplateId } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import { readDay } from '../../src/features/nutrition/data/day-reads';
import { addFreeEntry, renameMeal } from '../../src/features/nutrition/data/day-writes';
import {
  readDayPlan,
  readDefaultTemplateId,
  readPlanning,
  readTemplate,
  readTemplates,
  readTemplateUsage,
} from '../../src/features/nutrition/data/planning-reads';
import {
  applyPlanTargetsToDay,
  assignWeekday,
  createTemplate,
  deleteTemplate,
  setDefaultTemplate,
  setOverride,
  updateTemplate,
} from '../../src/features/nutrition/data/planning-writes';
import { DEFAULT_MEAL_NAMES } from '../../src/features/nutrition/domain/day-plan';
import { SETTING_KEYS } from '../../src/features/settings/data/settings-reads';
import { countRows, openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * The templates and the planning, against a real SQLite file (D15).
 *
 * What this file is actually for is the pair of rules that no unit test of a
 * pure function can reach: that a materialised day is DEAF to the planning for
 * ever, and that deleting a template takes its assignments and leaves its
 * history alone. Both are properties of the database, and both are the kind
 * that look fine until the day they are needed.
 */

// 2026-09-07 is a Monday, so this Tuesday is ISO weekday 2.
const TUESDAY = toLocalDate('2026-09-15');
const WEDNESDAY = toLocalDate('2026-09-16');

let fixture: TestDatabase;

beforeEach(() => {
  fixture = openTestDatabase();
});

afterEach(() => {
  fixture.close();
});

function trainingTemplate(): DayTemplateId {
  return createTemplate(fixture.db, {
    name: "Jour d'entraînement",
    meals: [
      { name: 'Petit-déjeuner', targets: { protein: 40, carbs: 60, fat: 15, kcal: 535 } },
      { name: 'Déjeuner', targets: { protein: 50, carbs: 80, fat: 20, kcal: 700 } },
      { name: 'Collation', targets: null },
      { name: 'Dîner', targets: { protein: 45, carbs: 55, fat: 18, kcal: 562 } },
    ],
  });
}

function restTemplate(): DayTemplateId {
  return createTemplate(fixture.db, {
    name: 'Jour de repos',
    meals: [{ name: 'Déjeuner', targets: { protein: 30, carbs: 40, fat: 12, kcal: 388 } }],
  });
}

describe('the three levels, against the database', () => {
  it('puts an override above the recurrence, and the recurrence above the default', () => {
    const training = trainingTemplate();
    const rest = restTemplate();
    const other = createTemplate(fixture.db, { name: 'Par défaut', meals: [] });

    setDefaultTemplate(fixture.db, other);
    expect(readDayPlan(fixture.db, TUESDAY).level).toBe('default');

    assignWeekday(fixture.db, weekday(TUESDAY), training);
    expect(readDayPlan(fixture.db, TUESDAY).templateId).toBe(training);
    expect(readDayPlan(fixture.db, TUESDAY).level).toBe('weekday');

    setOverride(fixture.db, TUESDAY, rest);
    expect(readDayPlan(fixture.db, TUESDAY).templateId).toBe(rest);
    expect(readDayPlan(fixture.db, TUESDAY).level).toBe('override');
  });

  it('restores the recurrence when the override is removed, breaking nothing', () => {
    // Specs 8.1: overriding a date must not break the recurrence. Structural
    // here rather than careful — the override is its own row.
    const training = trainingTemplate();
    const rest = restTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    setOverride(fixture.db, TUESDAY, rest);

    setOverride(fixture.db, TUESDAY, null);

    expect(readDayPlan(fixture.db, TUESDAY).templateId).toBe(training);
    expect(readDayPlan(fixture.db, TUESDAY).level).toBe('weekday');
  });

  it('falls back to the code list when the planning designates nothing', () => {
    // A fresh database. Specs 8.1 assumes a default always exists; this is the
    // answer slice 1 wrote and slice 5 kept, rather than seeding a template in
    // the migration.
    const plan = readDayPlan(fixture.db, TUESDAY);

    expect(plan.templateId).toBeNull();
    expect(plan.level).toBeNull();
    expect(plan.meals.map((meal) => meal.name)).toEqual([...DEFAULT_MEAL_NAMES]);
    expect(plan.meals.every((meal) => meal.targets === null)).toBe(true);
  });

  it('keys the recurrence on Monday-is-one, not on Date.getDay', () => {
    // The bug this asserts against: assigning "Tuesday" with getDay() would
    // write 2 for Wednesday and the day would silently read the wrong plan.
    const training = trainingTemplate();
    assignWeekday(fixture.db, 2, training);

    expect(readDayPlan(fixture.db, TUESDAY).templateId).toBe(training);
    expect(readDayPlan(fixture.db, WEDNESDAY).templateId).toBeNull();
  });
});

describe('the default pointer, which no constraint can protect', () => {
  it('is cleared when its template is deleted', () => {
    const training = trainingTemplate();
    setDefaultTemplate(fixture.db, training);

    deleteTemplate(fixture.db, training);

    expect(readDefaultTemplateId(fixture.db)).toBeNull();
    expect(countRows(fixture.raw, 'setting')).toBe(0);
  });

  it('reads as absent when it names a template that is not there', () => {
    // The path the transaction above cannot cover: an imported archive, or a
    // settings row repaired by hand. The rule and the guarantee are two
    // different things, and only this one survives another binary.
    fixture.db
      .insert(setting)
      .values({ key: SETTING_KEYS.defaultTemplateId, value: newId<DayTemplateId>() })
      .run();

    expect(readDefaultTemplateId(fixture.db)).toBeNull();
    expect(readDayPlan(fixture.db, TUESDAY).meals.map((meal) => meal.name)).toEqual([
      ...DEFAULT_MEAL_NAMES,
    ]);
  });

  it('reads as absent when the stored value is not an identifier at all', () => {
    fixture.db
      .insert(setting)
      .values({ key: SETTING_KEYS.defaultTemplateId, value: 'jour de repos' })
      .run();

    expect(readDefaultTemplateId(fixture.db)).toBeNull();
  });

  it('still lets the recurrence answer when the default dangles', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    fixture.db
      .insert(setting)
      .values({ key: SETTING_KEYS.defaultTemplateId, value: newId<DayTemplateId>() })
      .run();

    expect(readDayPlan(fixture.db, TUESDAY).templateId).toBe(training);
  });
});

describe('a virtual day', () => {
  it('renders the template the planning resolves to, targets and all', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);

    const view = readDay(fixture.db, TUESDAY);

    expect(view.materialized).toBe(false);
    expect(view.meals.map((meal) => meal.name)).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
      'Dîner',
    ]);
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
    // A meal with no goal is legitimate and stays without one.
    expect(view.meals[2]?.targets).toBeNull();
    // And reading it created nothing (specs 8.2).
    expect(countRows(fixture.raw, 'day')).toBe(0);
  });

  it('follows a template edit immediately, which is what 8.2 asks for', () => {
    // "Its targets are deduced from the planning IN FORCE AT THE MOMENT OF
    // CONSULTATION." A virtual day has nothing frozen, so it has nothing to
    // protect from an edit.
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);

    updateTemplate(fixture.db, training, {
      name: "Jour d'entraînement",
      meals: [{ name: 'Déjeuner unique', targets: { protein: 1, carbs: 2, fat: 3, kcal: 39 } }],
    });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals).toHaveLength(1);
    expect(view.meals[0]?.name).toBe('Déjeuner unique');
  });

  it('renders no meal at all for a template holding none', () => {
    const empty = createTemplate(fixture.db, { name: 'Vide', meals: [] });
    assignWeekday(fixture.db, weekday(TUESDAY), empty);

    expect(readDay(fixture.db, TUESDAY).meals).toEqual([]);
  });
});

describe('materialisation freezes the plan', () => {
  it('writes the snapshot and the targets in the same transaction', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);

    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 1,
      name: 'Poulet',
      macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
    });

    const row = fixture.raw
      .prepare('SELECT template_id_snapshot AS id, template_name_snapshot AS name FROM day')
      .get() as { id: string; name: string };
    expect(row.id).toBe(training);
    expect(row.name).toBe("Jour d'entraînement");

    const view = readDay(fixture.db, TUESDAY);
    expect(view.materialized).toBe(true);
    expect(view.meals[1]?.targets).toEqual({ protein: 50, carbs: 80, fat: 20, kcal: 700 });
  });

  it('leaves the snapshot null when the planning designates nothing', () => {
    // The truthful record: no template applied, so naming one would invent a
    // fact. This is every day materialised before 0004, for ever.
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    const row = fixture.raw
      .prepare('SELECT template_id_snapshot AS id, template_name_snapshot AS name FROM day')
      .get() as { id: string | null; name: string | null };
    expect(row.id).toBeNull();
    expect(row.name).toBeNull();
  });

  it('materialises a day with no meal when the template has none', () => {
    // The day row is what says the day exists, not its meals — and Drizzle
    // refuses an empty VALUES list, which is the bug this covers.
    const empty = createTemplate(fixture.db, { name: 'Vide', meals: [] });
    assignWeekday(fixture.db, weekday(TUESDAY), empty);

    // There is no meal at position 0 to log into, so the write rolls back
    // rather than leaving a materialised day behind with nothing to justify it.
    expect(() =>
      addFreeEntry(fixture.db, {
        date: TUESDAY,
        mealPosition: 0,
        macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
      }),
    ).toThrow();
    expect(countRows(fixture.raw, 'day')).toBe(0);
  });
});

describe('a materialised day is deaf to the planning, for ever (specs 8.1)', () => {
  it('does not move when the template it came from is edited', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    updateTemplate(fixture.db, training, {
      name: 'Renommé',
      meals: [{ name: 'Tout autre chose', targets: { protein: 9, carbs: 9, fat: 9, kcal: 153 } }],
    });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals).toHaveLength(4);
    expect(view.meals[0]?.name).toBe('Petit-déjeuner');
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
  });

  it('does not move when the planning is reassigned underneath it', () => {
    const training = trainingTemplate();
    const rest = restTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    assignWeekday(fixture.db, weekday(TUESDAY), rest);
    setOverride(fixture.db, TUESDAY, rest);

    expect(readDay(fixture.db, TUESDAY).meals).toHaveLength(4);
  });

  it('protects a FUTURE day prepared in advance, by being materialised', () => {
    // Specs 8.2 states this for future days specifically. There is no special
    // case in the code, and that is the point: it holds because the day was
    // materialised, not because it is in the future.
    const training = trainingTemplate();
    const future = toLocalDate('2027-03-04');
    assignWeekday(fixture.db, weekday(future), training);
    renameMeal(fixture.db, { date: future, mealPosition: 0, name: 'Préparé' });

    updateTemplate(fixture.db, training, { name: 'Vidé', meals: [] });

    const view = readDay(fixture.db, future);
    expect(view.materialized).toBe(true);
    expect(view.meals).toHaveLength(4);
    expect(view.meals[0]?.name).toBe('Préparé');
  });
});

describe('deleting a template', () => {
  it('takes its assignments and blocks nothing (specs 5.3)', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, 2, training);
    assignWeekday(fixture.db, 4, training);
    setOverride(fixture.db, TUESDAY, training);

    expect(() => deleteTemplate(fixture.db, training)).not.toThrow();

    expect(countRows(fixture.raw, 'planning_weekday')).toBe(0);
    expect(countRows(fixture.raw, 'planning_override')).toBe(0);
    expect(countRows(fixture.raw, 'day_template_meal')).toBe(0);
  });

  it('leaves every materialised day exactly as it was', () => {
    // THE COUNTERWEIGHT TO THE CASCADE. day.template_id_snapshot carries no
    // foreign key so that history survives (specs 5.2), and the snapshot keeps
    // naming a template that no longer exists — which is what it is for.
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 12, carbs: 3, fat: 4, kcal: 96 },
    });

    deleteTemplate(fixture.db, training);

    const view = readDay(fixture.db, TUESDAY);
    expect(view.materialized).toBe(true);
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);

    const row = fixture.raw
      .prepare('SELECT template_id_snapshot AS id, template_name_snapshot AS name FROM day')
      .get() as { id: string; name: string };
    expect(row.id).toBe(training);
    expect(row.name).toBe("Jour d'entraînement");
  });

  it('is reported to the user by what it will actually take', () => {
    // readTemplateUsage counts ASSIGNMENTS, never materialised days: a past day
    // is untouched, and saying otherwise would frighten the user out of an
    // operation that costs them nothing.
    const training = trainingTemplate();
    assignWeekday(fixture.db, 2, training);
    assignWeekday(fixture.db, 4, training);
    setOverride(fixture.db, TUESDAY, training);
    setDefaultTemplate(fixture.db, training);
    addFreeEntry(fixture.db, {
      date: WEDNESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    expect(readTemplateUsage(fixture.db, training)).toEqual({
      weekdays: [2, 4],
      overrides: [TUESDAY],
      isDefault: true,
    });
  });
});

describe('editing a template', () => {
  it('replaces the meals in bulk, so a reorder is one operation', () => {
    const training = trainingTemplate();

    updateTemplate(fixture.db, training, {
      name: "Jour d'entraînement",
      // The first two swapped: a row-by-row reconciliation would have to shuffle
      // through a temporary slot, and nothing references these identifiers.
      meals: [
        { name: 'Déjeuner', targets: { protein: 50, carbs: 80, fat: 20, kcal: 700 } },
        { name: 'Petit-déjeuner', targets: { protein: 40, carbs: 60, fat: 15, kcal: 535 } },
      ],
    });

    const view = readTemplate(fixture.db, training);
    expect(view?.meals.map((meal) => meal.name)).toEqual(['Déjeuner', 'Petit-déjeuner']);
    expect(view?.meals.map((meal) => meal.position)).toEqual([0, 1]);
    expect(countRows(fixture.raw, 'day_template_meal')).toBe(2);
  });

  it('lets a used template lose a meal without touching anything already logged', () => {
    // The question asked plainly: past days keep their four meals, the
    // recurrence keeps pointing at the template, and a virtual day shows three.
    const training = trainingTemplate();
    assignWeekday(fixture.db, 2, training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 3,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    updateTemplate(fixture.db, training, {
      name: "Jour d'entraînement",
      meals: [
        { name: 'Petit-déjeuner', targets: null },
        { name: 'Déjeuner', targets: null },
        { name: 'Dîner', targets: null },
      ],
    });

    // The logged day keeps its four meals and its entry.
    expect(readDay(fixture.db, TUESDAY).meals).toHaveLength(4);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);
    // A future Tuesday, still virtual, shows three.
    expect(readDay(fixture.db, toLocalDate('2026-09-22')).meals).toHaveLength(3);
    // And the recurrence is untouched: it names the template, not its meals.
    expect(readPlanning(fixture.db).week[1]?.templateId).toBe(training);
  });

  it('refuses to edit a template that is gone', () => {
    expect(() =>
      updateTemplate(fixture.db, newId<DayTemplateId>(), { name: 'x', meals: [] }),
    ).toThrow();
  });
});

describe('applying the planning targets to a day already materialised', () => {
  it('gives a logged day a real target, which is the whole point', () => {
    // The case that would otherwise fail on the very day templates are set up:
    // today is materialised the moment breakfast is logged, and a materialised
    // day never consults the planning.
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 20, carbs: 30, fat: 10, kcal: 290 },
    });
    expect(readDay(fixture.db, TUESDAY).meals.every((meal) => meal.targets === null)).toBe(true);

    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    applyPlanTargetsToDay(fixture.db, TUESDAY);

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
    expect(view.meals[1]?.targets).toEqual({ protein: 50, carbs: 80, fat: 20, kcal: 700 });
  });

  it('never touches a name, a meal count or an entry', () => {
    // The promise the button makes — "apply the TARGETS of X" — is exactly
    // what happens. A meal the user renamed keeps its name; a meal they added
    // stays; the entries stay.
    renameMeal(fixture.db, { date: TUESDAY, mealPosition: 0, name: 'Mon réveil' });
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 20, carbs: 30, fat: 10, kcal: 290 },
    });

    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    applyPlanTargetsToDay(fixture.db, TUESDAY);

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals[0]?.name).toBe('Mon réveil');
    expect(view.meals).toHaveLength(DEFAULT_MEAL_NAMES.length);
    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);
    // And the snapshot now names the template whose numbers the day carries.
    const row = fixture.raw
      .prepare('SELECT template_name_snapshot AS name FROM day')
      .get() as { name: string };
    expect(row.name).toBe("Jour d'entraînement");
  });

  it('clears the targets of meals the template does not reach', () => {
    // Applying a set of targets means the day carries that set and no remnant
    // of an earlier one.
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    const short = createTemplate(fixture.db, {
      name: 'Court',
      meals: [{ name: 'Unique', targets: { protein: 5, carbs: 5, fat: 5, kcal: 85 } }],
    });
    setOverride(fixture.db, TUESDAY, short);
    applyPlanTargetsToDay(fixture.db, TUESDAY);

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals[0]?.targets).toEqual({ protein: 5, carbs: 5, fat: 5, kcal: 85 });
    expect(view.meals[1]?.targets).toBeNull();
    expect(view.meals[3]?.targets).toBeNull();
  });

  it('refuses a virtual day, which would be creating data by consultation', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);

    expect(() => applyPlanTargetsToDay(fixture.db, TUESDAY)).toThrow();
    expect(countRows(fixture.raw, 'day')).toBe(0);
  });

  it('refuses when the planning designates nothing to apply', () => {
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    expect(() => applyPlanTargetsToDay(fixture.db, TUESDAY)).toThrow();
  });
});

describe('the planning as the settings screen reads it', () => {
  it('always renders seven days, assigned or not', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, 2, training);

    const view = readPlanning(fixture.db);

    expect(view.week.map((entry) => entry.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view.week[1]?.templateName).toBe("Jour d'entraînement");
    expect(view.week[0]?.templateId).toBeNull();
  });

  it('lists the overrides with the template they name', () => {
    const rest = restTemplate();
    setOverride(fixture.db, TUESDAY, rest);

    expect(readPlanning(fixture.db).overrides).toEqual([
      { date: TUESDAY, templateId: rest, templateName: 'Jour de repos' },
    ]);
  });

  it('counts the meals of each template without loading them', () => {
    trainingTemplate();
    restTemplate();

    expect(readTemplates(fixture.db).map((template) => template.mealCount).sort()).toEqual([
      1, 4,
    ]);
  });
});

describe('the name the day shows for its template', () => {
  it('is the planning\'s on a virtual day, and the snapshot\'s once frozen', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);

    expect(readDay(fixture.db, TUESDAY).templateName).toBe("Jour d'entraînement");

    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });
    updateTemplate(fixture.db, training, { name: 'Renommé', meals: [] });

    // THE ANSWER TO "I edited my template, why has my day not changed". The
    // day keeps naming the template as it was called when it was frozen, which
    // is what a snapshot is for (specs 5.2).
    expect(readDay(fixture.db, TUESDAY).templateName).toBe("Jour d'entraînement");
    // And a still-virtual day shows the new name.
    expect(readDay(fixture.db, toLocalDate('2026-09-22')).templateName).toBe('Renommé');
  });

  it('survives the deletion of the template it names', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    deleteTemplate(fixture.db, training);

    expect(readDay(fixture.db, TUESDAY).templateName).toBe("Jour d'entraînement");
  });

  it('is null on a day frozen before any template existed', () => {
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    expect(readDay(fixture.db, TUESDAY).templateName).toBeNull();
  });
});
