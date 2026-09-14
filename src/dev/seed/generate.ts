import { addDays, type LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import type { BaseUnit, FoodId, PortionName, YieldType } from '@/core/db/schema';
import { addFoodEntry, addFreeEntry } from '@/features/nutrition/data/day-writes';
import { listFoods } from '@/features/nutrition/data/food-reads';
import { createFood } from '@/features/nutrition/data/food-writes';
import { emptyFoodDraft } from '@/features/nutrition/domain/food-draft';
import { readTemplates } from '@/features/nutrition/data/planning-reads';
import {
  createTemplate,
  setDefaultTemplate,
} from '@/features/nutrition/data/planning-writes';
import { listRecipes } from '@/features/nutrition/data/recipe-reads';
import { createRecipe } from '@/features/nutrition/data/recipe-writes';
import { emptyRecipeDraft } from '@/features/nutrition/domain/recipe-draft';
import type { Macros } from '@/features/nutrition/domain/macros';
import { MEAL_KINDS } from '@/features/nutrition/domain/meal-kinds';
import { baseQuantity, portionQuantity } from '@/features/nutrition/domain/portions';
import { createRandom, type Random } from './random';

/**
 * Demo data generator (D15).
 *
 * > A tool to write in slice 1. It serves four times: testing migrations,
 * > checking performance on long histories, populating the development
 * > installation, and reproducing a bug without exposing real data.
 *
 * Two rules from D15 are structural here: no real export ever joins the
 * repository, and the development data set is generated, never copied. So
 * everything below is invented, generic, and deterministic.
 *
 * It writes through the ordinary write functions rather than inserting rows of
 * its own. That costs a little speed and buys the only thing that matters: the
 * generated history is shaped exactly like a real one — materialised the same
 * way, positioned the same way, frozen the same way. A generator that built
 * rows by hand would drift from the application and quietly stop reproducing
 * anything.
 */

interface DemoItem {
  name: string;
  /** Totals of one helping. A free entry stores them as its macros for 100. */
  macros: Macros;
}

interface DemoFood {
  name: string;
  brand: string | null;
  baseUnit: BaseUnit;
  /** Macros for 100 base units — the canonical form the database stores. */
  macros: Macros;
  /** The quantity the label is written against, kept as a preference. */
  refQty: number;
  isFavorite: boolean;
  portions: { name: PortionName; quantity: number }[];
  /** A plausible helping, in base units, for the days this food is logged. */
  helping: number;
}

/**
 * A small personal food database, invented and generic (D15).
 *
 * NOT DERIVED DATA, despite being generated: these are inputs, the same status
 * as the free entries below. What D9 forbids is storing what can be recomputed
 * from the current state, and no amount of staring at a journal yields a food
 * with a brand and a slice size.
 *
 * It exists because quick access — favourites, then recents (specs 8.4a) — has
 * nothing to show on a fresh installation, so the one screen this slice is
 * built around could not be looked at on the device at all. Two of them carry
 * portions and two are favourites, so both halves of the screen have content
 * and the portion path is exercised.
 *
 * Deliberately unremarkable, and deliberately not copied from anything real.
 */
const FOODS: DemoFood[] = [
  {
    name: 'Pain de mie complet',
    brand: 'Sans marque',
    baseUnit: 'g',
    macros: { protein: 8.5, carbs: 44, fat: 3.4, kcal: 248 },
    refQty: 100,
    isFavorite: true,
    portions: [{ name: 'tranche', quantity: 30 }],
    helping: 60,
  },
  {
    name: 'Blanc de poulet',
    brand: null,
    baseUnit: 'g',
    macros: { protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
    refQty: 100,
    isFavorite: true,
    portions: [{ name: 'portion', quantity: 120 }],
    helping: 150,
  },
  {
    name: 'Riz basmati cru',
    brand: null,
    baseUnit: 'g',
    // Raw and unprepared, always (specs 5.1). No cooking coefficient.
    macros: { protein: 7.5, carbs: 78, fat: 0.9, kcal: 350 },
    refQty: 100,
    isFavorite: false,
    portions: [{ name: 'bol', quantity: 80 }],
    helping: 80,
  },
  {
    name: 'Lait demi-écrémé',
    brand: 'Sans marque',
    baseUnit: 'ml',
    macros: { protein: 3.2, carbs: 4.8, fat: 1.5, kcal: 46 },
    refQty: 100,
    isFavorite: false,
    portions: [
      { name: 'verre', quantity: 200 },
      { name: 'bol', quantity: 300 },
    ],
    helping: 200,
  },
  {
    name: 'Yaourt nature',
    brand: 'Sans marque',
    baseUnit: 'g',
    // Typed against the pot rather than against 100 g, which is the case
    // display_ref_qty exists for.
    macros: { protein: 4.3, carbs: 5.1, fat: 3.2, kcal: 68 },
    refQty: 125,
    isFavorite: false,
    portions: [{ name: 'portion', quantity: 125 }],
    helping: 125,
  },
  {
    name: 'Amandes',
    brand: null,
    baseUnit: 'g',
    macros: { protein: 21, carbs: 6.9, fat: 50, kcal: 579 },
    refQty: 100,
    isFavorite: false,
    portions: [],
    helping: 30,
  },
];

/** Invented, generic, and deliberately unremarkable. */
const BREAKFAST: DemoItem[] = [
  { name: 'Flocons et lait', macros: { protein: 18, carbs: 62, fat: 9, kcal: 400 } },
  { name: 'Oeufs brouillés', macros: { protein: 22, carbs: 3, fat: 18, kcal: 265 } },
  { name: 'Pain et beurre', macros: { protein: 8, carbs: 44, fat: 14, kcal: 330 } },
  { name: 'Yaourt et fruits', macros: { protein: 14, carbs: 28, fat: 4, kcal: 205 } },
];

const MAIN: DemoItem[] = [
  { name: 'Poulet et riz', macros: { protein: 46, carbs: 70, fat: 11, kcal: 565 } },
  { name: 'Pâtes bolognaise', macros: { protein: 32, carbs: 84, fat: 17, kcal: 620 } },
  { name: 'Saumon et pommes de terre', macros: { protein: 38, carbs: 48, fat: 22, kcal: 540 } },
  { name: 'Salade composée', macros: { protein: 24, carbs: 26, fat: 19, kcal: 370 } },
  { name: 'Boeuf et légumes', macros: { protein: 42, carbs: 22, fat: 24, kcal: 470 } },
];

const SNACK: DemoItem[] = [
  { name: 'Fromage blanc', macros: { protein: 20, carbs: 8, fat: 3, kcal: 140 } },
  { name: 'Amandes', macros: { protein: 7, carbs: 5, fat: 18, kcal: 210 } },
  { name: 'Banane', macros: { protein: 1, carbs: 27, fat: 0, kcal: 110 } },
  { name: 'Barre protéinée', macros: { protein: 20, carbs: 22, fat: 8, kcal: 235 } },
];

/** Indexed by the default meal positions of day-plan.ts. */
const BY_MEAL: DemoItem[][] = [BREAKFAST, MAIN, MAIN, SNACK];

export interface SeedOptions {
  /** Most recent day generated, usually today. */
  endDate: LocalDate;
  /** How many days back from endDate, endDate included. */
  days: number;
  /** Same seed, same history. */
  seed?: number;
  /**
   * Share of days actually logged. Not every day gets written down, and
   * specs 8.7 leans on that: a day with no entry is an absence of measurement,
   * not a failure, so a realistic history has to contain some.
   */
  coverage?: number;
}

export interface SeedReport {
  days: number;
  entries: number;
  /** Foods created in the personal database. */
  foods: number;
  /** Recipes created in the library (slice 6). */
  recipes: number;
  firstDate: LocalDate;
  lastDate: LocalDate;
}

interface SeededFood {
  id: FoodId;
  food: DemoFood;
}

/**
 * Creates the demo food database, through the ordinary write function.
 *
 * Through createFood rather than by inserting rows, for the same reason the
 * journal goes through addFreeEntry: the generated database has to be shaped
 * exactly like a real one — canonical macros, portions positioned the same
 * way, the same validation — or it stops reproducing anything.
 *
 * REUSES A FOOD THAT IS ALREADY THERE, by name. The button in Settings says
 * "nothing is erased" and can be pressed twice — to stack thirty days on top
 * of ninety, which is a reasonable thing to want. Entries accumulating is the
 * point; the catalogue duplicating is not. Six foods becoming twelve, in two
 * sets of identical names, would make quick access unreadable and the recents
 * split between two rows for the same bread.
 *
 * Matched on the name alone: there is no unique index on it (specs 8.5 never
 * asks for one — two yoghurts from different brands are two foods), so this is
 * the generator's own rule and not a schema guarantee.
 */
function seedFoods(tx: AppDatabase): SeededFood[] {
  const existing = new Map(listFoods(tx).map((food) => [food.name, food.id]));

  return FOODS.map((food) => ({
    id: existing.get(food.name) ?? createFood(tx, {
      ...emptyFoodDraft(),
      name: food.name,
      brand: food.brand,
      baseUnit: food.baseUnit,
      // The catalogue states macros for 100; the draft wants them for refQty.
      macros:
        food.refQty === 100
          ? food.macros
          : {
              protein: (food.macros.protein * food.refQty) / 100,
              carbs: (food.macros.carbs * food.refQty) / 100,
              fat: (food.macros.fat * food.refQty) / 100,
              kcal: (food.macros.kcal * food.refQty) / 100,
            },
      refQty: food.refQty,
      isFavorite: food.isFavorite,
      portions: food.portions.map((portion) => ({ id: null, ...portion })),
    }),
    food,
  }));
}

/**
 * One logged food, sometimes expressed as a portion and sometimes in base
 * units — because both paths have to exist in a generated history for the
 * pre-fill chain of specs 8.4 to have anything to chew on.
 */
function logFood(
  tx: AppDatabase,
  date: LocalDate,
  mealPosition: number,
  seeded: SeededFood,
  random: Random,
): void {
  const [portion] = seeded.food.portions;

  addFoodEntry(tx, {
    date,
    mealPosition,
    foodId: seeded.id,
    quantity:
      portion !== undefined && random.chance(0.5)
        ? portionQuantity(portion, random.between(1, 2))
        : // Rounded to five base units, which is what anyone would actually
          // type — and never zero, which the write function refuses.
          baseQuantity(Math.max(5, Math.round((seeded.food.helping * (0.8 + random.next() * 0.4)) / 5) * 5)),
  });
}

/**
 * Two demo recipes, one yielded in portions and one by weight (slice 6).
 *
 * BOTH YIELDS, deliberately: they take different columns on the block's parent
 * row — portion_name for one, base_unit for the other — and a generated
 * database carrying only one of them would leave the other rendering path
 * unexercised on the device, which is the only place it can be looked at.
 *
 * Their ingredients name foods from the catalogue above, so the library is
 * coherent and deleting one of those foods exercises the freeze of D5/R3 with
 * a real recipe behind it.
 */
const RECIPES: readonly {
  name: string;
  yieldType: YieldType;
  yieldValue: number;
  prepMinutes: number | null;
  isFavorite: boolean;
  tags: string[];
  steps: string[];
  /** A food name from FOODS, and how much of it in base units. */
  ingredients: readonly { food: string; quantity: number }[];
}[] = [
  {
    name: 'Bol du matin',
    yieldType: 'portions',
    yieldValue: 2,
    prepMinutes: 5,
    isFavorite: true,
    tags: ['petit-déjeuner', 'rapide'],
    steps: ['Verser le lait sur le yaourt.', 'Ajouter les amandes concassées.'],
    // MIXED BASE UNITS ON PURPOSE: millilitres of milk beside grams of the
    // rest. It is the ordinary case, and it is why a weight yield is stated in
    // grams and never derived — there is no unit these two could sum in.
    ingredients: [
      { food: 'Lait demi-écrémé', quantity: 300 },
      { food: 'Yaourt nature', quantity: 125 },
      { food: 'Amandes', quantity: 30 },
    ],
  },
  {
    name: 'Poulet riz',
    yieldType: 'weight',
    yieldValue: 900,
    prepMinutes: 25,
    isFavorite: false,
    tags: ['batch cooking'],
    steps: ['Cuire le riz.', 'Saisir le poulet.', 'Mélanger.'],
    ingredients: [
      { food: 'Blanc de poulet', quantity: 400 },
      { food: 'Riz basmati cru', quantity: 200 },
    ],
  },
];

/**
 * Creates the demo recipes, through createRecipe rather than by inserting rows
 * — the reason seedFoods gives, one table along.
 *
 * REUSES A RECIPE ALREADY THERE, by name, so pressing the Settings button
 * twice stacks entries without duplicating the library. An ingredient naming a
 * food the catalogue no longer holds is skipped rather than fatal: the
 * generator must never be the thing that fails.
 */
function seedRecipes(tx: AppDatabase, foods: readonly SeededFood[]): number {
  const existing = new Set(listRecipes(tx).map((item) => item.name));
  const byName = new Map(foods.map((seeded) => [seeded.food.name, seeded]));
  let created = 0;

  for (const recipe of RECIPES) {
    if (existing.has(recipe.name)) continue;

    const ingredients = recipe.ingredients.flatMap((line) => {
      const seeded = byName.get(line.food);
      if (seeded === undefined) return [];
      return [
        {
          id: null,
          foodId: seeded.id,
          name: seeded.food.name,
          quantity: line.quantity,
          // Follows the food, always: an ingredient whose unit disagreed with
          // its food's would be refused by the write layer, and rightly.
          unit: seeded.food.baseUnit,
          frozen: null,
        },
      ];
    });

    if (ingredients.length === 0) continue;

    createRecipe(tx, {
      ...emptyRecipeDraft(),
      name: recipe.name,
      prepMinutes: recipe.prepMinutes,
      yieldType: recipe.yieldType,
      yieldValue: recipe.yieldValue,
      isFavorite: recipe.isFavorite,
      tags: recipe.tags,
      steps: recipe.steps.map((text) => ({ id: null, text })),
      ingredients,
    });
    created += 1;
  }

  return created;
}

/**
 * One day template, made the default, so the generated days have goals.
 *
 * ## WITHOUT IT, HALF OF SLICE 7 IS INVISIBLE ON THE DEVICE
 *
 * A day materialises from whatever the planning resolves to, and until slice 7
 * the generator created no template — so every generated day came out with no
 * goal at all. That is a legitimate state (it is what a fresh installation
 * looks like), but it is also the one state in which the remaining banner stays
 * silent and the adherence rate has an empty denominator. Nothing about either
 * could be judged by looking.
 *
 * ## ONLY WHEN THERE IS NONE, BECAUSE THE BUTTON PROMISES NOT TO ERASE
 *
 * The Settings button says nothing is erased and can be pressed twice — to
 * stack thirty days on ninety, which is a reasonable thing to want. Creating a
 * template every time would leave a pile of identical ones; assigning the
 * default every time would silently replace a planning the user set up by hand
 * on the development installation. Reused by absence, like the foods are
 * reused by name.
 *
 * The figures are an ordinary day rather than anyone's: roughly 2 000 kcal
 * split over four meals, with the snack left without goals on purpose —
 * amendment 14.6 no 10 allows a meal to carry none, and a PARTIALLY targeted
 * day is the case the statistics have to get right.
 */
function seedTemplate(tx: AppDatabase): void {
  if (readTemplates(tx).length > 0) return;

  // Names taken from MEAL_KINDS, never typed again: they are a closed list
  // (amendment 14.6 no 14), matching is BY NAME, and a near-miss on an accent
  // would produce a template whose meals no day could ever be paired with.
  const [breakfast, lunch, dinner, snack] = MEAL_KINDS;

  const id = createTemplate(tx, {
    name: 'Jour ordinaire',
    meals: [
      { name: breakfast, targets: { protein: 30, carbs: 55, fat: 15, kcal: 475 } },
      { name: lunch, targets: { protein: 45, carbs: 85, fat: 22, kcal: 720 } },
      { name: dinner, targets: { protein: 45, carbs: 75, fat: 22, kcal: 680 } },
      { name: snack, targets: null },
    ],
  });

  setDefaultTemplate(tx, id);
}

export function seedJournal(db: AppDatabase, options: SeedOptions): SeedReport {
  const { endDate, days, seed = 1, coverage = 0.85 } = options;
  if (days < 1) throw new Error('Nothing to generate');

  const random = createRandom(seed);
  const firstDate = addDays(endDate, -(days - 1));
  let written = 0;
  let daysWritten = 0;

  // One transaction for the whole history. The write functions open their own,
  // which nest as savepoints, so every invariant still runs — and an
  // interrupted seed leaves the database exactly as it was.
  let seeded: SeededFood[] = [];
  let recipes = 0;

  db.transaction((tx) => {
    seedTemplate(tx);
    seeded = seedFoods(tx);
    recipes = seedRecipes(tx, seeded);

    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(firstDate, offset);
      if (!random.chance(coverage)) continue;

      daysWritten += 1;
      for (const [position, catalogue] of BY_MEAL.entries()) {
        // Meals are skipped too: a day is rarely logged from end to end.
        if (!random.chance(0.8)) continue;

        const helpings = random.between(1, position === 3 ? 2 : 1);
        for (let index = 0; index < helpings; index += 1) {
          // Both kinds, in a realistic mix. Free entry stays the majority of
          // nothing in particular: slice 3 gives the personal database its
          // first real use, and a history with no 'food' row would leave the
          // recents of quick access empty on the device.
          if (random.chance(0.6)) {
            logFood(tx, date, position, random.pick(seeded), random);
          } else {
            const item = random.pick(catalogue);
            addFreeEntry(tx, {
              date,
              mealPosition: position,
              name: item.name,
              macros: jitter(item.macros, random.next()),
            });
          }
          written += 1;
        }
      }
    }
  });

  return {
    days: daysWritten,
    entries: written,
    foods: seeded.length,
    recipes,
    firstDate,
    lastDate: endDate,
  };
}

/**
 * Nudges the figures by up to a tenth, so no two days are identical and the
 * charts of slice 7 have something to draw. Rounded to one decimal, which is
 * the precision anyone would have typed (specs 5.1).
 */
function jitter(macros: Macros, draw: number): Macros {
  const factor = 0.9 + draw * 0.2;
  const round = (value: number): number => Math.round(value * factor * 10) / 10;
  return {
    protein: round(macros.protein),
    carbs: round(macros.carbs),
    fat: round(macros.fat),
    kcal: Math.round(macros.kcal * factor),
  };
}
