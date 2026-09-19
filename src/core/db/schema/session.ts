import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { EntityId } from '@/core/id';
import { exercise, type ExerciseId, type RoutineId, type SetType } from './strength';

/**
 * The live session (schema 2.6, specs 10.3, D12).
 *
 * Its own module rather than more of strength.ts, on the precedent recipes.ts
 * set against nutrition.ts: the dependency runs ONE WAY — session_set points at
 * exercise, nothing in strength.ts points back — and a session has a vocabulary
 * of its own (two statuses, activity segments) that exercises and routines
 * never use.
 *
 * ## `0010`, NOT `0009`, AND THE DOCUMENTS ARE WRONG ABOUT IT
 *
 * Architecture section 7 and amendment 9.15 no 1 both announce `0009` for these
 * tables. `0009` was spent on `0009_duration`, adding exercise.tracks_duration
 * and routine_line.duration_seconds after the slice 10 review. Both documents
 * are amended rather than quietly contradicted (architecture 9.24).
 *
 * ## WHAT IS IRREVERSIBLE HERE, AND THEREFORE WHY IT IS ALL IN `0010`
 *
 * Slice 3's rule: a migration carries what cannot be added later and defers
 * what can. SQLite does ALTER TABLE ADD COLUMN and CREATE/DROP INDEX freely; it
 * cannot add a CHECK or a foreign key without rebuilding the table. So the five
 * tables, their NOT NULL columns without default, their five foreign keys and
 * their CHECKs ship together. The indexes are not irreversible and are
 * explained where they sit.
 *
 * Deferring cost nothing and the test was the DIRECTION OF THE FOREIGN KEYS,
 * exactly as slice 10 wrote it: every key declared here points at `session`,
 * created in this same migration, or at `exercise`, which has existed since
 * `0008`. Nothing is rebuilt and nothing is ALTERed.
 *
 * And the rule the whole schema obeys: EVERY COLUMN MUST MAP TO A JSON SCALAR.
 * The exporter reads columns straight off these objects and throws on anything
 * that is not a string, a finite number or null, so Drizzle's mode mappings are
 * excluded here as everywhere else — progression_enabled is an integer typed
 * 0 | 1, never mode: 'boolean', and every instant is an epoch integer, never
 * mode: 'timestamp'.
 */

export type SessionId = EntityId<'session'>;
export type SessionSegmentId = EntityId<'session_segment'>;
export type SessionBlockId = EntityId<'session_block'>;
export type SessionSetId = EntityId<'session_set'>;
export type ExerciseNoteId = EntityId<'exercise_note'>;

/**
 * The two states of a session (schema 2.6).
 *
 * ## THIS ONE CARRIES A CHECK, AND IT IS NOT THE USUAL ARGUMENT
 *
 * Every other closed set in this schema was weighed on "what would widening it
 * break". This one is weighed on something narrower and harder: the uniqueness
 * index below is PARTIAL, `WHERE status = 'in_progress'`, and a partial index
 * constrains nothing at all about a row whose status says something else.
 *
 * So an archive carrying two sessions at status 'running' would import
 * cleanly, and the application would hold two live sessions — the exact thing
 * D12 says must be impossible, arrived at by the exact route D12 says to avoid
 * ("pas par une vérification applicative, qu'un écran distrait ou une condition
 * de course peut contourner").
 *
 * THE INVARIANT IS THEREFORE THE PAIR, never the index alone: the CHECK is what
 * makes the partial index total. Neither half is sufficient and this is the
 * only place in the schema where that is true of an index.
 *
 * Second, smaller reason to prefer having it: a unique index does not name
 * itself in its error, it names the column — "UNIQUE constraint failed:
 * session.status", found by execution in slice 8. A CHECK says its own name, so
 * whoever repairs an archive by hand is told which rule they broke.
 */
export const SESSION_STATUSES = ['in_progress', 'done'] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * The state of one set within a session (schema 2.6).
 *
 * ## NO CHECK, AND IT IS SLICE 10's set_type ARGUMENT VERBATIM
 *
 * > Définition du volume : charge × répétitions, sur les séries de travail
 * > validées uniquement.
 *
 * That is a POSITIVE clause — WHERE set_type = 'work' AND status = 'done' — so
 * a fifth status is simply not counted, which is the right default for a status
 * nobody has defined a volume rule for. Compare journal_entry.kind, whose macro
 * SUM has no clause at all and is correct only because the set is closed:
 * widening THAT one silently produces a wrong total.
 *
 * The difference from SESSION_STATUSES one declaration up is the uniqueness
 * index, which exists there and does not exist here. Nothing about a set is
 * enforced by a partial index, so nothing about a set escapes by widening.
 */
export const SET_STATUSES = ['pending', 'done', 'skipped'] as const;

export type SetStatus = (typeof SET_STATUSES)[number];

/**
 * One workout, live or finished (schema 2.6, specs 10.3).
 *
 * ## `routine_id` IS INFORMATIVE, `routine_name_snapshot` IS THE TRUTH
 *
 * Specs 5.2 makes a session "un snapshot de la routine au démarrage". So the
 * name is frozen and the id carries NO foreign key, on the precedent
 * day.template_id_snapshot and journal_entry.source_food_id both set: a live
 * link would let deleting a routine either destroy history (CASCADE) or block a
 * deletion specs 5.3 says is never blocked (RESTRICT), and ON DELETE SET NULL
 * would erase the only trace of what the session came from.
 *
 * Both are nullable: specs 10.3 has no requirement that a session come from a
 * routine at all, and starting empty then adding exercises live is a path 10.3
 * describes in as many words ("Ajout d'exercice ou de bloc en direct").
 *
 * ## THE DURATION IS NOT HERE, AND THAT IS D9
 *
 * There is no duration column and there must never be one. The duration is the
 * sum of session_segment, derived on read. D12 says so twice, and the reason it
 * matters is specs 10.3's own: a session resumed after three days would report
 * 72 hours if it were `ended_at - started_at`.
 *
 * `started_at` and `ended_at` are kept anyway, because they answer a different
 * question from the segments — when the workout happened, as against how long
 * of it was work. `date` is the CIVIL date of the start (D3): an instant never
 * decides which day something belongs to.
 */
export const session = sqliteTable(
  'session',
  {
    id: text('id').$type<SessionId>().primaryKey(),
    /** Civil date of the start (D3). Never derived from an instant on read. */
    date: text('date').notNull(),
    /** Informative, without a live link — the snapshot is the name. */
    routineId: text('routine_id').$type<RoutineId>(),
    routineNameSnapshot: text('routine_name_snapshot'),
    status: text('status').$type<SessionStatus>().notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    notes: text('notes'),
    createdAt: integer('created_at'),
    updatedAt: integer('updated_at'),
  },
  (table) => [
    /** See SESSION_STATUSES: half of the single-session invariant. */
    check('ck_session_status', sql`${table.status} IN ('in_progress', 'done')`),
    /**
     * A session that ended before it started makes every derived figure
     * negative. The precedent is ck_weight_goal_terms: a state nothing can read
     * is better made inexpressible than left to a write path to remember.
     */
    check('ck_session_order', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
    /**
     * ONE SESSION IN PROGRESS, CARRIED BY THE DATABASE (specs 10.3, D12).
     *
     * ## WHY THIS INDEX IS SAFE HERE WHERE day_meal's WAS REFUSED
     *
     * Slice 5 refused a partial unique index on day_meal for a reason that
     * sounds like it would apply to any such index: a database in service
     * already held rows that violated it, so the index would have failed to
     * BUILD on exactly the data it existed to protect.
     *
     * This table is new. No row exists in any database or any archive
     * anywhere, so it always builds. That is weight_goal.is_active's argument
     * from slice 8, word for word, and it is the whole difference.
     *
     * ## AND WHY IT SURVIVES AN IMPORT
     *
     * The import builds a NEW database from the schema and replays the
     * migrations (D7, G4), so this index exists before the first row lands. An
     * archive carrying two live sessions therefore fails at the fill, loudly,
     * while the current database is still intact behind the swap — rather than
     * loading quietly and leaving the application with two sessions it has no
     * way to choose between.
     *
     * Repairing instead of refusing was considered and refused: it would mean
     * inventing which of the two was the real one.
     */
    uniqueIndex('ux_session_active')
      .on(table.status)
      .where(sql`${table.status} = 'in_progress'`),
    /**
     * Section 2.6 declares it, and slice 12 reads it for the history list.
     * Not irreversible — an index never is — so it ships with a caller in
     * sight rather than on symmetry.
     */
    index('ix_session_date').on(table.date),
  ],
);

/**
 * One interval of actual work (schema 2.6, specs 10.3, D12).
 *
 * ## WHY A SEGMENT IS CLOSED BY THE NEXT WRITE AND NEVER BY A TIMER
 *
 * D12 says a segment closes "après 30 minutes sans aucune écriture". Read as an
 * instruction to a timer, that is unimplementable here: nothing of this
 * application runs while it is backgrounded or killed, and specs 2.2 requires
 * surviving a force quit at any moment. A timer would simply not fire, and the
 * segment would stay open for three days.
 *
 * So the end of a segment is STAMPED BY THE WRITE THAT FOLLOWS THE GAP. On
 * every write: if more than the threshold has passed since the last one, close
 * the open segment AT THE LAST WRITE and open a new one at now; otherwise
 * extend the open one to now. The consequence is the property that matters —
 * `ended_at` is always an instant at which something actually happened, so a
 * session left open overnight never counts the night, and no code has to run
 * during the gap for that to be true.
 *
 * `ended_at` is nullable and that is the OPEN segment, the one being extended.
 * A session killed mid-segment leaves it open, and the next write closes it
 * correctly — which is why nothing is lost by dying.
 */
export const sessionSegment = sqliteTable(
  'session_segment',
  {
    id: text('id').$type<SessionSegmentId>().primaryKey(),
    sessionId: text('session_id')
      .$type<SessionId>()
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at').notNull(),
    /** NULL is the open segment. */
    endedAt: integer('ended_at'),
  },
  (table) => [
    /**
     * The duration is the SUM of these rows, so a segment ending before it
     * starts does not produce a wrong-looking figure — it produces a plausible
     * one that is quietly too small, which is the bar a CHECK has to clear.
     */
    check('ck_segment_order', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
    /** Every read of a session sums its segments; this is that read. */
    index('ix_segment_session').on(table.sessionId),
  ],
);

/**
 * A block of the session: one exercise, or several as a superset (specs 10.3).
 *
 * The session's own copy of routine_block, taken at start. It holds no
 * exercise: the exercise is on the SET, because a superset block has several.
 * A block is a SHAPE — what rests together — not a movement.
 *
 * `rest_seconds` here rather than on the set, which is slice 10's correction
 * applied at the source rather than re-derived: the block owns the rest in
 * every form, superset or not, because nobody rests differently between two
 * sets of the same exercise. session_set carries one too, for the archive
 * reason routine_line does — see there.
 */
export const sessionBlock = sqliteTable(
  'session_block',
  {
    id: text('id').$type<SessionBlockId>().primaryKey(),
    sessionId: text('session_id')
      .$type<SessionId>()
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    restSeconds: integer('rest_seconds'),
  },
  (table) => [
    check('ck_session_block_rest', sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`),
    index('ix_session_block_session').on(table.sessionId),
  ],
);

/**
 * One set: the target frozen at start, and what was actually done (schema 2.6).
 *
 * ## exercise_id IS A LIVE LINK AND exercise_name_frozen IS NOT — D5/R4
 *
 * Section 2.6 calls the link "VIVANT, exception D5/R4", and the pair of columns
 * is the whole mechanism: the id is NULLABLE, the name is NOT NULL. So deleting
 * an exercise breaks the link and keeps the name, and a session from two years
 * ago still says what was performed.
 *
 * THIS IS NOT AUTOMATIC AND deleteExercise CARRIES IT. The foreign key is
 * NO ACTION, which BLOCKS the delete — and specs 5.3 says no deletion is ever
 * blocked. Exactly the contradiction routine_line.exercise_id and
 * recipe_ingredient.food_id both resolve the same way: the key is the NET, the
 * transaction is the POLICY. deleteExercise() nulls this column for every set
 * that names the exercise, then deletes. Simplify that one day and the database
 * refuses loudly instead of an archive quietly losing what it recorded.
 *
 * ON DELETE SET NULL would do the same work automatically and is refused for
 * the reason slice 3 refused it on journal_entry.source_food_id: specs 5.3
 * wants "un avertissement nommant explicitement ce qui sera perdu", and to name
 * it the application has to count it first. Having counted, it can null what it
 * announced. A cascade or a SET NULL would leave the warning guessing.
 *
 * ## position IS EXECUTION ORDER AND set_index IS THE ROUND
 *
 * Both copied from routine_line, which means the reading slice 10 REVERSED on
 * 17/09 (architecture 9.18 no 1) is the one that applies: a superset is stored
 * interleaved, A,B,A,B, because that is the only order it is ever performed in.
 * A session that stored one order while the routine page showed another would
 * be two answers to one question, and the session is the side that executes.
 *
 * ## THE DURATION COLUMNS ARE A DIVERGENCE FROM SECTION 2.6, AND THEY MUST BE
 *
 * Section 2.6 predates `0009`: it describes a set only by its repetitions,
 * exactly as specs 6.3 did before slice 10 added exercise.tracks_duration for
 * a plank. Without these two columns a timed exercise could be put in a routine
 * and then not be performed — the feature would be dead on the one screen it
 * exists for. Amended rather than worked around (architecture 9.24).
 *
 * Two columns and not one, target and actual, because that is what every other
 * pair on this table does and because the whole point of a session is the gap
 * between what was planned and what happened.
 */
export const sessionSet = sqliteTable(
  'session_set',
  {
    id: text('id').$type<SessionSetId>().primaryKey(),
    sessionBlockId: text('session_block_id')
      .$type<SessionBlockId>()
      .notNull()
      .references(() => sessionBlock.id, { onDelete: 'cascade' }),
    /** Live link, nullable: deleteExercise() nulls it and the name survives. */
    exerciseId: text('exercise_id')
      .$type<ExerciseId>()
      .references(() => exercise.id),
    /** Survives the exercise. NOT NULL is what makes the pair work. */
    exerciseNameFrozen: text('exercise_name_frozen').notNull(),
    position: integer('position').notNull(),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type').$type<SetType>().notNull(),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    targetLoadKg: real('target_load_kg'),
    targetRir: real('target_rir'),
    /** Target seconds for an exercise measured in time (slice 10's flag). */
    targetDurationSeconds: integer('target_duration_seconds'),
    /**
     * Kept for the reason routine_line.rest_seconds is kept: section 2.6 puts
     * it here, and the block is what the application writes. A row carrying one
     * is displayed, never corrected.
     */
    restSeconds: integer('rest_seconds'),
    /** 0 or 1, never a boolean: every column must map to a JSON scalar. */
    progressionEnabled: integer('progression_enabled').$type<0 | 1>().notNull().default(0),
    actualReps: integer('actual_reps'),
    actualLoadKg: real('actual_load_kg'),
    actualRir: real('actual_rir'),
    /** What was actually held, for a timed exercise. */
    actualDurationSeconds: integer('actual_duration_seconds'),
    status: text('status').$type<SetStatus>().notNull(),
    completedAt: integer('completed_at'),
  },
  (table) => [
    check('ck_set_progression', sql`${table.progressionEnabled} IN (0, 1)`),
    /**
     * An inverted target range puts the "haut de la plage" of specs 10.4 below
     * its bottom, so the progression suggestion fires when it should not.
     * ck_line_reps, copied, because the defect copies with the column.
     */
    check(
      'ck_set_target_reps',
      sql`${table.targetRepsMin} IS NULL OR ${table.targetRepsMax} IS NULL OR ${table.targetRepsMin} <= ${table.targetRepsMax}`,
    ),
    /**
     * Zero is legitimate on every actual: a bodyweight movement has no load,
     * and a set attempted and failed has zero repetitions. Negative is not.
     */
    check('ck_set_actual_reps', sql`${table.actualReps} IS NULL OR ${table.actualReps} >= 0`),
    check('ck_set_actual_load', sql`${table.actualLoadKg} IS NULL OR ${table.actualLoadKg} >= 0`),
    check('ck_set_actual_rir', sql`${table.actualRir} IS NULL OR ${table.actualRir} >= 0`),
    check('ck_set_rest', sql`${table.restSeconds} IS NULL OR ${table.restSeconds} >= 0`),
    /**
     * NO CHECK PAIRS status WITH completed_at, and that is deliberate. "Done
     * implies an instant" is a rule of the write path; an archive repaired by
     * hand that lost one timestamp should import and read as done, not fail on
     * a constraint. Slice 4's line: being slightly too permissive costs a
     * refused row, being too strict costs a feature that never works again.
     */

    /**
     * Section 2.6 declares it, and it is the index slice 12's per-exercise
     * history and records are built on — "charge maximale, 1RM estimé, meilleur
     * volume" all read this table by exercise, in date order.
     *
     * Its first caller is here, though: deleteExercise() counts the sets naming
     * an exercise so the warning of specs 5.3 can say how many.
     */
    index('ix_set_exercise').on(table.exerciseId, table.completedAt),
    /** Reading a session reads its sets by block; this is that read. */
    index('ix_set_block').on(table.sessionBlockId),
  ],
);

/**
 * A note written for the next session containing this exercise (specs 6.3).
 *
 * Specified since 6.3 and placed in the live session by 10.3 ("Note d'exercice
 * pour la prochaine séance"), which is why slice 10 left it here rather than
 * treating it as a gap.
 *
 * ## `consumed_at` MARKS, IT DOES NOT DELETE, AND NO DOCUMENT SAYS WHICH
 *
 * Neither 6.3 nor 10.3 says what consuming a note does to it. Marking is
 * chosen, and the reason is specs 5.2: the history is never rewritten. A note
 * is something the user wrote; deleting it on their behalf, because a screen
 * happened to display it, destroys it without anybody asking. Marked, it stops
 * being offered and stays readable.
 *
 * CASCADE, because a note has no existence apart from its exercise — unlike a
 * session_set, which is history and outlives it.
 */
export const exerciseNote = sqliteTable(
  'exercise_note',
  {
    id: text('id').$type<ExerciseNoteId>().primaryKey(),
    exerciseId: text('exercise_id')
      .$type<ExerciseId>()
      .notNull()
      .references(() => exercise.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: integer('created_at'),
    /** NULL while the note is still waiting for its session. */
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    /** "The unconsumed notes of this exercise" is the only read there is. */
    index('ix_note_exercise').on(table.exerciseId, table.consumedAt),
  ],
);

export type SessionRow = typeof session.$inferSelect;
export type SessionSegmentRow = typeof sessionSegment.$inferSelect;
export type SessionBlockRow = typeof sessionBlock.$inferSelect;
export type SessionSetRow = typeof sessionSet.$inferSelect;
export type ExerciseNoteRow = typeof exerciseNote.$inferSelect;
