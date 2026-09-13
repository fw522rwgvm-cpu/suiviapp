import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate, weekday } from '../../src/core/date';
import { setting, type DayTemplateId } from '../../src/core/db/schema';
import { newId } from '../../src/core/id';
import { readDay, readMealEntries } from '../../src/features/nutrition/data/day-reads';
import {
  addFreeEntry,
  deleteMeal,
  updateMeal,
  updateMealTargets,
} from '../../src/features/nutrition/data/day-writes';
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
  setDayTemplate,
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
    // Any action on the day materialises it (specs 8.2). Setting a target is
    // the one that changes neither the names nor the count, so what the
    // assertions below check is untouched by the act of preparing.
    updateMealTargets(fixture.db, {
      date: future,
      mealPosition: 0,
      targets: { protein: 1, carbs: 2, fat: 3, kcal: 39 },
    });

    updateTemplate(fixture.db, training, { name: 'Vidé', meals: [] });

    const view = readDay(fixture.db, future);
    expect(view.materialized).toBe(true);
    expect(view.meals).toHaveLength(4);
    expect(view.meals[0]?.name).toBe('Petit-déjeuner');
    expect(view.meals[0]?.targets).toEqual({ protein: 1, carbs: 2, fat: 3, kcal: 39 });
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

  it('never touches a name or an entry, and follows the NAME not the position', () => {
    // The promise the control makes — apply this template's targets — with the
    // half that changed: meals are matched by name. Position 0 is a breakfast
    // on the fallback day and on the template; turned into a snack here, so it
    // must take the SNACK's targets and not the breakfast's.
    updateMeal(fixture.db, { date: TUESDAY, mealPosition: 0, name: 'Collation', targets: null });
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 20, carbs: 30, fat: 10, kcal: 290 },
    });

    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    applyPlanTargetsToDay(fixture.db, TUESDAY);

    const view = readDay(fixture.db, TUESDAY);

    // The day now runs in the template's order, with the second snack — which
    // the template has no room for — trailing behind.
    expect(view.meals.map((meal) => meal.name)).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
      'Dîner',
      'Collation',
    ]);

    // The renamed meal kept its name and took the SNACK's targets, which this
    // template leaves empty. Under the old position matching it would have
    // taken the breakfast's 535.
    const snack = view.meals.find((meal) => meal.name === 'Collation');
    expect(snack?.targets).toBeNull();
    // And the breakfast the day no longer had comes back, in its own place.
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
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
      meals: [{ name: 'Déjeuner', targets: { protein: 5, carbs: 5, fat: 5, kcal: 85 } }],
    });
    setOverride(fixture.db, TUESDAY, short);
    applyPlanTargetsToDay(fixture.db, TUESDAY);

    const view = readDay(fixture.db, TUESDAY);
    // The lunch takes the only target the template has; every other meal keeps
    // its name and its entries and loses its numbers.
    expect(view.meals.find((meal) => meal.name === 'Déjeuner')?.targets).toEqual({
      protein: 5,
      carbs: 5,
      fat: 5,
      kcal: 85,
    });
    expect(view.meals.find((meal) => meal.name === 'Petit-déjeuner')?.targets).toBeNull();
    expect(view.meals.find((meal) => meal.name === 'Dîner')?.targets).toBeNull();
    // And nothing was added: the template names nothing the day lacks.
    expect(view.meals).toHaveLength(DEFAULT_MEAL_NAMES.length);
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

describe('saying which template one day follows', () => {
  it('changes a virtual day by recording the override alone', () => {
    const training = trainingTemplate();

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.materialized).toBe(false);
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
    // And it created nothing: choosing is not acting on the day (specs 8.2).
    expect(countRows(fixture.raw, 'day')).toBe(0);
  });

  it('changes a day THAT ALREADY HAS AN ENTRY, which is the whole point', () => {
    // The case the old control could not reach: the moment breakfast was
    // logged, the day's template stopped being changeable. An override alone
    // would write a row and move nothing on screen.
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 20, carbs: 30, fat: 10, kcal: 290 },
    });
    expect(readDay(fixture.db, TUESDAY).meals.every((meal) => meal.targets === null)).toBe(
      true,
    );

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals[0]?.targets).toEqual({ protein: 40, carbs: 60, fat: 15, kcal: 535 });
    expect(view.templateName).toBe("Jour d'entraînement");
    // The entry is untouched: only the targets moved.
    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);
  });

  it('replaces the targets of a day that already had some', () => {
    const training = trainingTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    const rest = restTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: rest });

    const view = readDay(fixture.db, TUESDAY);
    // The rest template holds one lunch, so the day's LUNCH takes it — not the
    // day's first meal, which is what position matching used to do.
    expect(view.meals.find((meal) => meal.name === 'Déjeuner')?.targets).toEqual({
      protein: 30,
      carbs: 40,
      fat: 12,
      kcal: 388,
    });
    // Every other meal's targets are cleared rather than left as a remnant of
    // a plan no longer in force.
    expect(view.meals.find((meal) => meal.name === 'Petit-déjeuner')?.targets).toBeNull();
    expect(view.meals.find((meal) => meal.name === 'Dîner')?.targets).toBeNull();
  });

  it('never renames a meal, and adds only what the plan names and the day lacks', () => {
    // Turning the breakfast into a snack leaves the day without a breakfast,
    // so applying a template that has one brings it back — in the template's
    // own order, and without touching the meal that took its place.
    updateMeal(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      name: 'Collation',
      targets: null,
    });

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals.map((meal) => meal.name)).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
      'Dîner',
      'Collation',
    ]);
    // Two snacks now, so the derived labels number them — and the numbering is
    // read off the day, which has just been reordered underneath it.
    expect(view.meals.filter((meal) => meal.name === 'Collation').map((m) => m.label)).toEqual(
      ['Collation 1', 'Collation 2'],
    );
  });

  it('goes back to the planning when handed nothing', () => {
    const training = trainingTemplate();
    const rest = restTemplate();
    assignWeekday(fixture.db, weekday(TUESDAY), training);
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: rest });
    expect(readDay(fixture.db, TUESDAY).meals[0]?.targets?.kcal).toBe(388);

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: null });

    // The recurrence answers again, and the override row is gone — removing it
    // is what makes "without breaking the recurrence" structural (specs 8.1).
    expect(readDay(fixture.db, TUESDAY).meals[0]?.targets?.kcal).toBe(535);
    expect(countRows(fixture.raw, 'planning_override')).toBe(0);
  });

  it('leaves a materialised day alone when the planning then designates nothing', () => {
    // "Follow the planning" on a day the planning has no answer for would
    // otherwise strip the targets the day already carries — a clearing gesture
    // nobody made.
    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: null });

    expect(readDay(fixture.db, TUESDAY).meals[0]?.targets?.kcal).toBe(535);
  });
});

describe('a meal deleted from the day, then a template applied', () => {
  it('brings the missing meal back, with its targets', () => {
    // The case asked for: delete the dinner, apply a template that has one, and
    // the day gets it back rather than staying short of it for ever.
    deleteMeal(fixture.db, { date: TUESDAY, mealPosition: 2 });
    expect(readDay(fixture.db, TUESDAY).meals.map((meal) => meal.name)).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
    ]);

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    const view = readDay(fixture.db, TUESDAY);
    const dinner = view.meals.find((meal) => meal.name === 'Dîner');
    expect(dinner?.targets).toEqual({ protein: 45, carbs: 55, fat: 18, kcal: 562 });
  });

  it('puts the right targets on the right meals, which position did not', () => {
    // THE DEFECT THE REQUEST EXPOSED. With the dinner gone, index to index put
    // the plan's dinner onto the day's snack: 562 kcal on a meal the template
    // gives no target at all. Plausible figures, simply the wrong ones.
    deleteMeal(fixture.db, { date: TUESDAY, mealPosition: 2 });

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals.find((meal) => meal.name === 'Petit-déjeuner')?.targets?.kcal).toBe(535);
    expect(view.meals.find((meal) => meal.name === 'Déjeuner')?.targets?.kcal).toBe(700);
    // The snack carries no target in this template, and must carry none here.
    expect(view.meals.find((meal) => meal.name === 'Collation')?.targets).toBeNull();
  });

  it('puts the restored meal in its place in the template, not at the end', () => {
    // The day is reordered to the template's order as it is applied, so the
    // dinner comes back BETWEEN the lunch and the snack rather than trailing
    // them. Renumbering is safe because entries hang off day_meal.id and never
    // off its position.
    deleteMeal(fixture.db, { date: TUESDAY, mealPosition: 2 });

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    expect(readDay(fixture.db, TUESDAY).meals.map((meal) => meal.name)).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
      'Dîner',
    ]);
  });

  it('reorders a day whose meals were never in the template order', () => {
    // Nothing missing and nothing extra — only the sequence is wrong, and the
    // template is what decides it.
    const evening = createTemplate(fixture.db, {
      name: 'Soir d’abord',
      meals: [
        { name: 'Dîner', targets: { protein: 1, carbs: 1, fat: 1, kcal: 17 } },
        { name: 'Déjeuner', targets: { protein: 2, carbs: 2, fat: 2, kcal: 34 } },
        { name: 'Petit-déjeuner', targets: { protein: 3, carbs: 3, fat: 3, kcal: 51 } },
      ],
    });
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 9, carbs: 9, fat: 9, kcal: 153 },
    });

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: evening });

    const view = readDay(fixture.db, TUESDAY);
    expect(view.meals.map((meal) => meal.name)).toEqual([
      'Dîner',
      'Déjeuner',
      'Petit-déjeuner',
      // The snack is not in this template, so it keeps everything but its
      // numbers and trails the three the template named.
      'Collation',
    ]);
    expect(view.meals[2]?.targets?.kcal).toBe(51);
    expect(view.meals[3]?.targets).toBeNull();

    // The entry went into the breakfast and is still in the breakfast, which
    // has just moved from first to third.
    const breakfast = view.meals.find((meal) => meal.name === 'Petit-déjeuner');
    expect(readMealEntries(fixture.db, breakfast!.id!)).toHaveLength(1);
  });

  it('keeps the entries of the meals that were still there', () => {
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 20, carbs: 30, fat: 10, kcal: 290 },
    });
    deleteMeal(fixture.db, { date: TUESDAY, mealPosition: 2 });

    const training = trainingTemplate();
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    expect(countRows(fixture.raw, 'journal_entry')).toBe(1);
    expect(readDay(fixture.db, TUESDAY).meals[0]?.name).toBe('Petit-déjeuner');
  });

  it('adds nothing when the day already has every meal the plan names', () => {
    const training = trainingTemplate();
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });
    setDayTemplate(fixture.db, { date: TUESDAY, templateId: training });

    // Applied twice: a meal must not be duplicated by an operation that is
    // meant to be safe to repeat.
    expect(readDay(fixture.db, TUESDAY).meals).toHaveLength(DEFAULT_MEAL_NAMES.length);
  });

  it('adds the snacks a plan has more of than the day', () => {
    const many = createTemplate(fixture.db, {
      name: 'Trois collations',
      meals: [
        { name: 'Collation', targets: { protein: 1, carbs: 1, fat: 1, kcal: 17 } },
        { name: 'Collation', targets: { protein: 2, carbs: 2, fat: 2, kcal: 34 } },
        { name: 'Collation', targets: { protein: 3, carbs: 3, fat: 3, kcal: 51 } },
      ],
    });
    addFreeEntry(fixture.db, {
      date: TUESDAY,
      mealPosition: 0,
      macros: { protein: 1, carbs: 1, fat: 1, kcal: 17 },
    });

    setDayTemplate(fixture.db, { date: TUESDAY, templateId: many });

    const snacks = readDay(fixture.db, TUESDAY).meals.filter(
      (meal) => meal.name === 'Collation',
    );
    expect(snacks).toHaveLength(3);
    expect(snacks.map((meal) => meal.targets?.kcal)).toEqual([17, 34, 51]);
  });
});
