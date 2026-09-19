import { and, eq } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import { toLocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  session,
  sessionBlock,
  sessionSet,
  type ExerciseId,
  type SessionId,
  type SetType,
} from '@/core/db/schema';
import { isSetType } from '../domain/vocabulary';

/**
 * The past of ONE exercise (specs 10.1, 10.4, 10.5).
 *
 * ## ONE READ, THREE FOLDS — AND THAT IS THE WHOLE DESIGN OF THE SLICE
 *
 * Specs 10.1's five charts, specs 10.1's four personal records and specs 10.4's
 * progression condition are three questions about the same rows: the working
 * sets this exercise has ever been given. Reading them once and folding three
 * times is what stops three readers disagreeing about which sets counted —
 * which is the defect shape this project has chased out of quantity prefill
 * (slice 4) and out of the PRÉCÉDENT column (slice 11).
 *
 * The folds live in domain/exercise-stats.ts and domain/progression.ts. Nothing
 * here computes: this file's whole job is to hand over the rows.
 *
 * ## IT READS BY ID ONLY, AND SPECS 5.3 IS WHAT DECIDES THAT
 *
 * `previousFor` matches on the id and falls back to the FROZEN NAME, so that a
 * squat deleted and recreated does not show a blank PRÉCÉDENT column. That
 * fallback must NOT come here, and the reason is normative rather than
 * technical:
 *
 * > Les séances passées conservent le nom figé de l'exercice, mais la
 * > continuité statistique est rompue définitivement. (Specs 5.3)
 *
 * The application warns about exactly that before the deletion is confirmed.
 * Resurrecting the old sets by name would hand back the records and the charts
 * the user was told they had destroyed — a promise broken silently, on the one
 * deletion specs 5.3 calls the only one that really destroys something.
 *
 * So: a display convenience on one column of one screen, and a statistical
 * boundary on the page whose whole subject is the statistics. Two rules,
 * deliberately, and this comment is why they are not unified.
 *
 * ## WORK SETS ONLY, ANY STATUS
 *
 * `set_type = 'work'` is settled in SQL because all three folds want it: specs
 * 10.1 scopes the volume to "les séries de travail" and specs 10.4 reads
 * "toutes les séries de travail".
 *
 * The STATUS is deliberately not filtered, and that is the one thing about this
 * read that is easy to get wrong. The charts and the records want validated
 * sets only, and they say so through countsTowardsVolume. Specs 10.4 needs the
 * others: its condition is that ALL the working sets reached the top of the
 * range, so a set left pending or skipped is what makes the condition FALSE.
 * Filtering here would make an abandoned session look like a perfect one.
 *
 * ## THE CIVIL DATE COMES FROM THE SESSION, NEVER FROM completed_at
 *
 * > Un instant ne détermine jamais l'appartenance à une journée. (D3)
 *
 * `session.date` is the civil day the workout belongs to, and it is what every
 * chart groups by. `completed_at` travels beside it for ordering inside a
 * session, and because slice 12 stamps it deliberately when a set of a finished
 * session is validated after the fact.
 */
export interface HistorySet {
  sessionId: SessionId;
  /** The civil date of the SESSION (D3) — what the charts group by. */
  date: LocalDate;
  /** Separates two sessions of the same civil day. */
  startedAt: number;
  setIndex: number;
  /** Always 'work' given the filter, but carried so the predicate sees the truth. */
  setType: SetType;
  status: string;
  progressionEnabled: 0 | 1;
  targetLoadKg: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  /** What was actually lifted. NULL is "none stated", never zero. */
  loadKg: number | null;
  reps: number | null;
  completedAt: number | null;
}

/**
 * Every working set this exercise has ever been given, oldest first.
 *
 * ## ONE QUERY FOR THE WHOLE HISTORY, AND IT READS ALL OF IT
 *
 * Not a range. The four records of specs 10.1 are records over everything —
 * one that changed when somebody moved the range selector would not be a record
 * — so the page needs the whole history regardless. The charts then fold the
 * subset their range asks for, from rows already in hand, which is one query
 * instead of two.
 *
 * ## WHAT IT COSTS, ESTIMATED AND NOT MEASURED
 *
 * Four sessions a week is about two hundred a year; an exercise trained twice a
 * week at three or four working sets is two to four hundred rows a year, and
 * of the order of a thousand over several years. `ix_set_exercise`
 * (exercise_id, completed_at) already exists and is exactly this index. D9's
 * escape hatch — "recalculer et mettre en cache le résultat, pas le stocker" —
 * is React Query, and it is already there.
 *
 * ORDERED OLDEST FIRST, because that is the direction every chart is drawn in
 * and the direction a fold accumulates in. The one question that wants the
 * other end — specs 10.4's "la séance la plus récente" — takes the last group
 * rather than re-sorting, which is why the order is stated here once.
 */
export function readExerciseHistory(
  db: AppDatabase,
  exerciseId: ExerciseId,
): HistorySet[] {
  const rows = db
    .select({
      sessionId: session.id,
      date: session.date,
      startedAt: session.startedAt,
      setIndex: sessionSet.setIndex,
      setType: sessionSet.setType,
      status: sessionSet.status,
      progressionEnabled: sessionSet.progressionEnabled,
      targetLoadKg: sessionSet.targetLoadKg,
      targetRepsMin: sessionSet.targetRepsMin,
      targetRepsMax: sessionSet.targetRepsMax,
      loadKg: sessionSet.actualLoadKg,
      reps: sessionSet.actualReps,
      completedAt: sessionSet.completedAt,
      position: sessionSet.position,
    })
    .from(sessionSet)
    .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
    .innerJoin(session, eq(sessionBlock.sessionId, session.id))
    .where(and(eq(sessionSet.exerciseId, exerciseId), eq(sessionSet.setType, 'work')))
    .all();

  /*
    Sorted here rather than in SQL, and the tuple is SESSION_ORDER reversed.

    A session logged for yesterday starts later than one logged for today, so
    the instant alone orders them wrongly — the same reason session-reads states
    the order once. `position` separates two sets of one session: it is
    execution order, where set_index is the ROUND and repeats inside a superset.
  */
  return rows
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startedAt - b.startedAt ||
        a.position - b.position,
    )
    .map((row) => ({
      sessionId: row.sessionId,
      date: toLocalDate(row.date),
      startedAt: row.startedAt,
      setIndex: row.setIndex,
      // Narrowed once here rather than by every fold, as readSession does.
      setType: isSetType(row.setType) ? row.setType : 'work',
      status: row.status,
      progressionEnabled: row.progressionEnabled,
      targetLoadKg: row.targetLoadKg,
      targetRepsMin: row.targetRepsMin,
      targetRepsMax: row.targetRepsMax,
      loadKg: row.loadKg,
      reps: row.reps,
      completedAt: row.completedAt,
    }));
}
