import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import { toLocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  exercise,
  exerciseSecondaryMuscle,
  session,
  sessionBlock,
  sessionSegment,
  sessionSet,
  type SessionId,
} from '@/core/db/schema';
import { recordedDurationMs, type ActivitySegment } from '../domain/session-activity';
import { countsTowardsVolume } from '../domain/session-set';
import { setVolume } from '../domain/exercise-stats';
import type { VolumeSet } from '../domain/muscle-volume';

/**
 * What the strength panel of the dashboard reads (specs 10.6).
 *
 * > Plages : 3 mois / 1 an / tout. Calendrier des séances · Durée des séances
 * > · Volume total par séance · Répétitions par séance · Carte corporelle des
 * > muscles travaillés · Graphique croisé.
 *
 * ## FOUR QUERIES FOR ANY RANGE, NOT FOUR PER SESSION
 *
 * The discipline slice 4 settled when quick-add reached the whole library and
 * every read since has followed: heads, segments, sets, secondary muscles.
 * A year of training is two hundred sessions, and a read per session is what
 * makes a dashboard that opens in a tenth of a second open in twenty.
 *
 * ## IT IS BOUNDED BY THE CIVIL DATE, NEVER BY AN INSTANT
 *
 * > Un instant ne détermine jamais l'appartenance à une journée. (D3)
 *
 * `session.date` is what a range of "three months" is three months of, and
 * `ix_session_date` is the index for exactly this. Filtering on `started_at`
 * would put a session logged late at night into the wrong end of the range,
 * and would do it differently depending on the phone's time zone.
 *
 * ## ONLY FINISHED SESSIONS
 *
 * A session in progress has no duration worth charting — it is still
 * accruing — and its sets are half recorded. It appears on the dashboard the
 * moment it is finished, which is the moment it became a fact.
 */
export interface PanelSessionRow {
  id: SessionId;
  date: LocalDate;
  startedAt: number;
  /** Summed from the stored segments (D12). Never endedAt minus startedAt. */
  durationMs: number;
  /** charge × répétitions over the counted sets. Null when none had both. */
  volumeKg: number | null;
  /** Repetitions performed in counted sets. */
  reps: number;
  /** Counted working sets. */
  setCount: number;
}

export interface StrengthPanelData {
  sessions: PanelSessionRow[];
  /**
   * Every counted set of the range, as the body map needs to tally it.
   *
   * ONE ENTRY PER SET rather than per exercise, because tallyMuscles counts
   * SETS: specs 10.2's map is about how much a muscle was worked, and an
   * exercise done for five sets is not the same as one done for one.
   *
   * A set whose exercise was deleted contributes nothing — it has no muscles
   * left to name. That is the same boundary specs 5.3 draws for the records,
   * and it is why the tally can under-report after a deletion rather than
   * guessing from a frozen name.
   */
  volumeSets: VolumeSet[];
}

export function readStrengthPanel(
  db: AppDatabase,
  from: LocalDate | null,
  to: LocalDate,
): StrengthPanelData {
  const heads = db
    .select({ id: session.id, date: session.date, startedAt: session.startedAt })
    .from(session)
    .where(
      from === null
        ? and(eq(session.status, 'done'), lte(session.date, to))
        : and(eq(session.status, 'done'), gte(session.date, from), lte(session.date, to)),
    )
    // Oldest first, the direction every chart is drawn in. The civil day
    // leads and the instant only separates two sessions of one day — the
    // tuple SESSION_ORDER states, reversed.
    .orderBy(asc(session.date), asc(session.startedAt))
    .all();

  if (heads.length === 0) return { sessions: [], volumeSets: [] };

  const wanted = new Set<string>(heads.map((head) => head.id));

  const segmentsBySession = new Map<string, ActivitySegment[]>();
  for (const row of db
    .select({
      sessionId: sessionSegment.sessionId,
      startedAt: sessionSegment.startedAt,
      endedAt: sessionSegment.endedAt,
    })
    .from(sessionSegment)
    .all()) {
    if (!wanted.has(row.sessionId)) continue;
    const current = segmentsBySession.get(row.sessionId);
    const segment = { startedAt: row.startedAt, endedAt: row.endedAt };
    if (current === undefined) segmentsBySession.set(row.sessionId, [segment]);
    else current.push(segment);
  }

  /*
    The sets of every session in the range, joined to their exercise for the
    primary muscle. LEFT, not INNER: exercise_id is nulled when an exercise is
    deleted (D5/R4), and an inner join would make those sets vanish from the
    volume as well as from the body map — the volume they contributed is real
    and specs 5.3 only breaks the statistical continuity of the EXERCISE.
  */
  const rows = db
    .select({
      sessionId: sessionBlock.sessionId,
      exerciseId: sessionSet.exerciseId,
      setType: sessionSet.setType,
      status: sessionSet.status,
      loadKg: sessionSet.actualLoadKg,
      reps: sessionSet.actualReps,
      primaryMuscle: exercise.primaryMuscle,
    })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .leftJoin(exercise, eq(sessionSet.exerciseId, exercise.id))
    .all();

  const secondary = new Map<string, string[]>();
  for (const row of db
    .select({
      exerciseId: exerciseSecondaryMuscle.exerciseId,
      muscle: exerciseSecondaryMuscle.muscle,
    })
    .from(exerciseSecondaryMuscle)
    .all()) {
    const current = secondary.get(row.exerciseId);
    if (current === undefined) secondary.set(row.exerciseId, [row.muscle]);
    else current.push(row.muscle);
  }

  const totals = new Map<string, { volume: number | null; reps: number; sets: number }>();
  const volumeSets: VolumeSet[] = [];

  for (const row of rows) {
    if (!wanted.has(row.sessionId)) continue;
    // The one predicate, shared with the exercise page and with specs 10.1's
    // definition of volume. Two spellings of "which sets count" is exactly
    // what this slice is arranged to avoid.
    if (!countsTowardsVolume(row.setType, row.status)) continue;

    const current = totals.get(row.sessionId) ?? { volume: null, reps: 0, sets: 0 };
    current.sets += 1;
    if (row.reps !== null && Number.isFinite(row.reps) && row.reps > 0) current.reps += row.reps;

    const volume = setVolume(row.loadKg, row.reps);
    // null + volume, so a session of bodyweight sets keeps a null total rather
    // than acquiring a zero the first time something is added to it.
    if (volume !== null) current.volume = (current.volume ?? 0) + volume;
    totals.set(row.sessionId, current);

    if (row.primaryMuscle !== null && row.exerciseId !== null) {
      volumeSets.push({
        primaryMuscle: row.primaryMuscle,
        secondaryMuscles: secondary.get(row.exerciseId) ?? [],
      });
    }
  }

  return {
    sessions: heads.map((head) => {
      const total = totals.get(head.id) ?? { volume: null, reps: 0, sets: 0 };
      return {
        id: head.id,
        date: toLocalDate(head.date),
        startedAt: head.startedAt,
        durationMs: recordedDurationMs(segmentsBySession.get(head.id) ?? []),
        volumeKg: total.volume,
        reps: total.reps,
        setCount: total.sets,
      };
    }),
    volumeSets,
  };
}
