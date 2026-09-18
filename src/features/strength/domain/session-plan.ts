import type { ExerciseId, SetType } from '@/core/db/schema';

/**
 * The snapshot a session takes of a routine when it starts (specs 5.2, 10.3).
 *
 * Pure: it turns what was read from the routine into what will be written as
 * the session, and nothing in between touches a database.
 *
 * ## WHY THIS IS A COPY AND NOT A REFERENCE
 *
 * > Une séance de musculation est un snapshot de la routine au démarrage.
 *
 * So editing a routine next week must not move a workout already performed, and
 * deleting it must not erase one. session.routine_id survives as information
 * with no live link, exactly as day.template_id_snapshot and
 * journal_entry.source_food_id do.
 *
 * ## AND WHY IT IS A STRAIGHT COPY RATHER THAN A RE-ORDERING
 *
 * This module is nine lines of mapping, and it is worth saying why it is not
 * more. Slice 10 first stored a superset grouped by exercise — A,A,A then
 * B,B,B — and defended it with "la routine est une liste à LIRE, c'est la
 * séance qui décidera de l'ordre d'exécution". That was reversed on 17/09
 * (architecture 9.18 no 1): routine_line.position IS the execution order, and
 * set_index is the round number.
 *
 * The payoff lands here. Had the routine stored a reading order, this function
 * would have had to re-derive an execution order the writer already knew — and
 * a page showing one order while a session performed another would have been
 * two answers to one question. Instead the lines come out in the order they
 * are performed, and the snapshot copies them.
 */

/** One set of the plan, before it becomes a session_set row. */
export interface PlannedSet {
  exerciseId: ExerciseId;
  /**
   * Frozen at start, and NOT NULL in the table.
   *
   * Read from the exercise as it is called TODAY, which is the moment specs 5.2
   * names — "snapshot de la routine au démarrage". Renaming the exercise
   * afterwards leaves this alone, and deleting it leaves this as the only thing
   * that still says what was performed (D5/R4).
   */
  exerciseName: string;
  setIndex: number;
  setType: SetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetLoadKg: number | null;
  targetRir: number | null;
  targetDurationSeconds: number | null;
  progressionEnabled: boolean;
}

/** One block of the plan: an exercise, or several as a superset. */
export interface PlannedBlock {
  /**
   * The rest this block prescribes, already resolved by restForBlock.
   *
   * Resolved HERE rather than carried raw, so a session never has to re-ask
   * which of the two columns applies. The routine's own fallback — a line-level
   * rest written by the first version of slice 10 — is read once, at the
   * snapshot, and what the session stores is the answer.
   */
  restSeconds: number | null;
  sets: PlannedSet[];
}

export interface SessionPlan {
  routineName: string | null;
  blocks: PlannedBlock[];
}

/** What a routine looks like to this module — the shape routine-reads renders. */
export interface PlannableLine {
  exerciseId: ExerciseId;
  exerciseName: string;
  setType: SetType;
  repsMin: number | null;
  repsMax: number | null;
  targetLoadKg: number | null;
  targetRir: number | null;
  durationSeconds: number | null;
  progressionEnabled: 0 | 1;
  /** Whether the EXERCISE is measured in time, carried on the line. */
  tracksDuration: 0 | 1;
}

export interface PlannableBlock {
  restSeconds: number | null;
  lines: PlannableLine[];
}

/**
 * The set index of a line: its rank FOR ITS OWN EXERCISE within the block.
 *
 * The same derivation setIndexOf performs on a draft, repeated here rather than
 * imported because the inputs differ — a draft holds LineDraft, a session plan
 * is built from what was read back out of SQL. What must not differ is the
 * ANSWER, and a test compares the two on the same block.
 *
 * In a superset this number is the ROUND: A and B at three sets each give
 * 1,2,3 for A and 1,2,3 for B, and A's second set and B's second set are
 * performed in the same round.
 */
function setIndexOf(lines: readonly PlannableLine[], index: number): number {
  const line = lines[index];
  if (line === undefined) return 1;
  let rank = 0;
  for (let i = 0; i <= index; i += 1) {
    if (lines[i]?.exerciseId === line.exerciseId) rank += 1;
  }
  return rank;
}

export function planFromRoutine(
  routineName: string,
  blocks: readonly PlannableBlock[],
  restForBlock: (block: PlannableBlock) => number | null,
): SessionPlan {
  return {
    routineName,
    blocks: blocks
      // A block with no lines writes no sets, so it would be a session block
      // nothing can render — the empty row deleteExercise cleans up on the
      // routine side, kept out of the session rather than carried into it.
      .filter((block) => block.lines.length > 0)
      .map((block) => ({
        restSeconds: restForBlock(block),
        sets: block.lines.map((line, index) => ({
          exerciseId: line.exerciseId,
          exerciseName: line.exerciseName,
          setIndex: setIndexOf(block.lines, index),
          setType: line.setType,
          targetRepsMin: line.repsMin,
          targetRepsMax: line.repsMax,
          targetLoadKg: line.targetLoadKg,
          targetRir: line.targetRir,
          /**
           * A duration target only survives the snapshot if the EXERCISE is
           * measured in time. The flag is on the exercise, not on the line
           * (specs 14.21 no 1), so a duration left on a line whose exercise
           * stopped tracking duration is stale data — carried into a session it
           * would show a seconds field on a bench press.
           */
          targetDurationSeconds: line.tracksDuration === 1 ? line.durationSeconds : null,
          progressionEnabled: line.progressionEnabled === 1,
        })),
      })),
  };
}

/**
 * An empty session, for starting one without a routine.
 *
 * Specs 10.3 allows adding exercises live, so starting from nothing is a real
 * path rather than an edge case — and both session.routine_id and
 * routine_name_snapshot are nullable precisely for it.
 */
export function emptyPlan(): SessionPlan {
  return { routineName: null, blocks: [] };
}
