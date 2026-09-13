import { eq, sql } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  day,
  dayMeal,
  food,
  journalEntry,
  type BaseUnit,
  type DayMealId,
  type FoodId,
  type JournalEntryId,
  type JournalEntryKind,
  type RecipeId,
  type YieldType,
} from '@/core/db/schema';
import { newId } from '@/core/id';
import { readDayPlan } from './planning-reads';
import { canUseKind, isMealKind, type MealKind } from '../domain/meal-kinds';
import type { Macros } from '../domain/macros';
import type { QuantityChoice } from '../domain/portions';
import {
  RECIPE_PORTION_NAME,
  usableLines,
  type OccurrenceLine,
} from '../domain/recipe-occurrence';
import type { CompleteOffProduct } from '../off/off-product';
import { readEntriesForReplay } from './day-reads';
import { readFood } from './food-reads';
import { findFoodByBarcode } from './food-writes';

/**
 * Writes to the journal (D8).
 *
 * > Reads are hooks. Writes are transactional functions carrying the business
 * > rules.
 *
 * What this layer is for is not swapping databases out — nobody swaps
 * databases out. It is for making the invariants unavoidable: materialising a
 * day, freezing, the deletion transaction. If a screen can write to the tables
 * directly, one day it will, and it will forget a rule.
 *
 * Nothing here imports a native module, so all of it runs against a real
 * SQLite file in Node (D15).
 */

/** A free entry is 100 units of a virtual food (D5/R2, schema 2.3). */
const FREE_ENTRY_QUANTITY = 100;
const FREE_ENTRY_UNIT = 'g';

/**
 * Specs 8.4d describes free entry as "P / G / L / kcal directly" and gives it
 * no name, while the column is NOT NULL. Rather than charge a mandatory field
 * to the fastest path in the application, the name is optional and falls back
 * to this — nought extra taps, and the row is still identifiable in the list.
 */
export const FREE_ENTRY_DEFAULT_NAME = 'Saisie libre';

interface MealRef {
  id: DayMealId;
  position: number;
}

/**
 * Copies an Open Food Facts product into the personal database, or finds the
 * one already there (specs 8.5).
 *
 * > Automatic copy into the personal database: EVERY product added to the
 * > journal is systematically copied into the personal database, barcode and
 * > origin kept.
 *
 * ## DELIBERATELY NOT EXPORTED, for the same reason as ensureMaterialized
 *
 * The copy happens at "Confirmer" and nowhere else, inside the transaction
 * that writes the entries. A product CHOSEN but not confirmed must not exist
 * in the library: scanning three things in an aisle, removing one from the
 * basket by swipe and then closing the panel would otherwise leave foods
 * nobody validated behind — data created by browsing, which is exactly what
 * specs 8.2 forbids for days and what keeping ensureMaterialized private
 * defends there.
 *
 * The rule the two share, stated once: WHAT THE USER EXPLICITLY SAVES IS
 * WRITTEN; WHAT THEY MERELY CHOOSE IS NOT. The pre-filled form of specs 8.5
 * writes before confirmation and is not an exception to it — someone filled a
 * form in and pressed Enregistrer.
 *
 * ## IT NEVER OVERWRITES AN EXISTING FOOD
 *
 * Found by barcode, returned as it stands. A food copied from Open Food Facts
 * is freely correctable and that correction is "the main mechanism for
 * compensating for the uneven quality of the source" (specs 8.5); re-copying
 * over it on the next scan would undo the correction silently, on the path the
 * user least expects it. So this is get-or-create, never insert-or-replace.
 *
 * It is reached at all only in the rare cases the deduplication misses — two
 * lines for the same new product in one basket, or a library list cached a
 * moment before the copy. Which is precisely why it must be safe.
 */
function ensureOffFood(tx: AppDatabase, product: CompleteOffProduct, now: number): FoodId {
  const existing = findFoodByBarcode(tx, product.barcode);
  if (existing !== null) return existing;

  const id = newId<FoodId>();

  tx.insert(food)
    .values({
      id,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      source: 'off',
      /**
       * ALWAYS GRAMS, with no heuristic and no density.
       *
       * Open Food Facts publishes `_100g` values for everything it holds,
       * liquids included — that is literally what it measures. Reading them as
       * "per 100 ml" for a drink would be applying a density of 1, and specs
       * 5.1 makes the units watertight: "no conversion, no density". Guessing
       * from a "1 L" label would be the same conversion with a guess in front
       * of it.
       *
       * A user who wants millilitres corrects the food, which is exactly the
       * free correctability specs 8.5 provides for.
       */
      baseUnit: 'g',
      protein100: product.protein100,
      carbs100: product.carbs100,
      fat100: product.fat100,
      /** Kept as given, never recomputed from P/C/F (specs 5.1). */
      kcal100: product.kcal100,
      // Open Food Facts publishes per 100, so the canonical form IS the
      // display preference here. No conversion on this path at all.
      displayRefQty: 100,
      isFavorite: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/**
 * Materialises a day if it is not already, and hands back its meals.
 *
 * Deliberately NOT exported. Specs 8.2 materialises a day at the user's first
 * action concerning it, and 8.2 again forbids navigation from ever doing so.
 * If this were callable on its own, a forced quit between the call and the
 * action that justified it would leave an empty materialised day behind —
 * which is data created by consultation, exactly what the rule excludes. So it
 * is the first statement of the writes that need it, inside their transaction,
 * and it exists nowhere else.
 *
 * ## THE SNAPSHOT IS TAKEN HERE, INSIDE THE TRANSACTION (D5/R4, specs 8.2)
 *
 * The planning is resolved on this line and frozen on the next, with nothing
 * able to slip between the two. Resolving it earlier — in the screen, or in a
 * read the caller made before deciding to write — would let a template edited
 * in between produce a day whose meals came from one version and whose
 * template_name_snapshot named another.
 *
 * The meals come from the same function that renders a virtual day, so what
 * the user saw is what they get. Both snapshot columns stay NULL when the
 * planning designates nothing, which is the truthful record rather than a gap:
 * no template applied.
 *
 * From this moment the day is deaf to the planning for ever (specs 8.1). That
 * includes a day prepared in the future: 8.2 makes a filled-in future day
 * insensitive to later planning changes, and it gets there by being
 * materialised rather than by being in the future.
 */
function ensureMaterialized(tx: AppDatabase, date: LocalDate): MealRef[] {
  const existing = tx.select({ date: day.date }).from(day).where(eq(day.date, date)).all();

  if (existing.length === 0) {
    const plan = readDayPlan(tx, date);
    const rows = plan.meals.map((meal) => ({
      id: newId<DayMealId>(),
      date,
      position: meal.position,
      name: meal.name,
      targetProtein: meal.targets?.protein ?? null,
      targetCarbs: meal.targets?.carbs ?? null,
      targetFat: meal.targets?.fat ?? null,
      targetKcal: meal.targets?.kcal ?? null,
    }));

    tx.insert(day)
      .values({
        date,
        templateIdSnapshot: plan.templateId,
        templateNameSnapshot: plan.templateName,
        materializedAt: Date.now(),
      })
      .run();
    // A template holding no meal is legitimate, and Drizzle refuses an empty
    // VALUES list. The day row is what says the day exists, not its meals.
    if (rows.length > 0) {
      tx.insert(dayMeal).values(rows).run();
    }

    return rows.map(({ id, position }) => ({ id, position }));
  }

  // An already materialised day can legitimately hold no meal at all: the user
  // is free to delete every one of them (specs 8.3). Its day row, not its meal
  // count, is what says it exists.
  return tx
    .select({ id: dayMeal.id, position: dayMeal.position })
    .from(dayMeal)
    .where(eq(dayMeal.date, date))
    .orderBy(dayMeal.position)
    .all();
}

/**
 * A position the screen offered but the day does not hold is a caller bug, not
 * an expected failure, so it throws rather than returning a value: conventions
 * section 4 reserves return values for failures that are part of the domain,
 * and throwing here rolls the transaction back, undoing a materialisation that
 * no longer has an action to justify it.
 */
function requireMeal(meals: readonly MealRef[], position: number): MealRef {
  const meal = meals.find((candidate) => candidate.position === position);
  if (meal === undefined) {
    throw new Error(`No meal at position ${position} on this day`);
  }
  return meal;
}

function nextPosition(tx: AppDatabase, mealId: DayMealId): number {
  const rows = tx
    .select({ highest: sql<number | null>`max(${journalEntry.position})` })
    .from(journalEntry)
    .where(eq(journalEntry.dayMealId, mealId))
    .all();
  return (rows[0]?.highest ?? -1) + 1;
}

export interface AddFreeEntryInput {
  date: LocalDate;
  /** Meals are addressed by position: on a virtual day they have no id yet. */
  mealPosition: number;
  name?: string;
  /** The values typed in, which are also the macros for 100 (D5/R2). */
  macros: Macros;
}

export interface AddFoodEntryInput {
  date: LocalDate;
  mealPosition: number;
  foodId: FoodId;
  /** Resolved to base units by the domain before it ever gets here. */
  quantity: QuantityChoice;
}

/**
 * One line about to be written — what the add screen collects before anything
 * is committed (specs 8.4).
 */
export type NewEntry =
  | { kind: 'food'; foodId: FoodId; quantity: QuantityChoice }
  | { kind: 'free'; name?: string; macros: Macros }
  /**
   * A product chosen from Open Food Facts and not yet in the library.
   *
   * It carries the PRODUCT rather than an id, because there is no id: nothing
   * has been written. The copy happens here, in this transaction, at
   * "Confirmer" — see ensureOffFood.
   *
   * Only a COMPLETE product can take this path. One missing any of the four
   * macros is diverted to a pre-filled form by specs 8.5, and comes back
   * through `kind: 'food'` with an id like any other, because by then the user
   * has saved it themselves.
   */
  | { kind: 'off'; product: CompleteOffProduct; quantity: QuantityChoice }
  /**
   * A recipe, as one grouped block (specs 8.6).
   *
   * IT CARRIES THE ADJUSTED LINES RATHER THAN A RECIPE IDENTIFIER TO RE-READ,
   * and that is the whole of specs 8.6 points 2 and 3. The user scaled the
   * recipe to what they ate and then edited the ingredients for this occasion;
   * re-deriving them here would discard exactly that edit, and would mean
   * confirming one set of figures and storing another.
   *
   * It is the opposite arrangement from `food`, where the entry IS built by
   * reading the food back inside the transaction — and the difference is
   * principled: a food entry freezes a REFERENCE that the database holds
   * authoritatively, while an occurrence freezes a DECISION that exists only
   * on the screen that made it.
   */
  | {
      kind: 'recipe';
      recipeId: RecipeId;
      /** The recipe's name, frozen as the user saw it. */
      name: string;
      yieldType: YieldType;
      /** Portions, or grams, matching yieldType. */
      consumed: number;
      lines: readonly OccurrenceLine[];
    };

/**
 * Logs one or more lines into a meal, materialising the day in the same
 * transaction.
 *
 * ## Why a list, and why a single transaction
 *
 * Specs 8.4 lets a meal be assembled before it is committed — several foods
 * and free entries chosen in one visit. Writing them one at a time would let a
 * forced quit land halfway through a meal, and the build context says the
 * application must tolerate being killed at any moment: the certificate expires
 * weekly. Half a meal is worse than none, because none is visibly missing and
 * half is not.
 *
 * So a basket is one transaction, and the rule that every multi-row operation
 * is explicitly transactional is met by construction rather than by care.
 *
 * Rows go in one at a time inside it. Batching them would meet
 * SQLITE_MAX_VARIABLE_NUMBER at twenty columns a row — a limit that differs
 * between SQLite builds, as slice 2 already had to work around — and buys
 * nothing measurable on a handful of lines.
 *
 * ## EVERY ENTRY IS A CLOSED CAPSULE FROM THIS MOMENT ON (D5/R1, specs 5.2)
 *
 * Everything the journal will ever need is copied in now: the name, the brand,
 * the unit, the macros for 100, and — when a portion was used — its name and
 * the size it had today. The food's row is never consulted again. That is what
 * makes editing without a time limit possible (specs 5.3), and what makes
 * deleting the food harmless.
 *
 * source_food_id is written, and is informative only: no foreign key, so the
 * food can be deleted out from under the row without touching it. Its one job
 * is to answer "what was the last quantity for this food" through
 * ix_entry_source_food — the lever on the 15-second target (specs 8.4, D16).
 *
 * The quantity stored is ALWAYS in base units. The portion columns record how
 * it was expressed, never what it amounts to: a total that had to know about
 * portions would need a special case in every aggregation, and the clause-free
 * SUM would stop being right.
 */
export function addEntries(
  db: AppDatabase,
  input: { date: LocalDate; mealPosition: number; entries: readonly NewEntry[] },
): JournalEntryId[] {
  for (const entry of input.entries) {
    if (entry.kind === 'recipe') {
      // Its own shape of quantity: how much of the recipe, not base units. The
      // lines are checked inside the transaction, where dropping the empty
      // ones is part of the write rather than a precondition of it.
      if (!Number.isFinite(entry.consumed) || entry.consumed <= 0) {
        throw new Error('A logged recipe quantity must be positive');
      }
      continue;
    }
    if (
      entry.kind !== 'free' &&
      (!Number.isFinite(entry.quantity.baseQuantity) || entry.quantity.baseQuantity <= 0)
    ) {
      throw new Error('A logged quantity must be a positive number of base units');
    }
  }

  // Nothing to write, and nothing to materialise either: an empty basket must
  // not create a day (specs 8.2).
  if (input.entries.length === 0) return [];

  return db.transaction((tx) => {
    const meal = requireMeal(ensureMaterialized(tx, input.date), input.mealPosition);
    const now = Date.now();
    let position = nextPosition(tx, meal.id);
    const ids: JournalEntryId[] = [];

    for (const entry of input.entries) {
      const id = newId<JournalEntryId>();
      ids.push(id);

      const common = {
        id,
        dayMealId: meal.id,
        date: input.date,
        parentEntryId: null,
        position: position++,
        sourceRecipeId: null,
        createdAt: now,
        updatedAt: now,
      };

      if (entry.kind === 'recipe') {
        /**
         * A GROUPED BLOCK: one empty parent and the lines that carry
         * everything (D5/R2, specs 8.6).
         *
         * The parent's macro columns are ALL NULL, which is what makes the
         * clause-free SUM of readDayTotals right without a filter — double
         * counting is structurally impossible rather than conditionally
         * avoided.
         *
         * Its `quantity` is the one place in this schema where that column is
         * not in base units: it says how much of the RECIPE was eaten, which
         * nothing can derive afterwards (a recipe is a living object and may
         * have changed its yield since). Safe only because the row carries no
         * macros, so nothing ever multiplies it — and a test mutates it and
         * demands that no total moves.
         *
         * The two yields land in different columns and both read naturally: a
         * weight yield in base_unit and quantity, a portions yield in
         * portion_name and quantity. portion_quantity stays NULL, because a
         * portion of a recipe has no size in base units — that is precisely
         * what a portions yield means.
         */
        const lines = usableLines(entry.lines);
        if (lines.length === 0) {
          throw new Error('A recipe block must carry at least one ingredient line');
        }

        const portions = entry.yieldType === 'portions';

        tx.insert(journalEntry)
          .values({
            ...common,
            kind: 'recipe',
            sourceFoodId: null,
            sourceRecipeId: entry.recipeId,
            name: entry.name,
            brand: null,
            baseUnit: portions ? null : 'g',
            quantity: entry.consumed,
            portionName: portions ? RECIPE_PORTION_NAME : null,
            portionQuantity: null,
            protein100: null,
            carbs100: null,
            fat100: null,
            kcal100: null,
          })
          .run();

        // Positions of their own, starting at zero: a child's position orders
        // it within its block and never within the meal, so it must not
        // continue the meal's numbering.
        lines.forEach((line, childPosition) => {
          tx.insert(journalEntry)
            .values({
              id: newId<JournalEntryId>(),
              dayMealId: meal.id,
              date: input.date,
              parentEntryId: id,
              position: childPosition,
              kind: 'recipe_item',
              sourceFoodId: line.sourceFoodId,
              sourceRecipeId: null,
              name: line.name,
              brand: null,
              baseUnit: line.baseUnit,
              quantity: line.quantity,
              portionName: null,
              portionQuantity: null,
              protein100: line.reference.protein,
              carbs100: line.reference.carbs,
              fat100: line.reference.fat,
              /** Kept as given, never recomputed from P/C/F (specs 5.1). */
              kcal100: line.reference.kcal,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        });

        continue;
      }

      if (entry.kind === 'free') {
        const name = (entry.name ?? '').trim();
        tx.insert(journalEntry)
          .values({
            ...common,
            kind: 'free',
            sourceFoodId: null,
            name: name === '' ? FREE_ENTRY_DEFAULT_NAME : name,
            brand: null,
            baseUnit: FREE_ENTRY_UNIT,
            quantity: FREE_ENTRY_QUANTITY,
            portionName: null,
            portionQuantity: null,
            protein100: entry.macros.protein,
            carbs100: entry.macros.carbs,
            fat100: entry.macros.fat,
            kcal100: entry.macros.kcal,
          })
          .run();
        continue;
      }

      /**
       * An Open Food Facts product is copied into the library FIRST, in this
       * same transaction, and then logged exactly like any other food.
       *
       * Doing it here rather than earlier is the whole of the decision: the
       * copy and the journal entry that justifies it land together or not at
       * all. A forced quit between them — which specs 2.2 says can happen at
       * any moment — cannot leave a food nobody asked for, and cannot leave an
       * entry pointing at a food that was never written.
       *
       * From the next line on there is no Open Food Facts case left. The entry
       * is built by reading the food back, so it freezes what was actually
       * stored rather than what arrived over the network, and the two can
       * never disagree.
       */
      const foodId =
        entry.kind === 'off' ? ensureOffFood(tx, entry.product, now) : entry.foodId;

      // Read inside the transaction, so a food deleted between the screen
      // opening and this call rolls the whole basket back rather than leaving
      // a meal half written.
      const source = readFood(tx, foodId);
      if (source === null) {
        throw new Error(`No food ${foodId} to log`);
      }

      const { baseQuantity, portion } = entry.quantity;

      tx.insert(journalEntry)
        .values({
          ...common,
          kind: 'food',
          sourceFoodId: foodId,
          name: source.name,
          brand: source.brand,
          baseUnit: source.baseUnit,
          quantity: baseQuantity,
          portionName: portion?.name ?? null,
          // The size of ONE portion as of today, frozen. Redefining the portion
          // later must not move what was eaten (specs 5.2).
          portionQuantity: portion?.quantity ?? null,
          protein100: source.reference.protein,
          carbs100: source.reference.carbs,
          fat100: source.reference.fat,
          kcal100: source.reference.kcal,
        })
        .run();
    }

    return ids;
  });
}

function onlyId(ids: readonly JournalEntryId[]): JournalEntryId {
  const id = ids[0];
  if (id === undefined) throw new Error('addEntries wrote nothing');
  return id;
}

/**
 * One free entry. A door onto addEntries, kept because most callers — the
 * generator, the tests, the editing path — log exactly one line.
 *
 * The entry freezes the reference and never the total (D5/R1): quantity 100
 * and the macros for 100 are what is stored, and the total is derived. With
 * quantity at exactly 100 the total is the value typed in, through the same
 * expression as every other row.
 */
export function addFreeEntry(db: AppDatabase, input: AddFreeEntryInput): JournalEntryId {
  return onlyId(
    addEntries(db, {
      date: input.date,
      mealPosition: input.mealPosition,
      entries: [{ kind: 'free', name: input.name, macros: input.macros }],
    }),
  );
}

/** One food, through the same door. */
export function addFoodEntry(db: AppDatabase, input: AddFoodEntryInput): JournalEntryId {
  return onlyId(
    addEntries(db, {
      date: input.date,
      mealPosition: input.mealPosition,
      entries: [{ kind: 'food', foodId: input.foodId, quantity: input.quantity }],
    }),
  );
}

/**
 * Changes how much of an already logged food was eaten (specs 5.3, no time
 * limit).
 *
 * DELIBERATELY DOES NOT RE-READ THE FOOD. The capsule stays as it was frozen:
 * correcting "I had 60 g, not 50" must not also silently adopt macros that
 * have been edited since. Only the quantity and the way it was expressed
 * change.
 *
 * One row, one statement, so no explicit transaction — the rule about
 * transactions is about operations touching more than one row.
 */
export function updateFoodEntryQuantity(
  db: AppDatabase,
  entryId: JournalEntryId,
  quantity: QuantityChoice,
): void {
  if (!Number.isFinite(quantity.baseQuantity) || quantity.baseQuantity <= 0) {
    throw new Error('A logged quantity must be a positive number of base units');
  }

  const updated = db
    .update(journalEntry)
    .set({
      quantity: quantity.baseQuantity,
      portionName: quantity.portion?.name ?? null,
      portionQuantity: quantity.portion?.quantity ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(journalEntry.id, entryId))
    .returning({ id: journalEntry.id })
    .all();

  if (updated.length === 0) {
    throw new Error(`No journal entry ${entryId} to update`);
  }
}

export interface UpdateFreeEntryInput {
  entryId: JournalEntryId;
  name?: string;
  macros: Macros;
}

/**
 * Corrects a free entry, without any time limit (specs 5.3).
 *
 * One row, one statement: SQLite already wraps a lone statement in its own
 * transaction, so an explicit one would add ceremony and no guarantee. The
 * rule that every multi-row operation is explicitly transactional is about
 * operations that touch more than one row.
 */
export function updateFreeEntry(db: AppDatabase, input: UpdateFreeEntryInput): void {
  const name = (input.name ?? '').trim();
  const updated = db
    .update(journalEntry)
    .set({
      name: name === '' ? FREE_ENTRY_DEFAULT_NAME : name,
      protein100: input.macros.protein,
      carbs100: input.macros.carbs,
      fat100: input.macros.fat,
      kcal100: input.macros.kcal,
      updatedAt: Date.now(),
    })
    .where(eq(journalEntry.id, input.entryId))
    .returning({ id: journalEntry.id })
    .all();

  if (updated.length === 0) {
    throw new Error(`No journal entry ${input.entryId} to update`);
  }
}

/**
 * Deletes an entry. Its ingredient lines go with it, by cascade, which is what
 * makes deleting a grouped recipe block one statement rather than a loop that
 * can stop halfway (slice 6).
 *
 * Sibling positions are left sparse on purpose: order is read from `position`,
 * and renumbering would rewrite rows nobody asked to touch.
 */
export function deleteEntry(db: AppDatabase, entryId: JournalEntryId): void {
  db.delete(journalEntry).where(eq(journalEntry.id, entryId)).run();
}

/**
 * The names a day already holds, in position order.
 *
 * Read inside the transaction that is about to change one of them, so the
 * uniqueness rule is decided against the day as it will actually be written
 * rather than as some screen last saw it.
 */
function mealNamesOf(tx: AppDatabase, date: LocalDate): string[] {
  return tx
    .select({ name: dayMeal.name })
    .from(dayMeal)
    .where(eq(dayMeal.date, date))
    .orderBy(dayMeal.position)
    .all()
    .map((row) => row.name);
}

/**
 * ONE BREAKFAST, ONE LUNCH, ONE DINNER PER DAY — enforced here and not in SQL.
 *
 * `day_meal` has been frozen since 0001, so no constraint can be added to it
 * without rebuilding the table every journal entry hangs off. A partial unique
 * index could be created — indexes are the one addable part — and is refused
 * anyway: a database in use already holds meals named whatever their owner
 * typed, and an archive certainly can, so the index would fail to build on
 * exactly the data it exists to protect.
 *
 * A caller offering a kind the day already has is a screen bug, not an expected
 * failure: the picker is built from availableKinds and cannot show one. So it
 * throws, which also rolls back a materialisation that no longer has an action
 * to justify it (conventions, section 4).
 */
function requireUsableKind(
  tx: AppDatabase,
  date: LocalDate,
  kind: MealKind,
  index: number,
): void {
  if (!canUseKind(mealNamesOf(tx, date), index, kind)) {
    throw new Error(`${date} already holds a meal named ${kind}`);
  }
}

function requireKind(name: string): MealKind {
  if (!isMealKind(name)) {
    throw new Error(`${name} is not one of the four meal names`);
  }
  return name;
}

/**
 * Changes what a meal IS and what it aims at, in one transaction (specs 8.3).
 *
 * ## THE TWO USED TO BE SEPARATE ACTIONS, AND THAT WAS THE BUG
 *
 * The journal offered "changer de repas" and "modifier les objectifs" as two
 * entries in a long-press menu, backed by two writes. They are one thought —
 * this meal is not what it says, or not aiming where it should — and splitting
 * them made the user choose which half of an edit they wanted before being
 * shown either.
 *
 * Merged, they also become atomic, which they were not. Two writes meant a
 * forced quit between them could leave a meal renamed with its old targets, and
 * specs 2.2 says the application can be killed at any moment.
 *
 * The name is one of the four, and the day may hold only one breakfast, one
 * lunch and one dinner — checked here against the day as it will be written,
 * not as some screen last saw it.
 *
 * Targets are all four or none, and null clears them: that is how a meal goes
 * back to having no goal, and why the argument is a whole Macros rather than
 * four optional numbers.
 */
export function updateMeal(
  db: AppDatabase,
  input: {
    date: LocalDate;
    mealPosition: number;
    name: string;
    targets: Macros | null;
  },
): void {
  const kind = requireKind(input.name);

  db.transaction((tx) => {
    const meals = ensureMaterialized(tx, input.date);
    const meal = requireMeal(meals, input.mealPosition);
    requireUsableKind(tx, input.date, kind, meals.indexOf(meal));

    const { targets } = input;

    tx.update(dayMeal)
      .set({
        name: kind,
        targetProtein: targets?.protein ?? null,
        targetCarbs: targets?.carbs ?? null,
        targetFat: targets?.fat ?? null,
        targetKcal: targets?.kcal ?? null,
      })
      .where(eq(dayMeal.id, meal.id))
      .run();
  });
}

/**
 * Appends a meal, without any effect on the template it came from (specs 8.3).
 *
 * It may carry targets from the start. A meal added to a day that has a plan is
 * otherwise the one meal on it with nothing to aim at, and the banner would sum
 * a day whose parts no longer add up to it — the day's targets being the sum of
 * its meals' (specs 8.1). All four or none, as everywhere else.
 */
export function addMeal(
  db: AppDatabase,
  input: { date: LocalDate; name: string; targets?: Macros | null },
): DayMealId {
  const kind = requireKind(input.name);

  return db.transaction((tx) => {
    const meals = ensureMaterialized(tx, input.date);
    requireUsableKind(tx, input.date, kind, meals.length);

    const id = newId<DayMealId>();
    const position = meals.reduce((highest, meal) => Math.max(highest, meal.position), -1) + 1;
    const targets = input.targets ?? null;

    tx.insert(dayMeal)
      .values({
        id,
        date: input.date,
        position,
        name: kind,
        targetProtein: targets?.protein ?? null,
        targetCarbs: targets?.carbs ?? null,
        targetFat: targets?.fat ?? null,
        targetKcal: targets?.kcal ?? null,
      })
      .run();

    return id;
  });
}

/**
 * Sets or clears the targets of one meal of one day (specs 8.1, 8.3).
 *
 * ## IT CHANGES THE DAY AND NEVER THE TEMPLATE
 *
 * "Adding, renaming and deleting meals is free, WITHOUT IMPACT ON THE SOURCE
 * TEMPLATE, with the targets recalculated" (specs 8.3). This is the same
 * sentence applied to the numbers: a day is a snapshot, editing it edits the
 * snapshot, and the template it came from is not consulted and not written.
 *
 * Null clears all four, which is how a meal goes back to having no goal — and
 * why the argument is a whole Macros or nothing rather than four optional
 * numbers. A meal carrying protein and nothing else would be a target nobody
 * could read.
 */
export function updateMealTargets(
  db: AppDatabase,
  input: { date: LocalDate; mealPosition: number; targets: Macros | null },
): void {
  db.transaction((tx) => {
    const meal = requireMeal(ensureMaterialized(tx, input.date), input.mealPosition);
    const { targets } = input;

    tx.update(dayMeal)
      .set({
        targetProtein: targets?.protein ?? null,
        targetCarbs: targets?.carbs ?? null,
        targetFat: targets?.fat ?? null,
        targetKcal: targets?.kcal ?? null,
      })
      .where(eq(dayMeal.id, meal.id))
      .run();
  });
}

/**
 * Removes a meal and everything logged in it, by cascade.
 *
 * On a virtual day this materialises first, which reads oddly but is what
 * specs 8.2 asks for: removing a meal is listed among the actions that
 * materialise. The day then really does hold three meals rather than four, and
 * stays insensitive to later planning changes.
 */
export function deleteMeal(
  db: AppDatabase,
  input: { date: LocalDate; mealPosition: number },
): void {
  db.transaction((tx) => {
    const meal = requireMeal(ensureMaterialized(tx, input.date), input.mealPosition);
    tx.delete(dayMeal).where(eq(dayMeal.id, meal.id)).run();
  });
}

/**
 * Adds every line of a past meal to another meal, in one transaction
 * (specs 8.4a).
 *
 * > Selecting a recent meal adds all of its entries at once to the target
 * > meal.
 *
 * ## IT REPLAYS THE CHOICES, NOT THE FIGURES
 *
 * The frozen capsule of an old entry is what was eaten THEN. Adding a meal
 * today is an addition today, so each line goes back through the food it came
 * from and freezes what that food says now. The case that settles it: specs
 * 8.5 makes correcting a copied Open Food Facts product "the main mechanism
 * for compensating for the uneven quality of the source" — replaying the
 * capsule would silently re-import the error the user just corrected, on a
 * path built for repeating habits.
 *
 * What always comes from the OLD entry is the QUANTITY and the way it was
 * expressed. That is what "the same meal" means, and it is the same ruling
 * slice 3 made for the pre-filled quantity: the frozen portion size wins, so
 * that a tranche redefined from 25 g to 30 g does not quietly turn a 50 g
 * habit into 60 g.
 *
 * ## THREE LINES DO NOT GO BACK TO A FOOD, AND EACH FOR ITS OWN REASON
 *
 *  - a FREE entry never had one: its macros ARE the choice (D5/R2);
 *  - a food DELETED since cannot be read, and specs 5.3 says deleting a food
 *    leaves past entries intact — making the user lose the line would charge
 *    them for a deletion the specs call free;
 *  - a food whose BASE UNIT has changed since would pair macros per 100 ml
 *    with a quantity counted in grams. Falling back is one condition and it
 *    removes the case entirely; re-reading anyway would be a wrong figure that
 *    looks plausible, which is the only kind that matters.
 *
 * Recipe blocks copy verbatim, parent and children, with the tree rebuilt
 * through an identifier map. They cannot occur before slice 6 — kind is only
 * ever 'food' or 'free' today — and a block is an adjusted composition
 * (specs 8.6), not a reference to re-read.
 */
export function addRecentMeal(
  db: AppDatabase,
  input: { date: LocalDate; mealPosition: number; sourceMealId: DayMealId },
): JournalEntryId[] {
  return db.transaction((tx) => {
    const source = readEntriesForReplay(tx, input.sourceMealId);
    // Nothing to add, and therefore nothing to materialise: an empty meal must
    // not create a day (specs 8.2).
    if (source.length === 0) return [];

    const target = requireMeal(ensureMaterialized(tx, input.date), input.mealPosition);
    const now = Date.now();
    let position = nextPosition(tx, target.id);

    /** Old identifier to new, so a recipe block keeps its shape. */
    const remapped = new Map<JournalEntryId, JournalEntryId>();
    const ids: JournalEntryId[] = [];

    for (const entry of source) {
      const id = newId<JournalEntryId>();
      remapped.set(entry.id, id);
      ids.push(id);

      // A child whose parent is not in this meal would point outside it; the
      // query returns a whole meal, so this only guards the impossible.
      const parentEntryId =
        entry.parentEntryId === null ? null : (remapped.get(entry.parentEntryId) ?? null);

      const refreshed = refreshedReference(tx, entry);

      tx.insert(journalEntry)
        .values({
          id,
          dayMealId: target.id,
          date: input.date,
          parentEntryId,
          position: position++,
          kind: entry.kind,
          sourceFoodId: entry.sourceFoodId,
          // Carried, where slice 5 wrote a hard null: a replayed block that no
          // longer knew its recipe would be correct and silently anonymous.
          sourceRecipeId: entry.sourceRecipeId,
          name: refreshed.name,
          brand: refreshed.brand,
          baseUnit: entry.baseUnit,
          quantity: entry.quantity,
          portionName: entry.portionName,
          portionQuantity: entry.portionQuantity,
          protein100: refreshed.protein100,
          carbs100: refreshed.carbs100,
          fat100: refreshed.fat100,
          kcal100: refreshed.kcal100,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return ids;
  });
}

interface FrozenReference {
  name: string;
  brand: string | null;
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  kcal100: number | null;
}

/** The food as it reads today, or the old capsule when it cannot be read. */
function refreshedReference(
  tx: AppDatabase,
  entry: {
    kind: JournalEntryKind;
    sourceFoodId: FoodId | null;
    baseUnit: BaseUnit | null;
    name: string;
    brand: string | null;
    protein100: number | null;
    carbs100: number | null;
    fat100: number | null;
    kcal100: number | null;
  },
): FrozenReference {
  const capsule: FrozenReference = {
    name: entry.name,
    brand: entry.brand,
    protein100: entry.protein100,
    carbs100: entry.carbs100,
    fat100: entry.fat100,
    kcal100: entry.kcal100,
  };

  if (entry.kind !== 'food' || entry.sourceFoodId === null) return capsule;

  const food = readFood(tx, entry.sourceFoodId);
  if (food === null) return capsule;
  // See the note above: matching units or nothing.
  if (food.baseUnit !== entry.baseUnit) return capsule;

  return {
    name: food.name,
    brand: food.brand,
    protein100: food.reference.protein,
    carbs100: food.reference.carbs,
    fat100: food.reference.fat,
    kcal100: food.reference.kcal,
  };
}
