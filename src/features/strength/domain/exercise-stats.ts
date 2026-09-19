import type { LocalDate } from '@/core/date';
import type { SessionId } from '@/core/db/schema';
import type { HistorySet } from '../data/history-reads';
import { countsTowardsVolume } from './session-set';

/**
 * The arithmetic of specs 10.1 — charts and personal records (D9).
 *
 * > Fonctions pures TypeScript : Epley, moyenne mobile, régression, adhérence,
 * > double progression, arrondis. Ne connaissent ni la base ni React. (D9)
 *
 * Nothing here reads a clock, a database or React. Everything takes the rows
 * readExerciseHistory hands over and folds them.
 *
 * ## NOTHING IS STORED, AND D9 NAMES THESE FOUR EXPLICITLY
 *
 * > Systématiquement recalculés : […] volume, 1RM d'Epley, records personnels,
 * > suggestion de double progression. (D9)
 *
 * So there is no decision to take about caching: the records are a fold over
 * the history, and correcting a set a month later moves them, which is what
 * specs 5.3's "aucune limite temporelle d'édition" means in practice. Editing
 * history is only cheap because nothing derived was written down.
 *
 * ## THE FIVE SERIES SHARE ONE SCOPE, AND THAT IS A READING OF SPECS 10.1
 *
 * Specs 10.1 scopes the VOLUME — "sur les séries de travail validées
 * uniquement" — and says nothing about the scope of the other four. They are
 * all read through the same predicate, countsTowardsVolume, and the reasons
 * are:
 *
 * - a warm-up's load is not your maximum load, and a 1RM estimated from 20 kg
 *   × 12 is not an estimate of anything;
 * - "total de répétitions" sits on the same page as "volume de séance", so two
 *   charts counting different sets would contradict each other in front of the
 *   reader;
 * - the one scope the document does give is the narrow one, and applying it
 *   uniformly is the conservative reading.
 *
 * FLAGGED as a reading rather than a quotation, and written up in specs 14.42.
 *
 * ## A NULL IS NEVER A ZERO — slice 4's central rule, and it decides real cases
 *
 * `actual_load_kg` is nullable and NULL is the ordinary state of a bodyweight
 * set. Reading it as zero would give every pull-up a volume of zero and a
 * maximum load of zero — plausible, wrong, and invisible, because zero looks
 * exactly like "not very much". So a set with no load contributes no volume, no
 * 1RM and no maximum load, while its REPETITIONS still count: that chart is the
 * only one of the five a bodyweight exercise can honestly fill.
 */

/** Epley's ceiling (specs 10.1): above twelve the formula is not applied. */
export const ONE_RM_MAX_REPS = 12;

/**
 * Estimated one-rep maximum (specs 10.1).
 *
 * > Formule de 1RM : Epley, soit charge × (1 + répétitions / 30), calculée
 * > uniquement sur les séries de 12 répétitions ou moins.
 *
 * NULL above twelve reps rather than a number nobody should read: the formula
 * is a straight line and it diverges from reality the further it is
 * extrapolated, which is exactly why the specification caps it. Returning a
 * value and expecting every caller to remember the cap is how a cap gets lost.
 *
 * NULL is also the answer with no load and with no reps — a bodyweight set has
 * no one-rep maximum in kilograms, and zero would be a plausible wrong one.
 *
 * Zero reps is not a set: it is the state of a row somebody validated without
 * typing anything, and 1RM = load × 1 would then claim the target load was
 * lifted once.
 */
export function epleyOneRm(loadKg: number | null, reps: number | null): number | null {
  if (loadKg === null || reps === null) return null;
  if (!Number.isFinite(loadKg) || !Number.isFinite(reps)) return null;
  if (reps <= 0 || reps > ONE_RM_MAX_REPS) return null;
  if (loadKg <= 0) return null;
  return loadKg * (1 + reps / 30);
}

/**
 * The volume of one set (specs 10.1).
 *
 * > Définition du volume : charge × répétitions.
 *
 * NULL, never zero, when either half is missing. A bodyweight set has no volume
 * in kilogram-repetitions; saying it has zero would put it at the bottom of
 * every ranking rather than out of it.
 */
export function setVolume(loadKg: number | null, reps: number | null): number | null {
  if (loadKg === null || reps === null) return null;
  if (!Number.isFinite(loadKg) || !Number.isFinite(reps)) return null;
  if (loadKg <= 0 || reps <= 0) return null;
  return loadKg * reps;
}

/** Whether a row is one the charts and the records may count (specs 10.1). */
export function isCounted(set: HistorySet): boolean {
  return countsTowardsVolume(set.setType, set.status);
}

/**
 * One session's worth of this exercise — a point on every chart of specs 10.1.
 *
 * The five series are five fields of one object rather than five arrays built
 * separately: they must cover the SAME sessions or the charts would be drawn
 * against five different axes, and building them together is what makes that
 * structural instead of careful. The same reason nutritionPanel exists.
 */
export interface ExerciseSessionPoint {
  sessionId: SessionId;
  date: LocalDate;
  startedAt: number;
  /** Counted working sets in this session. Never zero — a point needs one. */
  setCount: number;
  /** Heaviest load, or null if none was stated. */
  maxLoadKg: number | null;
  /** Best Epley of the session, or null if no set qualified. */
  bestOneRm: number | null;
  /** Best single-set volume, or null. */
  bestSetVolume: number | null;
  /** Sum of the set volumes, or null if not one set had both halves. */
  sessionVolume: number | null;
  /** Repetitions performed. The one series a bodyweight exercise can fill. */
  totalReps: number;
}

/**
 * The history folded into one point per session, oldest first.
 *
 * ## A SESSION WITH NO COUNTABLE SET PRODUCES NO POINT
 *
 * Not a point at zero. A session where every working set was skipped is an
 * absence of measurement, not a session of zero volume — the rule slice 7 set
 * for the nutrition series and specs 9.2 states normatively for weight: "les
 * jours sans mesure sont ignorés". A zero would draw a spike down to the axis
 * that nobody trained.
 *
 * ## IT TRUSTS THE READ'S ORDER RATHER THAN SORTING AGAIN
 *
 * readExerciseHistory hands rows oldest first, by civil date then by start.
 * Sorting here would be a second spelling of that order, free to disagree on
 * the session logged for yesterday.
 */
export function exerciseSessionPoints(
  history: readonly HistorySet[],
): ExerciseSessionPoint[] {
  const points: ExerciseSessionPoint[] = [];
  let current: ExerciseSessionPoint | null = null;

  for (const set of history) {
    if (!isCounted(set)) continue;

    if (current === null || current.sessionId !== set.sessionId) {
      current = {
        sessionId: set.sessionId,
        date: set.date,
        startedAt: set.startedAt,
        setCount: 0,
        maxLoadKg: null,
        bestOneRm: null,
        bestSetVolume: null,
        sessionVolume: null,
        totalReps: 0,
      };
      points.push(current);
    }

    current.setCount += 1;
    if (set.reps !== null && Number.isFinite(set.reps) && set.reps > 0) {
      current.totalReps += set.reps;
    }
    if (set.loadKg !== null && Number.isFinite(set.loadKg) && set.loadKg > 0) {
      current.maxLoadKg = maxOrNull(current.maxLoadKg, set.loadKg);
    }
    current.bestOneRm = maxOrNull(current.bestOneRm, epleyOneRm(set.loadKg, set.reps));

    const volume = setVolume(set.loadKg, set.reps);
    current.bestSetVolume = maxOrNull(current.bestSetVolume, volume);
    if (volume !== null) {
      // null + volume, so a session of bodyweight sets keeps a null total
      // rather than acquiring a zero the first time it is added to.
      current.sessionVolume = (current.sessionVolume ?? 0) + volume;
    }
  }

  return points;
}

/** One personal record: the value, and when it was set (specs 10.1). */
export interface PersonalRecord {
  value: number;
  date: LocalDate;
  sessionId: SessionId;
}

/**
 * The four records of specs 10.1.
 *
 * > Records personnels : charge maximale, meilleur 1RM estimé, meilleur volume
 * > de série, meilleur volume de séance.
 *
 * ## EACH ONE CARRIES ITS DATE, WHICH SPECS 10.1 DOES NOT ASK FOR
 *
 * "120 kg" alone is half a fact — the useful question about a record is
 * whether it is from last month or from two years ago, because that is what
 * says whether the exercise is progressing or was abandoned. It costs nothing:
 * the rows carry their session already. FLAGGED as an addition.
 *
 * ## OVER ALL OF HISTORY, NEVER OVER THE SELECTED RANGE
 *
 * Specs 10.1 lists the ranges under "Graphiques" and the records as a separate
 * bullet. A record that changed when somebody moved the range selector would
 * not be a record — it would be a maximum, which is what the charts already
 * draw. FLAGGED as a reading; written up in specs 14.42.
 *
 * ## THE FIRST TIME A VALUE IS REACHED KEEPS THE RECORD
 *
 * Strictly greater, so equalling a record does not move its date. Somebody who
 * has lifted 100 kg three times set that record the first time; re-dating it
 * to the most recent attempt would say the record is newer than it is, which is
 * the one thing the date is there to answer.
 */
export interface PersonalRecords {
  maxLoadKg: PersonalRecord | null;
  bestOneRm: PersonalRecord | null;
  bestSetVolume: PersonalRecord | null;
  bestSessionVolume: PersonalRecord | null;
}

export function personalRecords(history: readonly HistorySet[]): PersonalRecords {
  let maxLoadKg: PersonalRecord | null = null;
  let bestOneRm: PersonalRecord | null = null;
  let bestSetVolume: PersonalRecord | null = null;

  for (const set of history) {
    if (!isCounted(set)) continue;
    const where = { date: set.date, sessionId: set.sessionId };

    if (set.loadKg !== null && Number.isFinite(set.loadKg) && set.loadKg > 0) {
      maxLoadKg = better(maxLoadKg, set.loadKg, where);
    }
    bestOneRm = better(bestOneRm, epleyOneRm(set.loadKg, set.reps), where);
    bestSetVolume = better(bestSetVolume, setVolume(set.loadKg, set.reps), where);
  }

  /*
    The session record is taken from the POINTS rather than from a second walk
    of the rows: the points are where a session's volume is defined, and
    summing it twice would be two spellings of one total. Slice 4's rule, on
    the quantity prefill that the row and its button had to agree about.
  */
  let bestSessionVolume: PersonalRecord | null = null;
  for (const point of exerciseSessionPoints(history)) {
    bestSessionVolume = better(bestSessionVolume, point.sessionVolume, {
      date: point.date,
      sessionId: point.sessionId,
    });
  }

  return { maxLoadKg, bestOneRm, bestSetVolume, bestSessionVolume };
}

/** Strictly greater wins, so the FIRST time a value was reached keeps the date. */
function better(
  current: PersonalRecord | null,
  candidate: number | null,
  where: { date: LocalDate; sessionId: SessionId },
): PersonalRecord | null {
  if (candidate === null) return current;
  if (current !== null && candidate <= current.value) return current;
  return { value: candidate, date: where.date, sessionId: where.sessionId };
}

/** max() that treats null as "no value", never as zero. */
function maxOrNull(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  return Math.max(current, candidate);
}
