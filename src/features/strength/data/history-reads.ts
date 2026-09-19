import { and, eq, sql } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import { toLocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import {
  exercise,
  session,
  sessionBlock,
  sessionSet,
  type ExerciseId,
  type SessionId,
  type SetType,
} from '@/core/db/schema';
import { isSetType } from '../domain/vocabulary';
import {
  suggestProgression,
  type ProgressionSet,
  type ProgressionSuggestion,
} from '../domain/progression';

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

/**
 * What each exercise of a session earned last time (specs 10.4).
 *
 * Keyed by exercise id, so the live screen looks up the block it is drawing.
 * An exercise with no entry has earned nothing, which is the ordinary case.
 */
export type ProgressionSuggestions = Map<string, ProgressionSuggestion>;

/**
 * The double-progression suggestions for one live session (specs 10.4).
 *
 * ## ONE QUERY, WHATEVER THE SESSION HOLDS
 *
 * The shape readPreviousSets and readPendingNotes already have, for the reason
 * slice 4 settled when the "+" button reached the whole library: a read per
 * exercise is what makes a screen that opens in a tenth of a second open in
 * two. This one is read on the live session screen — the screen somebody is
 * standing in front of between two sets.
 *
 * ## THE CURRENT SESSION IS EXCLUDED, AND THAT IS NOT A DETAIL
 *
 * Specs 10.4 reads "la séance la plus récente comportant cet exercice". Left
 * in, the running session would become its own evidence: validate three sets at
 * the top of the range and the suggestion would flip mid-workout, telling you
 * to go up on the strength of the very sets you are using it to decide. The
 * same exclusion, for the same reason, as readPreviousSets' `ne(session.id,
 * currentSessionId)`.
 *
 * `status = 'done'` beside it is close to redundant, ux_session_active allowing
 * only one session in progress at a time — it is there because the rule is
 * "the last session you FINISHED", and saying so in the query is better than
 * relying on an index to mean it.
 *
 * ## THE ORDER IS SESSION_ORDER, SPELLED IN SQL
 *
 * `civil_date DESC, started_at DESC` — the civil day first, the instant only to
 * separate two sessions of one day. It is a second spelling of a tuple stated
 * once in session-reads, which is exactly what slice 4's ROW_NUMBER had to
 * avoid against readLastEntryForFood. The window function cannot take the
 * Drizzle array, so a test holds the two together instead of the spelling.
 *
 * ## IT JOINS `exercise` FOR THE INCREMENT RATHER THAN WIDENING THE LIST ITEM
 *
 * Specs 6.3 makes the increment "propre à l'exercice", so the suggestion needs
 * it. Putting it on ExerciseListItem would also have worked — it is the same
 * row — but it is wanted at exactly one place and this query already touches
 * `exercise`.
 */
export function readProgressionSuggestions(
  db: AppDatabase,
  currentSessionId: SessionId,
): ProgressionSuggestions {
  const rows = db.all<{
    exercise_id: string;
    increment_kg: number;
    set_type: string;
    status: string;
    progression_enabled: number;
    target_load_kg: number | null;
    target_reps_max: number | null;
    actual_load_kg: number | null;
    actual_reps: number | null;
  }>(sql`
    WITH mine AS (
      SELECT DISTINCT ${sessionSet.exerciseId} AS exercise_id
      FROM ${sessionSet}
      JOIN ${sessionBlock} ON ${sessionSet.sessionBlockId} = ${sessionBlock.id}
      WHERE ${sessionBlock.sessionId} = ${currentSessionId}
        AND ${sessionSet.exerciseId} IS NOT NULL
    ),
    candidate AS (
      SELECT DISTINCT
        ${sessionSet.exerciseId} AS exercise_id,
        ${session.id} AS session_id,
        ${session.date} AS civil_date,
        ${session.startedAt} AS started_at
      FROM ${sessionSet}
      JOIN ${sessionBlock} ON ${sessionSet.sessionBlockId} = ${sessionBlock.id}
      JOIN ${session} ON ${sessionBlock.sessionId} = ${session.id}
      WHERE ${sessionSet.setType} = 'work'
        AND ${session.status} = 'done'
        AND ${session.id} <> ${currentSessionId}
        AND ${sessionSet.exerciseId} IN (SELECT exercise_id FROM mine)
    ),
    latest AS (
      SELECT exercise_id, session_id FROM (
        SELECT exercise_id, session_id,
               ROW_NUMBER() OVER (
                 PARTITION BY exercise_id
                 ORDER BY civil_date DESC, started_at DESC
               ) AS rn
        FROM candidate
      )
      WHERE rn = 1
    )
    SELECT
      latest.exercise_id AS exercise_id,
      ${exercise.incrementKg} AS increment_kg,
      ${sessionSet.setType} AS set_type,
      ${sessionSet.status} AS status,
      ${sessionSet.progressionEnabled} AS progression_enabled,
      ${sessionSet.targetLoadKg} AS target_load_kg,
      ${sessionSet.targetRepsMax} AS target_reps_max,
      ${sessionSet.actualLoadKg} AS actual_load_kg,
      ${sessionSet.actualReps} AS actual_reps
    FROM latest
    JOIN ${exercise} ON ${exercise.id} = latest.exercise_id
    JOIN ${sessionBlock} ON ${sessionBlock.sessionId} = latest.session_id
    JOIN ${sessionSet} ON ${sessionSet.sessionBlockId} = ${sessionBlock.id}
      AND ${sessionSet.exerciseId} = latest.exercise_id
    WHERE ${sessionSet.setType} = 'work'
  `);

  /*
    Grouped here and folded by the domain rather than decided in SQL. The rule
    of specs 10.4 has five conditions with a reading behind each; as a WHERE
    clause they would be untestable in isolation, and D9 puts this calculation
    in the pure-function tier by name.
  */
  const byExercise = new Map<string, { increment: number; sets: ProgressionSet[] }>();
  for (const row of rows) {
    const current = byExercise.get(row.exercise_id) ?? {
      increment: row.increment_kg,
      sets: [],
    };
    current.sets.push({
      setType: isSetType(row.set_type) ? row.set_type : 'work',
      status: row.status,
      progressionEnabled: row.progression_enabled === 1 ? 1 : 0,
      targetLoadKg: row.target_load_kg,
      targetRepsMax: row.target_reps_max,
      loadKg: row.actual_load_kg,
      reps: row.actual_reps,
    });
    byExercise.set(row.exercise_id, current);
  }

  const suggestions: ProgressionSuggestions = new Map();
  for (const [exerciseId, held] of byExercise) {
    const suggestion = suggestProgression(held.sets, held.increment);
    if (suggestion !== null) suggestions.set(exerciseId, suggestion);
  }
  return suggestions;
}
