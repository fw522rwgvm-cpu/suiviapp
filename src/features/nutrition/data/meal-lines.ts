import type { AppDatabase } from '@/core/db/database';
import type { DayMealId, RecipeId } from '@/core/db/schema';
import type { Macros } from '../domain/macros';
import type { PendingEntry } from '../domain/pending-entry';
import type { OccurrenceLine } from '../domain/recipe-occurrence';
import { readEntriesForReplay, type ReplayableEntry } from './day-reads';
import { readFood } from './food-reads';

/**
 * A past meal, turned into the lines that will be staged (specs 8.4a).
 *
 * ## IT EXPANDS AT PICK TIME NOW, NOT AT WRITE TIME
 *
 * Two designs came before this one, and both are worth naming because the
 * third only makes sense against them.
 *
 * First, a recent meal wrote directly and closed the panel — one gesture, one
 * transaction, no basket. Then it became a single basket line carrying the
 * source meal's identifier, replayed inside the write transaction, so it could
 * be combined with other lines and removed before landing.
 *
 * It is now N lines, one per top-level entry, resolved HERE. The difference
 * that matters is not the timing but what the user can do: a meal that arrives
 * as four lines can have one of them removed, or corrected, before anything is
 * written. As one line it was all or nothing.
 *
 * The cost is stated plainly: the macros are read a few seconds earlier than
 * they used to be — at the tap rather than at "Confirmer". Specs 14.6 n° 6
 * asks for the values the foods carry TODAY rather than the frozen capsule,
 * and a few seconds is not the distinction it is drawing. What it buys back is
 * the basket's own promise, that a line shows exactly what it will write.
 *
 * ## THE THREE FALLBACKS OF SPECS 14.6 n° 7 SURVIVE THE MOVE
 *
 * A free entry, a food deleted since, and a food whose base unit has changed
 * all replay from their capsule rather than from a food. The rule is the same
 * one and so is its reasoning; only its carrier moved.
 */

/** The frozen columns a replayed line writes verbatim. */
interface Reference {
  name: string;
  brand: string | null;
  reference: Macros;
}

/**
 * The food as it reads today, or the old capsule when it cannot be read.
 *
 * MOVED HERE FROM THE WRITE LAYER, where it was a private step of the replay.
 * It never wrote anything — it answers "what does this food say now" — so a
 * read is where it belonged all along, and the expansion is now its only
 * caller.
 *
 * > Trois lignes repartent de leur capsule, et chacune pour sa propre raison :
 * > une saisie libre n'a jamais eu d'aliment à relire, ses macros SONT le
 * > choix ; un aliment supprimé ne se lit pas, et le §5.3 dit que sa
 * > suppression laisse les entrées passées intactes ; une unité de base
 * > changée apparierait des macros pour 100 ml avec une quantité comptée en
 * > grammes — un chiffre faux et parfaitement plausible.
 */
function refreshed(db: AppDatabase, entry: ReplayableEntry): Reference | null {
  const capsule =
    entry.protein100 !== null &&
    entry.carbs100 !== null &&
    entry.fat100 !== null &&
    entry.kcal100 !== null
      ? {
          name: entry.name,
          brand: entry.brand,
          reference: {
            protein: entry.protein100,
            carbs: entry.carbs100,
            fat: entry.fat100,
            kcal: entry.kcal100,
          },
        }
      : null;

  if (entry.kind !== 'food' || entry.sourceFoodId === null) return capsule;

  const food = readFood(db, entry.sourceFoodId);
  if (food === null) return capsule;
  // Matching units or nothing: per-100-ml macros against a quantity counted in
  // grams is a figure that is wrong and entirely plausible.
  if (food.baseUnit !== entry.baseUnit) return capsule;

  return { name: food.name, brand: food.brand, reference: food.reference };
}

/**
 * One entry as a staged line, ready to be written verbatim.
 *
 * Null for a row that carries no quantity or no macros — a grouped parent,
 * which is handled by its block rather than on its own.
 */
function toReplayLine(db: AppDatabase, entry: ReplayableEntry): PendingEntry | null {
  if (entry.quantity === null) return null;

  const source = refreshed(db, entry);
  if (source === null) return null;

  return {
    kind: 'replay',
    // 'free' keeps its kind so the journal row still declines to show a
    // quantity nobody typed; everything else lands as a food line.
    entryKind: entry.kind === 'free' ? 'free' : 'food',
    sourceFoodId: entry.sourceFoodId,
    name: source.name,
    brand: source.brand,
    baseUnit: entry.baseUnit,
    quantity: entry.quantity,
    portionName: entry.portionName,
    portionQuantity: entry.portionQuantity,
    reference: source.reference,
  };
}

/** An ingredient row of a block, as the occurrence line it will be written as. */
function toOccurrenceLine(entry: ReplayableEntry): OccurrenceLine | null {
  if (
    entry.quantity === null ||
    entry.baseUnit === null ||
    entry.protein100 === null ||
    entry.carbs100 === null ||
    entry.fat100 === null ||
    entry.kcal100 === null
  ) {
    return null;
  }

  return {
    sourceFoodId: entry.sourceFoodId,
    name: entry.name,
    baseUnit: entry.baseUnit,
    quantity: entry.quantity,
    reference: {
      protein: entry.protein100,
      carbs: entry.carbs100,
      fat: entry.fat100,
      kcal: entry.kcal100,
    },
  };
}

/**
 * Every top-level line of a past meal, as basket lines.
 *
 * A grouped recipe block stays ONE line: it is one of the things that were
 * chosen, and "each food individually" means the meal's own lines rather than
 * the ingredients of a recipe inside it — which were never chosen one by one.
 *
 * A block that cannot be rebuilt as a block falls back to its children as
 * ordinary lines rather than being dropped. It takes a hand-repaired archive
 * to reach — the recipe link or the consumed amount would have to be missing —
 * and losing the calories silently is the one outcome worth refusing outright.
 */
export function readMealLines(db: AppDatabase, mealId: DayMealId): PendingEntry[] {
  const entries = readEntriesForReplay(db, mealId);
  const children = new Map<string, ReplayableEntry[]>();

  for (const entry of entries) {
    if (entry.parentEntryId === null) continue;
    const existing = children.get(entry.parentEntryId);
    if (existing === undefined) children.set(entry.parentEntryId, [entry]);
    else existing.push(entry);
  }

  const lines: PendingEntry[] = [];

  for (const entry of entries) {
    if (entry.parentEntryId !== null) continue;

    const block = children.get(entry.id) ?? [];
    if (entry.kind === 'recipe') {
      const occurrence = block
        .map(toOccurrenceLine)
        .filter((line): line is OccurrenceLine => line !== null);

      const recipeId = entry.sourceRecipeId;
      if (recipeId !== null && entry.quantity !== null && occurrence.length > 0) {
        lines.push({
          kind: 'recipe',
          recipeId: recipeId as RecipeId,
          name: entry.name,
          // The two yields land in different columns, and reading them back is
          // how the block says which it was — the recipe may have changed its
          // yield since, or be gone.
          yieldType: entry.portionName !== null ? 'portions' : 'weight',
          consumed: entry.quantity,
          lines: occurrence,
        });
        continue;
      }

      // Unrebuildable: its children go in as ordinary lines so nothing is lost.
      for (const child of block) {
        const line = toReplayLine(db, child);
        if (line !== null) lines.push(line);
      }
      continue;
    }

    const line = toReplayLine(db, entry);
    if (line !== null) lines.push(line);
  }

  return lines;
}
