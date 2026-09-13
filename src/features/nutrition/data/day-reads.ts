import { asc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  day,
  dayMeal,
  journalEntry,
  type BaseUnit,
  type DayMealId,
  type FoodId,
  type JournalEntryId,
  type JournalEntryKind,
  type RecipeId,
} from '@/core/db/schema';
import { virtualDay, type DayView } from '../domain/day-plan';
import { sumMacros, totalOf, ZERO_MACROS, type Macros } from '../domain/macros';
import { mealLabels } from '../domain/meal-kinds';
import { readTargets } from '../domain/planning';
import { readDayPlan } from './planning-reads';

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
 * day, built from the planning in force right now (specs 8.2) by the same
 * function that will later feed its snapshot.
 *
 * ## THE BRANCH IS WHERE "NO RETROACTIVE EFFECT" ACTUALLY LIVES
 *
 * A materialised day reads its own day_meal rows and NEVER consults the
 * planning. So specs 8.1 — "modifying a template does not retroactively affect
 * materialised days" — is not a rule enforced here; it is a query that is not
 * made. A future day already filled in is covered by the same sentence with no
 * special case: 8.2 says a materialised future day becomes insensitive to
 * later planning changes, and it does so by being materialised, not by being
 * in the future.
 *
 * The consequence the user meets: a day materialised before templates existed
 * has no targets and will never grow any on its own. That is the truthful
 * record — no template applied when it was frozen — and the banner offers to
 * apply today's targets as an explicit act rather than adopting them in
 * silence.
 */
export function readDay(db: AppDatabase, date: LocalDate): DayView {
  const rows = db
    .select({ date: day.date, templateName: day.templateNameSnapshot })
    .from(day)
    .where(eq(day.date, date))
    .all();

  const row = rows[0];
  if (row === undefined) return virtualDay(date, readDayPlan(db, date));

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

  // Derived from the day's own list, never stored (D9): a stored "Collation 2"
  // would outlive the deletion of "Collation 1" and name a position that no
  // longer exists.
  const labels = mealLabels(meals.map((meal) => meal.name));

  return {
    date,
    materialized: true,
    // The snapshot, not the planning: this names the template this day was
    // frozen from, which may since have been renamed or deleted (specs 5.2).
    templateName: row.templateName,
    meals: meals.map((meal, index) => ({
      id: meal.id,
      position: meal.position,
      name: meal.name,
      label: labels[index] ?? meal.name,
      // All four or none: a partial set would be a target nobody could read
      // (specs 8.1). Shared with the template meals rather than restated,
      // because materialisation copies one onto the other — two readings of
      // the same four columns would be free to disagree.
      targets: readTargets(meal),
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
  /**
   * How much of it.
   *
   * Always in base units for a row that carries macros — the rule slice 3
   * settled and the clause-free SUM depends on.
   *
   * A GROUPED RECIPE PARENT IS THE ONE EXCEPTION, and it is safe for exactly
   * one reason: it carries NO macros (D5/R2), so quantity is never multiplied
   * by anything. On such a row this holds how much of the recipe was eaten —
   * a count of portions when the yield is in portions, grams when it is in
   * grams — which is what the journal has to show and what nothing else can
   * derive, the recipe being a living object.
   *
   * That is not a breach of the invariant, it is its shadow: SUM(quantity *
   * NULL) is NULL whatever the quantity. A test mutates a parent's quantity
   * and demands that no total in the journal moves by a bit, so the rule is
   * falsifiable rather than commented.
   */
  quantity: number | null;
  /** The food this came from, if any. Informative, without a live link. */
  sourceFoodId: FoodId | null;
  /** The recipe a grouped block came from. Informative, without a live link. */
  sourceRecipeId: RecipeId | null;
  /**
   * How the quantity was expressed, frozen at the time (D5/R1).
   *
   * Carried so the journal can say "2 tranches" rather than "50 g" — showing
   * the base quantity for an entry logged as a portion would be showing the
   * storage form, the same mistake as showing a free entry as "100 g".
   */
  portionName: string | null;
  portionQuantity: number | null;
  /** Macros for 100 base units, as frozen (D5/R1). NULL on a grouped parent. */
  reference: Macros | null;
  /**
   * WHAT THIS ROW CONTRIBUTES, CHILDREN INCLUDED. Derived, never stored (D9).
   *
   * A leaf scales its own frozen reference. A grouped parent has no reference
   * to scale, so this is the sum of its children — which is the figure the
   * journal row must show, and the only one a reader would accept beside a
   * meal's sub-total.
   *
   * Summing the `total` of the rows readMealEntries hands back therefore gives
   * the meal, with no clause and no risk of counting a block twice: the
   * children are nested inside their parent rather than sitting beside it.
   */
  total: Macros | null;
  /**
   * The ingredient lines of a grouped recipe block (D5/R2). Empty for a leaf.
   *
   * Nested rather than returned flat, which is the whole difference: before
   * slice 6 a block would have rendered as a parent followed by its
   * ingredients at the same level as every other entry of the meal.
   */
  children: JournalEntryView[];
}

/**
 * One entry with its ingredient lines, for the screen that edits it. Null once
 * it has been deleted.
 *
 * The children are fetched too, because a grouped recipe parent is not a row
 * that can be read on its own: its macros are NULL and its figure is the sum
 * of the lines below it (D5/R2).
 */
export function readEntry(db: AppDatabase, entryId: JournalEntryId): JournalEntryView | null {
  const rows = selectEntries(
    db,
    or(eq(journalEntry.id, entryId), eq(journalEntry.parentEntryId, entryId)),
  );
  return rows.find((row) => row.id === entryId) ?? null;
}

/**
 * The entries of one meal, loaded only when that meal is unfolded.
 *
 * TOP-LEVEL ROWS ONLY, each carrying its own children. Before slice 6 this was
 * flat and a grouped block would have rendered as a parent followed by its
 * ingredients at the same level as every other entry of the meal.
 */
export function readMealEntries(db: AppDatabase, mealId: DayMealId): JournalEntryView[] {
  return selectEntries(db, eq(journalEntry.dayMealId, mealId));
}

/**
 * Reads rows and nests them.
 *
 * ONE QUERY, not one per block: the parents and the children of a meal come
 * back together and the tree is built in memory. A meal holds a handful of
 * rows, and a query per block would be a read multiplied by something the user
 * controls.
 *
 * A child whose parent is not in the result set is promoted to the top level
 * rather than dropped. That cannot happen for a whole meal — the cascade on
 * parent_entry_id means an orphan cannot exist — but silently swallowing a row
 * that carries macros is the one outcome worth refusing outright: the meal's
 * sub-total comes from SQL and would then disagree with the rows shown under
 * it, which is a visible wrong number with no visible cause.
 */
function selectEntries(db: AppDatabase, where: SQL | undefined): JournalEntryView[] {
  const rows = db
    .select({
      id: journalEntry.id,
      parentEntryId: journalEntry.parentEntryId,
      kind: journalEntry.kind,
      name: journalEntry.name,
      brand: journalEntry.brand,
      baseUnit: journalEntry.baseUnit,
      quantity: journalEntry.quantity,
      sourceFoodId: journalEntry.sourceFoodId,
      sourceRecipeId: journalEntry.sourceRecipeId,
      portionName: journalEntry.portionName,
      portionQuantity: journalEntry.portionQuantity,
      protein100: journalEntry.protein100,
      carbs100: journalEntry.carbs100,
      fat100: journalEntry.fat100,
      kcal100: journalEntry.kcal100,
    })
    .from(journalEntry)
    .where(where)
    .orderBy(asc(journalEntry.position), asc(journalEntry.id))
    .all();

  const views = rows.map((row) => {
    // Destructured so the null checks actually narrow: a boolean computed
    // ahead of time tells TypeScript nothing about the properties it read.
    const { protein100, carbs100, fat100, kcal100 } = row;

    // All four or none. A grouped recipe parent carries no macros at all
    // (D5/R2), and a partial set would be a reference nobody could scale.
    const reference: Macros | null =
      protein100 !== null && carbs100 !== null && fat100 !== null && kcal100 !== null
        ? { protein: protein100, carbs: carbs100, fat: fat100, kcal: kcal100 }
        : null;

    const view: JournalEntryView = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      brand: row.brand,
      baseUnit: row.baseUnit,
      quantity: row.quantity,
      sourceFoodId: row.sourceFoodId,
      sourceRecipeId: row.sourceRecipeId,
      portionName: row.portionName,
      portionQuantity: row.portionQuantity,
      reference,
      total:
        reference === null || row.quantity === null ? null : totalOf(reference, row.quantity),
      children: [],
    };

    return { view, parentEntryId: row.parentEntryId };
  });

  const byId = new Map(views.map((entry) => [entry.view.id, entry.view]));
  const top: JournalEntryView[] = [];

  for (const { view, parentEntryId } of views) {
    const parent = parentEntryId === null ? undefined : byId.get(parentEntryId);
    if (parent === undefined) {
      top.push(view);
    } else {
      parent.children.push(view);
    }
  }

  // The parent's figure, once its children are in: it has no reference of its
  // own to scale, so this is the only total it can state — and it is what the
  // journal row shows beside the meal's sub-total.
  for (const view of top) {
    if (view.children.length === 0) continue;
    view.total = sumMacros(
      view.children.map((child) => child.total ?? ZERO_MACROS),
    );
  }

  return top;
}

export interface RecentMeal {
  mealId: DayMealId;
  date: LocalDate;
  name: string;
  entryCount: number;
  /** What the meal came to, derived here and never stored (D9). */
  kcal: number;
}

/**
 * Meals logged recently, for the quick-access screen (specs 8.4a).
 *
 * > Meals: recent ones. Selecting a recent meal adds all of its entries at once
 * > to the target meal.
 *
 * ## WHAT A "RECENT MEAL" IS, WHICH 8.4a DOES NOT SAY
 *
 * A CONCRETE PAST MEAL — "Déjeuner, 15 septembre, 4 lignes" — and not a
 * grouping of meals that share a name. The specs give no window, no identity
 * and no deduplication rule, and grouping by name would need one: deciding
 * when two "Déjeuner" are the same meal is a question nobody has asked, and
 * every answer would be invented. A past meal is unambiguous and needs none.
 *
 * Only meals holding at least one entry appear: an empty meal is a row in a
 * template, not something that was eaten.
 *
 * Ordered by when the entries were WRITTEN, not by the day they belong to —
 * the rule slice 3 settled for foods, for the same reason: logging yesterday's
 * dinner this morning makes it the most recent thing you did. Both terms are
 * aggregated, and max(id) is both the tie-break and the fallback, ULIDs
 * sorting by creation time and created_at being nullable in the frozen schema.
 */
export function readRecentMeals(db: AppDatabase, limit = 10): RecentMeal[] {
  return db
    .select({
      mealId: dayMeal.id,
      date: dayMeal.date,
      name: dayMeal.name,
      entryCount: sql<number>`count(${journalEntry.id})`,
      kcal: sql<number | null>`sum(${journalEntry.quantity} * ${journalEntry.kcal100} / 100.0)`,
    })
    .from(dayMeal)
    .innerJoin(journalEntry, eq(journalEntry.dayMealId, dayMeal.id))
    .groupBy(dayMeal.id)
    .orderBy(
      sql`max(${journalEntry.createdAt}) desc`,
      sql`max(${journalEntry.id}) desc`,
    )
    .limit(limit)
    .all()
    .map((row) => ({
      mealId: row.mealId,
      date: row.date,
      name: row.name,
      entryCount: row.entryCount,
      kcal: row.kcal ?? 0,
    }));
}

/**
 * Every entry of a meal, in the raw columns a replay needs (specs 8.4a).
 *
 * Deliberately NOT JournalEntryView: that shape is built for display and drops
 * the tree — parent_entry_id, kind, the frozen reference as stored. Replaying
 * a meal needs the rows as they are.
 */
export interface ReplayableEntry {
  id: JournalEntryId;
  parentEntryId: JournalEntryId | null;
  position: number;
  kind: JournalEntryKind;
  sourceFoodId: FoodId | null;
  /**
   * CARRIED, where slice 5 did not carry it — and it was not an oversight so
   * much as a column with no user yet. Replaying a meal that holds a grouped
   * block would otherwise produce a correct block that no longer knows which
   * recipe it came from, and nothing on screen would say so.
   */
  sourceRecipeId: RecipeId | null;
  name: string;
  brand: string | null;
  baseUnit: BaseUnit | null;
  quantity: number | null;
  portionName: string | null;
  portionQuantity: number | null;
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  kcal100: number | null;
}

export function readEntriesForReplay(db: AppDatabase, mealId: DayMealId): ReplayableEntry[] {
  return db
    .select({
      id: journalEntry.id,
      parentEntryId: journalEntry.parentEntryId,
      position: journalEntry.position,
      kind: journalEntry.kind,
      sourceFoodId: journalEntry.sourceFoodId,
      sourceRecipeId: journalEntry.sourceRecipeId,
      name: journalEntry.name,
      brand: journalEntry.brand,
      baseUnit: journalEntry.baseUnit,
      quantity: journalEntry.quantity,
      portionName: journalEntry.portionName,
      portionQuantity: journalEntry.portionQuantity,
      protein100: journalEntry.protein100,
      carbs100: journalEntry.carbs100,
      fat100: journalEntry.fat100,
      kcal100: journalEntry.kcal100,
    })
    .from(journalEntry)
    .where(eq(journalEntry.dayMealId, mealId))
    // Parents before children, so a replay can map old identifiers to new ones
    // in a single pass.
    .orderBy(asc(journalEntry.parentEntryId), asc(journalEntry.position), asc(journalEntry.id))
    .all();
}
