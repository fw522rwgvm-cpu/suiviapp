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
 * ## EXCEPT A RANGE, WHICH HAS NO SINGLE ANSWER — AND THAT IS NOT PEDANTRY
 *
 * "6 à 8" prescribes no number, so there is nothing to fall back to. Picking
 * the TOP would be the tempting default and it is the one that must not be
 * taken: specs 10.4 fires the progression suggestion when every working set
 * reaches "le haut de la plage", so auto-filling the top proposes a heavier
 * load next week because the user tapped a RIR — a plausible, wrong figure
 * arrived at without anybody saying they hit eight. Picking the bottom is the
 * mirror image, under-reporting the volume instead.
 *
 * So a range with nothing typed cannot be validated, and needsReps() says so
 * before the RIR row is ever offered. It costs one tap on a set whose
 * repetitions genuinely varied, which is the set where the number matters most.
 *
 * The LOAD has no such ambiguity — a target load is one number — so it fills
 * itself, and so does a duration target.
 */
export function needsReps(target: SetTarget, typed: TypedSet): boolean {
  // A timed exercise is answered by its duration, never by repetitions.
  if (target.durationSeconds !== null) return false;
  if (typed.reps !== null) return false;
  // No target at all is the free case: a set added live has nothing prescribed,
  // so the number has to come from the user.
  if (target.repsMin === null && target.repsMax === null) return true;
  return !isFixedReps(target);
}

export function recordSet(target: SetTarget, typed: TypedSet, rir: number): RecordedSet {
  return {
    reps: typed.reps ?? fixedReps(target),
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
 */
export function countsTowardsVolume(setType: string, status: string): boolean {
  return setType === 'work' && status === 'done';
}
