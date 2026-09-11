import { addDays, type LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { addFreeEntry } from '@/features/nutrition/data/day-writes';
import type { Macros } from '@/features/nutrition/domain/macros';
import { createRandom } from './random';

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
  firstDate: LocalDate;
  lastDate: LocalDate;
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
  db.transaction((tx) => {
    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(firstDate, offset);
      if (!random.chance(coverage)) continue;

      daysWritten += 1;
      for (const [position, catalogue] of BY_MEAL.entries()) {
        // Meals are skipped too: a day is rarely logged from end to end.
        if (!random.chance(0.8)) continue;

        const helpings = random.between(1, position === 3 ? 2 : 1);
        for (let index = 0; index < helpings; index += 1) {
          const item = random.pick(catalogue);
          addFreeEntry(tx, {
            date,
            mealPosition: position,
            name: item.name,
            macros: jitter(item.macros, random.next()),
          });
          written += 1;
        }
      }
    }
  });

  return { days: daysWritten, entries: written, firstDate, lastDate: endDate };
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
