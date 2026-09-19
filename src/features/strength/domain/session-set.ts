import type { SetType } from '@/core/db/schema';

/**
 * What a set of a live session holds, and what validating one records
 * (specs 10.3).
 *
 * Pure: the screen holds these, this module says what a validation writes, and
 * session-writes.ts turns the answer into rows.
 */

/** The target frozen from the routine at start, never touched afterwards. */
export interface SetTarget {
  setType: SetType;
  repsMin: number | null;
  repsMax: number | null;
  loadKg: number | null;
  rir: number | null;
  /** Read INSTEAD of the reps when the exercise is measured in time (0009). */
  durationSeconds: number | null;
}

/** What the user has typed into a row, before validating it. */
export interface TypedSet {
  reps: number | null;
  loadKg: number | null;
  durationSeconds: number | null;
}

/** What gets written when a set is validated. */
export interface RecordedSet {
  reps: number | null;
  loadKg: number | null;
  durationSeconds: number | null;
  rir: number;
}

/**
 * Whether a target states one number or a span (specs 6.3, "fixes ou en
 * plage").
 *
 * One end alone counts as fixed: "8 reps minimum" and "8 reps" are the same
 * instruction to somebody standing under a bar.
 */
export function isFixedReps(target: SetTarget): boolean {
  if (target.repsMin === null && target.repsMax === null) return false;
  if (target.repsMin === null || target.repsMax === null) return true;
  return target.repsMin === target.repsMax;
}

/** The single repetition count a fixed target prescribes, if it has one. */
export function fixedReps(target: SetTarget): number | null {
  if (!isFixedReps(target)) return null;
  return target.repsMin ?? target.repsMax;
}

/**
 * The repetitions a set records when nothing was typed (specs 14.39).
 *
 * ## THE TOP OF THE RANGE, WHICH REVERSES SLICE 11
 *
 * The note below recordSet used to argue the opposite, and it argued it well:
 * "6 à 8" prescribes no number, and picking the TOP fires the progression
 * suggestion of specs 10.4 — which proposes a heavier load next week because
 * somebody validated a set without saying they hit eight.
 *
 * REQUESTED REVERSED, and the consequence is accepted rather than argued away:
 * **a range left untouched will now propose a progression.** That is the price,
 * and it is the right way round for the person paying it — the common case is
 * doing the set as written, where the top is what happened and typing it is a
 * tap on every set of every session. The rare case is falling short, and it is
 * already the case where you reach for the field.
 *
 * ONE END ALONE IS NOT A RANGE, and it still answers: "8 minimum" and "8
 * maximum" both record eight, which is what isFixedReps already said.
 */
export function defaultReps(target: SetTarget): number | null {
  return target.repsMax ?? target.repsMin;
}

/**
 * What entering a RIR records, given what was typed and what was prescribed.
 *
 * > Les champs portent en texte indicatif les valeurs attendues de la routine ;
 * > pour une plage, la plage complète. La saisie du RIR valide automatiquement
 * > la série.
 *
 * ## THE PLACEHOLDER IS A PROMISE, SO IT IS WHAT GETS RECORDED
 *
 * A set left untouched and then validated is a set performed AS PRESCRIBED —
 * that is what "texte indicatif" means to the person tapping. Recording nulls
 * instead would store "something happened, we do not know what", on the most
 * common path there is, and the volume of specs 10.1 would silently miss it.
 *
 * ## A RANGE FILLS ITSELF TOO SINCE specs 14.39
 *
 * Slice 11 refused to: "6 à 8" prescribes no number, and picking the top fires
 * the progression rule of specs 10.4 on a set nobody described. Requested
 * reversed — see defaultReps for the trade and the consequence that comes with
 * it.
 *
 * What is left of that reasoning is the case it was really about: a set with NO
 * target at all, added live. There the field is the only source there is.
 */
export function needsReps(target: SetTarget, typed: TypedSet): boolean {
  // A timed exercise is answered by its duration, never by repetitions.
  if (target.durationSeconds !== null) return false;
  if (typed.reps !== null) return false;
  // No target at all is the free case: a set added live has nothing prescribed,
  // so the number has to come from the user.
  return target.repsMin === null && target.repsMax === null;
}

export function recordSet(target: SetTarget, typed: TypedSet, rir: number): RecordedSet {
  return {
    reps: typed.reps ?? defaultReps(target),
    loadKg: typed.loadKg ?? target.loadKg,
    durationSeconds: typed.durationSeconds ?? target.durationSeconds,
    rir,
  };
}

/**
 * The RIR values a row offers (specs 10.3).
 *
 * > RIR saisi via une rangée sur une ligne : 0 · 1 · 1,5 · 2 · 2,5 · 3 · 3,5 · 4+
 *
 * Eight values, and the spacing is the specification's rather than a scale: the
 * halves live where the judgement is fine — between one and four, where a
 * lifter can actually tell — and the ends are coarse, because "zero" and "four
 * or more" are the two answers nobody refines.
 *
 * 4 means "4+", which is why the list stops there. Stored as the number, so
 * nothing has to decode a sentinel; what it MEANS is a label, and labels live
 * in session-text.ts.
 */
export const RIR_CHOICES = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

/** The largest RIR the row offers, above which everything reads the same. */
export const RIR_OPEN_ENDED = 4;

/**
 * Whether a set counts towards the volume of specs 10.1.
 *
 * > Définition du volume : charge × répétitions, sur les séries de travail
 * > validées uniquement.
 *
 * A POSITIVE clause, which is why neither set_type nor status carries a CHECK:
 * a value this build does not know is simply not counted, rather than silently
 * joining a total whose definition excludes it. Slice 12 reads the volume; this
 * is the predicate it will read it through, written here so there is one.
 *
 * ## SLICE 12 READS ALL FIVE SERIES THROUGH IT, NOT ONLY THE VOLUME
 *
 * The name stayed, because renaming a shipped and tested function for tidiness
 * is what this project refuses; what widened is its job. Specs 10.1 scopes only
 * the volume, and exercise-stats.ts sets out why the maximum load, the 1RM, the
 * best set volume and the repetition total take the same scope — chiefly that
 * two charts on one page counting different sets would contradict each other in
 * front of the reader.
 *
 * One exception, deliberate and documented where it lives: the PRÉCÉDENT column
 * reads `status === 'done'` WITHOUT the set_type clause, because it sits on
 * every row including the warm-ups. That difference is real and is not to be
 * unified away.
 */
export function countsTowardsVolume(setType: string, status: string): boolean {
  return setType === 'work' && status === 'done';
}
