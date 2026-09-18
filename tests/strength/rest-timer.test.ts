import { describe, expect, it } from 'vitest';
import type { SessionId } from '../../src/core/db/schema';
import { NOTIFICATION_KINDS } from '../../src/core/db/schema';
import {
  restNotificationId,
  restWindow,
  type RestingSet,
} from '../../src/features/strength/domain/rest-timer';

/**
 * The rest timer (specs 9.3, 10.3, D12).
 *
 * All of it is derived, so all of it is testable: the countdown is a function
 * of session_set.completed_at and the block's rest, and D12's "aucun compteur
 * n'est stocké" costs nothing to obey because the instant of departure was
 * already written.
 */

const START = 1_789_600_000_000;
const SECOND = 1000;

function done(completedAt: number): RestingSet {
  return { completedAt, status: 'done' };
}

const pending: RestingSet = { completedAt: null, status: 'pending' };

describe('the rest in progress', () => {
  it('starts at the instant the set was validated', () => {
    const window = restWindow(
      [{ restSeconds: 90, sets: [done(START), pending] }],
      START + 10 * SECOND,
    );

    expect(window).toEqual({ startedAt: START, endsAt: START + 90 * SECOND });
  });

  it('is null before anything has been validated', () => {
    expect(restWindow([{ restSeconds: 90, sets: [pending, pending] }], START)).toBeNull();
  });

  it('is null once it has elapsed', () => {
    // A window that closed is not a window: the caller shows nothing rather
    // than a negative countdown, and the notification has already fired.
    expect(restWindow([{ restSeconds: 90, sets: [done(START)] }], START + 90 * SECOND)).toBeNull();
    expect(
      restWindow([{ restSeconds: 90, sets: [done(START)] }], START + 200 * SECOND),
    ).toBeNull();
  });

  it('is null when the block prescribes no rest', () => {
    // Not zero, not a default: a block with no rest is a block that asked for
    // none, and inventing ninety seconds would start a countdown nobody set.
    expect(restWindow([{ restSeconds: null, sets: [done(START)] }], START + SECOND)).toBeNull();
    expect(restWindow([{ restSeconds: 0, sets: [done(START)] }], START + SECOND)).toBeNull();
  });

  it('follows the LAST set validated, across blocks', () => {
    /**
     * Not "the current block": a workout can be performed out of order, and the
     * set that started resting is the one that was just finished wherever it
     * sits. The rest that applies is that block's, which is the superset rule
     * of specs 14.21 no 3 read from the other end.
     */
    const window = restWindow(
      [
        { restSeconds: 90, sets: [done(START)] },
        { restSeconds: 180, sets: [done(START + 60 * SECOND)] },
      ],
      START + 70 * SECOND,
    );

    expect(window).toEqual({
      startedAt: START + 60 * SECOND,
      endsAt: START + 60 * SECOND + 180 * SECOND,
    });
  });

  it('ignores a skipped set, which started no rest', () => {
    const skipped: RestingSet = { completedAt: null, status: 'skipped' };

    expect(restWindow([{ restSeconds: 90, sets: [skipped] }], START)).toBeNull();
  });
});

describe('the identifier, and the collision that must not exist', () => {
  it('is one per session, so the next set REPLACES it', () => {
    /**
     * Specs 9.3: "programmée à la validation d'une série et annulée à la
     * validation de la suivante". Keyed on the session rather than on the set,
     * the replacement happens by identity and nobody has to cancel anything —
     * the device applyPlan uses for the daily kinds.
     */
    const id = restNotificationId('session-1' as SessionId);

    expect(id).toBe('rest:session-1');
    expect(restNotificationId('session-1' as SessionId)).toBe(id);
    expect(restNotificationId('session-2' as SessionId)).not.toBe(id);
  });

  it('IS NOT A NOTIFICATION KIND, AND NO KIND CLAIMS IT', () => {
    /**
     * THE PROPERTY THAT IS INVISIBLE IN THE CODE THAT DEPENDS ON IT.
     *
     * diffSchedule decides what the daily planner owns with
     * `NOTIFICATION_KINDS.some(kind => id.startsWith(kind + ':'))`, and
     * cancels everything it owns that is not in the plan — on every foreground
     * and every invalidation the bus raises.
     *
     * Slice 9 wrote a whole paragraph anticipating this: adding `rest_timer` to
     * NOTIFICATION_KINDS would hand the rest timer to a scheduler that has
     * never heard of it, which would cancel it mid-workout. Nothing would
     * report it — the timer simply would not ring.
     *
     * And BOTH the schema comment on notification_setting and the export
     * catalogue explicitly invite that addition ("slice 11 adds a kind here for
     * the rest timer"). They are wrong, and this is what says so.
     */
    const id = restNotificationId('session-1' as SessionId);
    for (const kind of NOTIFICATION_KINDS) {
      expect(id.startsWith(`${kind}:`), `${kind} would claim the rest timer`).toBe(false);
    }
  });
});
