import { describe, expect, it } from 'vitest';
import {
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

/*
 * THE IDENTIFIER TESTS ARE GONE WITH THE IDENTIFIER.
 *
 * Slice 11 minted `rest:<sessionId>` for a local notification and these
 * assertions guarded an invisible property: no NOTIFICATION_KIND is a prefix of
 * it, so the daily planner could never cancel a rest mid-workout.
 *
 * Specs 14.40 removed the notification — the end of a rest vibrates instead and
 * nothing is scheduled. The property has no subject left, so the assertions are
 * deleted rather than pointed at a value nobody mints; the planner's own rule
 * is still held, with a foreign identifier, in tests/notifications/apply.test.
 */
