import { and, eq, isNull, sql } from 'drizzle-orm';
import type { LocalDate } from '@/core/date';
import type { AppDatabase } from '@/core/db/database';
import { newId } from '@/core/id';
import {
  exercise,
  exerciseNote,
  session,
  sessionBlock,
  sessionSegment,
  sessionSet,
  type ExerciseId,
  type ExerciseNoteId,
  type RoutineId,
  type SessionBlockId,
  type SessionId,
  type SessionSegmentId,
  type SessionSetId,
  type SetType,
} from '@/core/db/schema';
import {
  SESSION_ACTIVE_GAP_MS,
  segmentActionFor,
} from '../domain/session-activity';
import type { RecordedSet } from '../domain/session-set';
import type { SessionPlan } from '../domain/session-plan';

/**
 * Writes on a live session (specs 10.3), transactional by rule.
 *
 * ## EVERY WRITE TOUCHES THE SEGMENTS, IN ITS OWN TRANSACTION
 *
 * D12's two rhythms — immediate on a validated set, deferred for fields being
 * typed — differ in WHEN they are called, never in what they do. Both go
 * through touchSession(), and both are one transaction.
 *
 * The transaction is not decoration. A set validated and a segment extended are
 * one fact: killed between them, the application would hold a recorded set
 * whose time nothing accounts for, or a segment covering work nothing recorded.
 * Specs 2.2 makes a force quit possible at every instant, so "between them" is
 * a real place.
 */

/** Starting a session can fail for one reason the user can act on. */
export type StartSessionResult =
  | { ok: true; id: SessionId }
  | { ok: false; reason: 'already_in_progress'; id: SessionId };

/**
 * The instant everything in this session is measured from.
 *
 * Taken ONCE per write and passed down, rather than each statement calling the
 * clock. Two reads of Date.now() inside one transaction can differ, and the
 * difference would land between a set's completed_at and the segment that is
 * supposed to contain it — a set completed a millisecond after the work
 * stopped. The same reason day-writes takes its instant at the top.
 */
export interface WriteClock {
  now: number;
}

/**
 * Opens or extends the activity segment, and stamps the session.
 *
 * THE ONE PLACE THE SEGMENT RULE IS APPLIED. Every write calls it, so no write
 * site has to remember the thirty minutes and none of them can disagree about
 * it — the arrangement restForBlock has for the rest, and prefillQuantity for
 * the last quantity.
 *
 * Reads the maximum `ended_at` rather than "the row with no end": since this
 * slice, an open segment carries its end at all times and NULL means an archive
 * (see session-activity.ts). MAX is therefore the honest question, and it
 * answers correctly for both shapes.
 */
function touchSession(tx: AppDatabase, sessionId: SessionId, clock: WriteClock): void {
  const [latest] = tx
    .select({
      id: sessionSegment.id,
      // COALESCE, so a NULL from an archive reads as a zero-length segment
      // rather than dropping the row out of the MAX entirely.
      endedAt: sql<number | null>`max(coalesce(${sessionSegment.endedAt}, ${sessionSegment.startedAt}))`,
    })
    .from(sessionSegment)
    .where(eq(sessionSegment.sessionId, sessionId))
    .all();

  const action = segmentActionFor(latest?.endedAt ?? null, clock.now, SESSION_ACTIVE_GAP_MS);

  if (action.kind === 'open') {
    tx
      .insert(sessionSegment)
      .values({
        id: newId<SessionSegmentId>(),
        sessionId,
        startedAt: action.startedAt,
        // A new segment ends where it starts: zero length until the next write
        // extends it. Never NULL, which is what makes a force quit right here
        // cost nothing.
        endedAt: action.startedAt,
      })
      .run();
  } else {
    // Extend the segment that holds the latest end. Addressed by that end
    // rather than by an id read separately, so two writes racing cannot extend
    // different rows.
    tx
      .update(sessionSegment)
      .set({ endedAt: action.endedAt })
      .where(
        and(
          eq(sessionSegment.sessionId, sessionId),
          eq(
            sql`coalesce(${sessionSegment.endedAt}, ${sessionSegment.startedAt})`,
            latest?.endedAt ?? 0,
          ),
        ),
      )
      .run();
  }

  tx.update(session).set({ updatedAt: clock.now }).where(eq(session.id, sessionId)).run();
}

/**
 * Starts a session from a plan (specs 10.3).
 *
 * ## THE REFUSAL IS A VALUE, THE GUARANTEE IS THE INDEX
 *
 * Section 4: "une erreur attendue est une valeur de retour, pas une exception".
 * Two people cannot start two sessions here, but one person can tap a routine's
 * start button while a session is already running, and that is an expected
 * state with a sentence attached — "reprendre la séance en cours ?".
 *
 * So this reads first and returns a refusal naming the live session. What makes
 * that safe rather than a check somebody can race is that it is NOT the
 * barrier: ux_session_active is, and it is inside the same transaction. The
 * read exists to give the screen something to say, not to protect the
 * invariant — which is exactly the division D12 asks for.
 */
export function startSession(
  db: AppDatabase,
  input: {
    date: LocalDate;
    routineId: RoutineId | null;
    plan: SessionPlan;
  },
  clock: WriteClock,
): StartSessionResult {
  return db.transaction((tx) => {
    const [live] = tx
      .select({ id: session.id })
      .from(session)
      .where(eq(session.status, 'in_progress'))
      .all();
    if (live !== undefined) {
      return { ok: false, reason: 'already_in_progress', id: live.id } as const;
    }

    const id = newId<SessionId>();
    tx
      .insert(session)
      .values({
        id,
        date: input.date,
        routineId: input.routineId,
        routineNameSnapshot: input.plan.routineName,
        status: 'in_progress',
        startedAt: clock.now,
        createdAt: clock.now,
        updatedAt: clock.now,
      })
      .run();

    input.plan.blocks.forEach((block, blockIndex) => {
      const blockId = newId<SessionBlockId>();
      tx
        .insert(sessionBlock)
        .values({
          id: blockId,
          sessionId: id,
          position: blockIndex,
          restSeconds: block.restSeconds,
        })
        .run();

      block.sets.forEach((set, setPosition) => {
        tx
          .insert(sessionSet)
          .values({
            id: newId<SessionSetId>(),
            sessionBlockId: blockId,
            exerciseId: set.exerciseId,
            exerciseNameFrozen: set.exerciseName,
            position: setPosition,
            setIndex: set.setIndex,
            setType: set.setType,
            targetRepsMin: set.targetRepsMin,
            targetRepsMax: set.targetRepsMax,
            targetLoadKg: set.targetLoadKg,
            targetRir: set.targetRir,
            targetDurationSeconds: set.targetDurationSeconds,
            // Written NULL always: the block owns the rest in every shape, and
            // storing it twice would leave two numbers and no rule saying which
            // wins. Same position as routine_line.rest_seconds.
            restSeconds: null,
            progressionEnabled: set.progressionEnabled ? 1 : 0,
            status: 'pending',
          })
          .run();
      });
    });

    // The first segment opens with the session: starting IS the first act, and
    // a session whose first set comes twenty minutes later did not begin then.
    touchSession(tx, id, clock);
    return { ok: true, id } as const;
  });
}

/**
 * Validates a set — the immediate, synchronous rhythm of D12.
 *
 * > Écriture immédiate et synchrone à la validation d'une série.
 *
 * Called when a RIR is entered (specs 10.3, "la saisie du RIR valide
 * automatiquement la série"). What gets recorded is decided by recordSet() in
 * the domain, so the rule about untouched fields lives where it can be tested
 * and this function only writes.
 */
export function completeSet(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  recorded: RecordedSet,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx
      .update(sessionSet)
      .set({
        actualReps: recorded.reps,
        actualLoadKg: recorded.loadKg,
        actualDurationSeconds: recorded.durationSeconds,
        actualRir: recorded.rir,
        status: 'done',
        completedAt: clock.now,
      })
      .where(eq(sessionSet.id, setId))
      .run();

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Takes a validated set back to pending (specs 10.3, "reste éditable").
 *
 * ## WHY THIS HAD TO EXIST BEFORE A SET COULD BE CORRECTED
 *
 * Slice 11 shipped a row that stopped being a form once validated, on the
 * theory that "correcting is the business of the finished session, not of the
 * row you have moved past". Requested changed (specs 14.38): you notice the
 * wrong load one set later, not one session later.
 *
 * Editing the FIELDS of a done set needs nothing new — saveTypedSet never
 * touched `status`, so it updates the recorded values and leaves the set done.
 * What needed a write is the other direction: saying a set did not happen after
 * all.
 *
 * ## `completed_at` IS CLEARED, AND THAT IS NOT BOOKKEEPING
 *
 * It is the instant the rest timer counts from (D12), and the index
 * `ix_set_exercise` is built on it. A set that is no longer done must not
 * anchor a rest, and must not appear in a history of things that were lifted.
 *
 * ## THE RECORDED VALUES STAY
 *
 * Reopening a set to fix its reps must not lose its load or its RIR. They are
 * what the fields then show, which is the whole point of reopening it.
 */
export function reopenSet(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx
      .update(sessionSet)
      .set({ status: 'pending', completedAt: null })
      .where(eq(sessionSet.id, setId))
      .run();

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Records the RIR of a set, without deciding whether the set happened.
 *
 * ## WHY IT IS ITS OWN WRITE AND ITS OWN COLUMN NOW
 *
 * Slice 11 made the RIR the ACT of validating: picking a number completed the
 * set. That is two things in one control, and the second one is unreachable —
 * there was no way to change a RIR you had just mis-tapped, and no way to say
 * "three" before doing the set. Requested split (specs 14.38): a RIR column and
 * a validation button.
 *
 * ## WRITTEN IMMEDIATELY, LIKE A VALIDATION AND UNLIKE TYPING
 *
 * D12 gives two rhythms and the line between them is not the table it touches:
 * it is whether the act is DISCRETE. Typing a load is a stream of keystrokes
 * and is debounced; choosing a RIR from eight buttons is one decision, so it is
 * written the way validating is — and survives a kill for the same reason.
 *
 * ## IT DOES NOT TOUCH `status`
 *
 * A RIR on a pending set is a plan, on a done set a correction, and neither is
 * a statement that the set was performed. That statement has its own button.
 */
export function setSetRir(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  rir: number,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx.update(sessionSet).set({ actualRir: rir }).where(eq(sessionSet.id, setId)).run();

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Saves what is being typed — the deferred rhythm of D12.
 *
 * > Écriture différée d'une fraction de seconde pour les champs en cours de
 * > frappe, vidée systématiquement au passage en arrière-plan.
 *
 * ## WHAT A LOST FLUSH CAN COST, STATED RATHER THAN PROMISED AWAY
 *
 * iOS can kill the application without running this. What is then lost is the
 * few hundred milliseconds of typing in ONE field — half a load, half a rep
 * count. Never a validated set, which goes through completeSet synchronously;
 * never the session, its blocks or its sets, which exist from the start.
 *
 * The tempting hardening is to drop the debounce to zero, and it is refused:
 * that is the immediate path with extra steps, and a write per keystroke on the
 * one screen specs 10.3 says must survive anything.
 *
 * The set stays `pending` — typing a load is not performing the set. Only a RIR
 * validates (specs 10.3).
 */
export function saveTypedSet(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  typed: { reps: number | null; loadKg: number | null; durationSeconds: number | null },
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx
      .update(sessionSet)
      .set({
        actualReps: typed.reps,
        actualLoadKg: typed.loadKg,
        actualDurationSeconds: typed.durationSeconds,
      })
      .where(eq(sessionSet.id, setId))
      .run();

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Marks a set as skipped, or takes the mark back.
 *
 * `skipped` rather than deleted, because the set was PRESCRIBED and not doing
 * it is a fact about the workout. Deleting it would make the session look like
 * it never asked — and specs 10.6 counts sets per session.
 */
export function setSkipped(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  skipped: boolean,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx
      .update(sessionSet)
      .set({
        status: skipped ? 'skipped' : 'pending',
        // Un-skipping returns the row to untouched: a skipped set records
        // nothing, so there is nothing to keep.
        completedAt: null,
        actualReps: null,
        actualLoadKg: null,
        actualDurationSeconds: null,
        actualRir: null,
      })
      .where(eq(sessionSet.id, setId))
      .run();

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Adds one more set to a block, live (specs 10.3).
 *
 * In a superset this is "ajouter un tour" — one set of EACH exercise — because
 * half a round of a superset is not something anybody trains (specs 14.23 no 1).
 * The caller says which exercises; this writes them in the block's own order,
 * which is what keeps the interleaving A,B,A,B.
 *
 * The targets are copied from the LAST set of the same exercise in the block:
 * an extra set of an exercise is another set of that exercise, and starting it
 * blank would make the commonest live action the one that asks the most.
 */
export function addRound(
  db: AppDatabase,
  blockId: SessionBlockId,
  sessionId: SessionId,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    const sets = tx
      .select()
      .from(sessionSet)
      .where(eq(sessionSet.sessionBlockId, blockId))
      .orderBy(sessionSet.position)
      .all();
    if (sets.length === 0) return;

    let position = sets.length;
    const seen = new Set<string>();
    // The exercises in the order they first appear, which is the order a round
    // is performed in.
    for (const set of sets) {
      const key = set.exerciseId ?? set.exerciseNameFrozen;
      if (seen.has(key)) continue;
      seen.add(key);

      const previous = [...sets].reverse().find((candidate) => {
        const candidateKey = candidate.exerciseId ?? candidate.exerciseNameFrozen;
        return candidateKey === key;
      });
      if (previous === undefined) continue;

      tx
        .insert(sessionSet)
        .values({
          id: newId<SessionSetId>(),
          sessionBlockId: blockId,
          exerciseId: previous.exerciseId,
          exerciseNameFrozen: previous.exerciseNameFrozen,
          position,
          setIndex: previous.setIndex + 1,
          setType: previous.setType,
          targetRepsMin: previous.targetRepsMin,
          targetRepsMax: previous.targetRepsMax,
          targetLoadKg: previous.targetLoadKg,
          targetRir: previous.targetRir,
          targetDurationSeconds: previous.targetDurationSeconds,
          restSeconds: null,
          progressionEnabled: previous.progressionEnabled,
          status: 'pending',
        })
        .run();
      position += 1;
    }

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Adds an exercise to the session as a new block, live (specs 10.3).
 *
 * A block of its own rather than a set appended to the last one: a superset is
 * a decision about what rests together, and appending would silently turn the
 * previous exercise into one.
 *
 * The name is frozen here, as it is at start: the snapshot of specs 5.2 covers
 * everything a session records, not only what came from the routine.
 */
export function addExerciseToSession(
  db: AppDatabase,
  sessionId: SessionId,
  exerciseId: ExerciseId,
  input: { sets: number; restSeconds: number | null; setType?: SetType },
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    const [found] = tx
      .select({ name: exercise.name, tracksDuration: exercise.tracksDuration })
      .from(exercise)
      .where(eq(exercise.id, exerciseId))
      .all();
    if (found === undefined) return;

    const [last] = tx
      .select({ position: sessionBlock.position })
      .from(sessionBlock)
      .where(eq(sessionBlock.sessionId, sessionId))
      .orderBy(sql`${sessionBlock.position} desc`)
      .limit(1)
      .all();

    const blockId = newId<SessionBlockId>();
    tx
      .insert(sessionBlock)
      .values({
        id: blockId,
        sessionId,
        position: (last?.position ?? -1) + 1,
        restSeconds: input.restSeconds,
      })
      .run();

    for (let index = 0; index < Math.max(1, input.sets); index += 1) {
      tx
        .insert(sessionSet)
        .values({
          id: newId<SessionSetId>(),
          sessionBlockId: blockId,
          exerciseId,
          exerciseNameFrozen: found.name,
          position: index,
          setIndex: index + 1,
          setType: input.setType ?? 'work',
          // Nothing prescribed: an exercise added live has no target, and the
          // fields say so with a dash rather than a guess.
          targetRepsMin: null,
          targetRepsMax: null,
          targetLoadKg: null,
          targetRir: null,
          targetDurationSeconds: null,
          restSeconds: null,
          progressionEnabled: 0,
          status: 'pending',
        })
        .run();
    }

    touchSession(tx, sessionId, clock);
  });
}

/**
 * Removes a set from a live session (specs 10.3, "balayage pour supprimer une
 * série").
 *
 * Deleting, unlike skipping: this is for a set that should not be there at all
 * — an extra round added by mistake — where skipping records that a prescribed
 * set was not done. Two different facts, two different actions.
 *
 * A block emptied by the removal goes with it, on deleteExercise's precedent: a
 * block with no sets renders as a row nobody can explain.
 */
export function removeSet(
  db: AppDatabase,
  setId: SessionSetId,
  sessionId: SessionId,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    const [target] = tx
      .select({ blockId: sessionSet.sessionBlockId })
      .from(sessionSet)
      .where(eq(sessionSet.id, setId))
      .all();
    if (target === undefined) return;

    tx.delete(sessionSet).where(eq(sessionSet.id, setId)).run();

    const remaining = tx
      .select({ id: sessionSet.id })
      .from(sessionSet)
      .where(eq(sessionSet.sessionBlockId, target.blockId))
      .all();
    if (remaining.length === 0) {
      tx.delete(sessionBlock).where(eq(sessionBlock.id, target.blockId)).run();
    }

    touchSession(tx, sessionId, clock);
  });
}

/** The free-text note of a session (specs 6.3, "Notes"). */
export function setSessionNotes(
  db: AppDatabase,
  sessionId: SessionId,
  notes: string,
  clock: WriteClock,
): void {
  db.transaction((tx) => {
    tx
      .update(session)
      .set({ notes: notes.trim() === '' ? null : notes })
      .where(eq(session.id, sessionId))
      .run();
    touchSession(tx, sessionId, clock);
  });
}

/**
 * Finishes a session (specs 10.3, "Une séance terminée reste éditable").
 *
 * The segment is touched FIRST, so the last thing that happened is inside it:
 * pressing "Terminer" is itself an act, and a session whose final segment ended
 * before its own ending would be a few seconds short of the truth.
 *
 * Consumes the notes written for the exercises it contained (specs 6.3, "note
 * d'exercice destinée à la prochaine séance le comportant"): this WAS that next
 * session. Marked, never deleted — a note is something the user wrote, and
 * removing it because a screen displayed it destroys it without asking.
 */
export function finishSession(db: AppDatabase, sessionId: SessionId, clock: WriteClock): void {
  db.transaction((tx) => {
    touchSession(tx, sessionId, clock);

    tx
      .update(session)
      .set({ status: 'done', endedAt: clock.now, updatedAt: clock.now })
      .where(eq(session.id, sessionId))
      .run();

    const performed = tx
      .select({ exerciseId: sessionSet.exerciseId })
      .from(sessionSet)
      .innerJoin(sessionBlock, eq(sessionSet.sessionBlockId, sessionBlock.id))
      .where(eq(sessionBlock.sessionId, sessionId))
      .all()
      .map((row) => row.exerciseId)
      .filter((id): id is ExerciseId => id !== null);

    for (const exerciseId of [...new Set(performed)]) {
      tx
        .update(exerciseNote)
        .set({ consumedAt: clock.now })
        .where(and(eq(exerciseNote.exerciseId, exerciseId), isNull(exerciseNote.consumedAt)))
        .run();
    }
  });
}

/**
 * Deletes a session (specs 10.3, "supprimable").
 *
 * No warning and none is owed: specs 5.3 reserves the one warning in this
 * application for deleting an EXERCISE, which breaks statistical continuity
 * across every session. Deleting one session removes one session, which is what
 * the button says.
 *
 * Its blocks, sets and segments cascade.
 */
export function deleteSession(db: AppDatabase, sessionId: SessionId): void {
  db.delete(session).where(eq(session.id, sessionId)).run();
}

/** Writes a note for the next session containing this exercise (specs 6.3). */
export function addExerciseNote(
  db: AppDatabase,
  exerciseId: ExerciseId,
  text: string,
  clock: WriteClock,
): void {
  const trimmed = text.trim();
  if (trimmed === '') return;
  db
    .insert(exerciseNote)
    .values({
      id: newId<ExerciseNoteId>(),
      exerciseId,
      text: trimmed,
      createdAt: clock.now,
    })
    .run();
}
