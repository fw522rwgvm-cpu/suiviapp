import { eq, sql } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import { weightGoal, weightMeasure, type WeightGoalId } from '@/core/db/schema';
import type { WeightGoalDraft } from '../domain/weight-goal';

/**
 * Writes to the weight tables (specs 9.1, 9.2).
 *
 * Transactional functions carrying the rules, as since slice 1. Nothing here
 * imports a native module — the database arrives as a parameter, typed
 * AppDatabase — so every one of these runs against a real SQLite file in Node
 * (D15).
 *
 * Nothing enumerates a query to invalidate either: a write touches
 * weight_measure or weight_goal, SQLite reports it, and the bus invalidates
 * whatever declared reading that table (D8).
 */

/**
 * Records a weight, replacing any measurement already on that date.
 *
 * > Une mesure au plus par date. Une nouvelle saisie sur une date déjà
 * > renseignée écrase la précédente, après confirmation. (Specs 9.1)
 *
 * ## THE REPLACEMENT IS THE PRIMARY KEY, NOT A RULE APPLIED HERE
 *
 * There is no read-then-branch, and no "does one exist already" anywhere in
 * this layer. `date` is the primary key, so a second measurement has nowhere
 * else to go: ON CONFLICT is not a convenience, it is the only expressible
 * outcome. Nothing can forget to check.
 *
 * The confirmation specs 9.1 asks for is a SCREEN decision, not a write one —
 * and deliberately so. The write has to stay idempotent for the seed, for the
 * import, and for a correction made from the history; asking it to refuse an
 * overwrite would make every one of those callers ask to be excused.
 *
 * ## created_at SURVIVES THE OVERWRITE, updated_at MOVES
 *
 * Correcting this morning's weight does not make it a new measurement — it is
 * the same weighing, typed better. Keeping the original created_at is what lets
 * a history ever say when a date was first recorded, and it costs nothing to
 * preserve: `excluded` only overwrites the columns named.
 *
 * One statement, so no explicit transaction: SQLite already wraps a lone
 * statement in one, and the rule about multi-row operations is about operations
 * touching more than one row.
 */
export function setWeight(
  db: AppDatabase,
  date: LocalDate,
  valueKg: number,
  now: number = Date.now(),
): void {
  db.insert(weightMeasure)
    .values({ date, valueKg, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: weightMeasure.date,
      set: { valueKg, updatedAt: now },
    })
    .run();
}

/**
 * Removes a measurement (specs 9.1: "édition et suppression de n'importe quelle
 * mesure").
 *
 * No confirmation is owed here and none is asked for. The rule established in
 * slice 4 — two gestures rather than a dialogue — covers a swipe; and specs 5.3
 * reserves the warning for a deletion that destroys something, which this does
 * not: nothing else in the database points at a measurement.
 */
export function deleteWeight(db: AppDatabase, date: LocalDate): void {
  db.delete(weightMeasure).where(eq(weightMeasure.date, date)).run();
}

/**
 * Sets the active goal, retiring whatever was active before.
 *
 * ## TWO STATEMENTS, SO ONE TRANSACTION, AND THE ORDER IS FORCED
 *
 * ux_weight_goal_active admits exactly one row with is_active = 1, so the old
 * goal must be deactivated BEFORE the new one is inserted — the reverse order
 * fails on the index. That is not a limitation to work around: it is the
 * constraint doing its job, and it is pinned by a test in replay-weight so the
 * ordering is a tested fact rather than something this function happens to get
 * right.
 *
 * Explicitly transactional because it touches more than one row (the rule since
 * slice 1). A forced quit between the two would otherwise leave the user with
 * NO active goal at all — the old one retired, the new one never written — and
 * nothing on screen to explain where it went.
 *
 * ## THE OLD GOAL IS RETIRED, NEVER DELETED
 *
 * Specs 6.2 lists "modifiable, désactivable, supprimable" as three different
 * actions, so they leave three different traces. A goal that was replaced is
 * not a goal that was deleted, and defined_at keeps saying when each was set.
 */
export function setActiveGoal(
  db: AppDatabase,
  draft: WeightGoalDraft & { targetKg: number },
  now: number = Date.now(),
): WeightGoalId {
  const id = newId<WeightGoalId>();

  db.transaction((tx) => {
    deactivateGoal(tx);

    tx.insert(weightGoal)
      .values({
        id,
        targetKg: draft.targetKg,
        mode: draft.mode,
        // Exactly one of the two, which ck_weight_goal_terms also insists on:
        // the derived half is never stored (D9).
        targetDate: draft.mode === 'target_date' ? draft.targetDate : null,
        rateKgPerWeek: draft.mode === 'rate' ? draft.rateKgPerWeek : null,
        definedAt: now,
        isActive: 1,
      })
      .run();
  });

  return id;
}

/**
 * Switches off whatever goal is active, leaving the row in place.
 *
 * Specs 9.2: "Modifiable et désactivable depuis les Réglages." Deactivating is
 * not deleting, which is why this is an UPDATE: the target, the mode and the
 * date it was set stay readable, and turning the goal back on is a decision
 * rather than a re-entry.
 *
 * Written against `is_active = 1` rather than against an id, because the index
 * guarantees there is at most one — asking the caller which one to retire would
 * be asking a question with one possible answer.
 */
export function deactivateGoal(db: AppDatabase): void {
  db.update(weightGoal)
    .set({ isActive: 0 })
    .where(eq(weightGoal.isActive, 1))
    .run();
}

/**
 * Turns a retired goal back on, retiring any other first.
 *
 * Same two statements and the same forced order as setActiveGoal, for the same
 * reason — and the same transaction, so a forced quit cannot leave none active.
 */
export function reactivateGoal(db: AppDatabase, id: WeightGoalId): void {
  db.transaction((tx) => {
    deactivateGoal(tx);
    tx.update(weightGoal).set({ isActive: 1 }).where(eq(weightGoal.id, id)).run();
  });
}

/**
 * Deletes a goal outright (specs 6.2: "supprimable").
 *
 * Nothing references a goal, so there is nothing to cascade and nothing to
 * freeze: unlike deleting a food, this costs the history exactly nothing. That
 * is why it needs no warning under specs 5.3, which reserves one for a deletion
 * that destroys something.
 */
export function deleteGoal(db: AppDatabase, id: WeightGoalId): void {
  db.delete(weightGoal).where(eq(weightGoal.id, id)).run();
}

/**
 * Removes every measurement in a closed date range.
 *
 * Exists for the import and the tests, never for a screen: specs 9.1 offers the
 * deletion of a measurement, never of a span. Kept here rather than written
 * inline in a test so that the one place that knows how to empty this table is
 * the write layer.
 */
export function deleteWeightsBetween(
  db: AppDatabase,
  from: LocalDate,
  to: LocalDate,
): void {
  db.delete(weightMeasure)
    .where(sql`${weightMeasure.date} BETWEEN ${from} AND ${to}`)
    .run();
}
