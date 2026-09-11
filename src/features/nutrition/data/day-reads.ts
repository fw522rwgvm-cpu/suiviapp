import { asc, eq, sql } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  day,
  dayMeal,
  journalEntry,
  type BaseUnit,
  type DayMealId,
  type JournalEntryId,
  type JournalEntryKind,
} from '@/core/db/schema';
import { virtualDay, type DayView } from '../domain/day-plan';
import { totalOf, ZERO_MACROS, type Macros } from '../domain/macros';

/**
 * Reads of the journal (D8).
 *
 * Plain functions rather than hooks, so they run in Node against a real SQLite
 * file (D15). The hooks in day-queries.ts are thin wrappers over these.
 *
 * > Reading never writes.
 *
 * That is the guarantee specs 8.2 rests on: browsing three months of history
 * must create nothing. Nothing in this module inserts, and the absence of a
 * day row is answered with a virtual day rather than by making one.
 */

const macroSum = {
  protein: sql<number | null>`sum(${journalEntry.quantity} * ${journalEntry.protein100} / 100.0)`,
  carbs: sql<number | null>`sum(${journalEntry.quantity} * ${journalEntry.carbs100} / 100.0)`,
  fat: sql<number | null>`sum(${journalEntry.quantity} * ${journalEntry.fat100} / 100.0)`,
  kcal: sql<number | null>`sum(${journalEntry.quantity} * ${journalEntry.kcal100} / 100.0)`,
};

interface MacroSumRow {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  kcal: number | null;
}

function toMacros(row: MacroSumRow | undefined): Macros {
  if (row === undefined) return ZERO_MACROS;
  return {
    protein: row.protein ?? 0,
    carbs: row.carbs ?? 0,
    fat: row.fat ?? 0,
    kcal: row.kcal ?? 0,
  };
}

/**
 * The day as the screen renders it, materialised or not.
 *
 * A date with no row is not an error and not an empty screen: it is a virtual
 * day, built by the same function that will later feed its snapshot.
 */
export function readDay(db: AppDatabase, date: LocalDate): DayView {
  const rows = db.select({ date: day.date }).from(day).where(eq(day.date, date)).all();
  if (rows.length === 0) return virtualDay(date);

  const meals = db
    .select({
      id: dayMeal.id,
      position: dayMeal.position,
      name: dayMeal.name,
      targetProtein: dayMeal.targetProtein,
      targetCarbs: dayMeal.targetCarbs,
      targetFat: dayMeal.targetFat,
      targetKcal: dayMeal.targetKcal,
    })
    .from(dayMeal)
    .where(eq(dayMeal.date, date))
    .orderBy(asc(dayMeal.position), asc(dayMeal.id))
    .all();

  return {
    date,
    materialized: true,
    meals: meals.map((meal) => ({
      id: meal.id,
      position: meal.position,
      name: meal.name,
      // A meal either carries the four targets or none: a partial set would be
      // a target nobody could read (specs 8.1).
      targets:
        meal.targetProtein === null ||
        meal.targetCarbs === null ||
        meal.targetFat === null ||
        meal.targetKcal === null
          ? null
          : {
              protein: meal.targetProtein,
              carbs: meal.targetCarbs,
              fat: meal.targetFat,
              kcal: meal.targetKcal,
            },
    })),
  };
}

/**
 * What has been eaten on a date, in one aggregated query (D16).
 *
 * > The remaining banner is served by a single aggregated query, not by
 * > loading every entry.
 *
 * Written with no clause filtering childless rows, and still right: a grouped
 * recipe parent carries NULL macros and SUM ignores NULLs, so double counting
 * is impossible rather than avoided (D5/R2). A free entry, at quantity 100,
 * comes through the same expression as everything else.
 */
export function readDayTotals(db: AppDatabase, date: LocalDate): Macros {
  const rows = db
    .select(macroSum)
    .from(journalEntry)
    .where(eq(journalEntry.date, date))
    .all();
  return toMacros(rows[0]);
}

/**
 * Sub-total per meal, in one grouped query. Meals are collapsed by default
 * (specs 8.3), so their entries must not be loaded to show a sub-total.
 */
export function readMealTotals(db: AppDatabase, date: LocalDate): Map<DayMealId, Macros> {
  const rows = db
    .select({ mealId: journalEntry.dayMealId, ...macroSum })
    .from(journalEntry)
    .where(eq(journalEntry.date, date))
    .groupBy(journalEntry.dayMealId)
    .all();

  return new Map(rows.map((row) => [row.mealId, toMacros(row)]));
}

export interface JournalEntryView {
  id: JournalEntryId;
  kind: JournalEntryKind;
  name: string;
  brand: string | null;
  baseUnit: BaseUnit | null;
  quantity: number | null;
  /** Macros for 100 base units, as frozen (D5/R1). NULL on a grouped parent. */
  reference: Macros | null;
  /** Derived, never stored (D9). NULL where there is no reference to scale. */
  total: Macros | null;
}

/** The entries of one meal, loaded only when that meal is unfolded. */
export function readMealEntries(db: AppDatabase, mealId: DayMealId): JournalEntryView[] {
  const rows = db
    .select({
      id: journalEntry.id,
      kind: journalEntry.kind,
      name: journalEntry.name,
      brand: journalEntry.brand,
      baseUnit: journalEntry.baseUnit,
      quantity: journalEntry.quantity,
      protein100: journalEntry.protein100,
      carbs100: journalEntry.carbs100,
      fat100: journalEntry.fat100,
      kcal100: journalEntry.kcal100,
    })
    .from(journalEntry)
    .where(eq(journalEntry.dayMealId, mealId))
    .orderBy(asc(journalEntry.position), asc(journalEntry.id))
    .all();

  return rows.map((row) => {
    // Destructured so the null checks actually narrow: a boolean computed
    // ahead of time tells TypeScript nothing about the properties it read.
    const { protein100, carbs100, fat100, kcal100 } = row;

    // All four or none. A grouped recipe parent carries no macros at all
    // (D5/R2), and a partial set would be a reference nobody could scale.
    const reference: Macros | null =
      protein100 !== null && carbs100 !== null && fat100 !== null && kcal100 !== null
        ? { protein: protein100, carbs: carbs100, fat: fat100, kcal: kcal100 }
        : null;

    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      brand: row.brand,
      baseUnit: row.baseUnit,
      quantity: row.quantity,
      reference,
      total:
        reference === null || row.quantity === null ? null : totalOf(reference, row.quantity),
    };
  });
}
