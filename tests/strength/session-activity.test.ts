import { describe, expect, it } from 'vitest';
import {
  SESSION_ACTIVE_GAP_MS,
  lastEnd,
  liveDurationMs,
  recordedDurationMs,
  segmentActionFor,
} from '../../src/features/strength/domain/session-activity';

/**
 * Activity segments — the mechanism that keeps a session's duration honest
 * (specs 10.3, D12).
 *
 * Every function takes `now`, so a thirty-minute gap is a number here rather
 * than a wait. That is the only reason this is testable at all: nothing in Node
 * can be backgrounded, killed and reopened.
 */

const MINUTE = 60_000;
const START = 1_789_600_000_000;

describe('what a write does to the segments', () => {
  it('opens the first one', () => {
    expect(segmentActionFor(null, START)).toEqual({ kind: 'open', startedAt: START });
  });

  it('extends the open one while writes keep coming', () => {
    expect(segmentActionFor(START, START + 5 * MINUTE)).toEqual({
      kind: 'extend',
      endedAt: START + 5 * MINUTE,
    });
  });

  it('still extends at exactly the threshold', () => {
    // The boundary is inclusive on the extending side, which is the direction
    // that keeps one workout one workout. Thirty minutes to the millisecond is
    // a long superset, not going home.
    expect(segmentActionFor(START, START + SESSION_ACTIVE_GAP_MS)).toEqual({
      kind: 'extend',
      endedAt: START + SESSION_ACTIVE_GAP_MS,
    });
  });

  it('opens a new one past the threshold', () => {
    expect(segmentActionFor(START, START + SESSION_ACTIVE_GAP_MS + 1)).toEqual({
      kind: 'open',
      startedAt: START + SESSION_ACTIVE_GAP_MS + 1,
    });
  });

  it('opens a new one when the clock went backwards', () => {
    /**
     * Extending would write an ended_at BEFORE the segment's started_at, which
     * ck_segment_order refuses — turning a phone whose clock moved into a
     * failed write in the middle of a workout. Slice 4's rule from the Open
     * Food Facts limiter: too permissive costs a segment, too strict costs a
     * feature that stops working.
     */
    expect(segmentActionFor(START, START - MINUTE)).toEqual({
      kind: 'open',
      startedAt: START - MINUTE,
    });
  });
});

describe('the duration a session records', () => {
  it('sums the segments and nothing else', () => {
    const segments = [
      { startedAt: START, endedAt: START + 20 * MINUTE },
      { startedAt: START + 3 * 60 * MINUTE, endedAt: START + 3 * 60 * MINUTE + 25 * MINUTE },
    ];

    expect(recordedDurationMs(segments)).toBe(45 * MINUTE);
  });

  it('A SESSION LEFT OPEN OVERNIGHT DOES NOT COUNT THE NIGHT', () => {
    /**
     * THE EXIT CRITERION OF THIS SLICE, AS ARITHMETIC.
     *
     * > Une reprise sans limite de temps combinée à une durée de bout en bout
     * > produirait des séances de 72 heures.
     *
     * Forty minutes are worked, the phone is put down, the session is picked up
     * fourteen hours later and twenty more minutes are worked. End to end that
     * is fifteen hours. What is recorded is an hour, because the night is the
     * space BETWEEN two segments and no segment ever covered it.
     *
     * Nothing had to run during those fourteen hours for this to be true, which
     * is the property that makes it survive a force quit.
     */
    const morning = { startedAt: START, endedAt: START + 40 * MINUTE };
    // Picked up fourteen hours after it was put down.
    const resumedAt = morning.endedAt + 14 * 60 * MINUTE;
    const evening = { startedAt: resumedAt, endedAt: resumedAt + 20 * MINUTE };

    expect(recordedDurationMs([morning, evening])).toBe(60 * MINUTE);
    // And end to end would have said fifteen hours, which is the figure this
    // whole mechanism exists to never produce.
    expect(evening.endedAt - morning.startedAt).toBe(15 * 60 * MINUTE);
  });

  it('reads a null end as zero length, never as still running', () => {
    /**
     * A NULL can only arrive from an archive. Reading it as "open" and closing
     * it at `now` is the tempting shape and it is the defect itself: an archive
     * imported a month after it was written would report a month of training.
     * Under-counting is the direction this project takes when it has to choose.
     */
    expect(recordedDurationMs([{ startedAt: START, endedAt: null }])).toBe(0);
  });

  it('ignores a segment that ends before it starts', () => {
    // ck_segment_order refuses to store one, so this can only come from a
    // hand-repaired archive. It contributes nothing rather than subtracting.
    expect(recordedDurationMs([{ startedAt: START, endedAt: START - MINUTE }])).toBe(0);
  });

  it('is unchanged by re-reading, whatever the clock says', () => {
    // The recorded figure takes no `now` at all, which is what makes a past
    // session report the same duration forever.
    const segments = [{ startedAt: START, endedAt: START + 30 * MINUTE }];
    expect(recordedDurationMs(segments)).toBe(recordedDurationMs(segments));
  });
});

describe('the duration a live session shows', () => {
  it('adds the time since the last write, so the banner moves', () => {
    const segments = [{ startedAt: START, endedAt: START + 10 * MINUTE }];

    expect(liveDurationMs(segments, START + 12 * MINUTE)).toBe(12 * MINUTE);
  });

  it('stops adding once the gap has elapsed', () => {
    /**
     * The discontinuity, asserted so it is a decision rather than a surprise:
     * past the gap the tail stops counting and the figure DROPS. Those minutes
     * were never work and the session will not record them.
     *
     * Capping the tail at the gap was the alternative and it is worse: it shows
     * half an hour of training that did not happen, which is the one direction
     * a number here is never allowed to be wrong in.
     */
    const segments = [{ startedAt: START, endedAt: START + 10 * MINUTE }];

    const justInside = liveDurationMs(segments, START + 10 * MINUTE + SESSION_ACTIVE_GAP_MS);
    const justOutside = liveDurationMs(
      segments,
      START + 10 * MINUTE + SESSION_ACTIVE_GAP_MS + 1,
    );

    expect(justInside).toBe(10 * MINUTE + SESSION_ACTIVE_GAP_MS);
    expect(justOutside).toBe(10 * MINUTE);
  });

  it('never runs backwards on a clock that did', () => {
    const segments = [{ startedAt: START, endedAt: START + 10 * MINUTE }];

    expect(liveDurationMs(segments, START + 5 * MINUTE)).toBe(10 * MINUTE);
  });

  it('agrees with the recorded figure when there is nothing to add', () => {
    expect(liveDurationMs([], START)).toBe(0);
  });
});

describe('finding the end everything is measured against', () => {
  it('takes the maximum rather than the last element', () => {
    /**
     * Not the array's order, because then the caller's ORDER BY would be a
     * second source for one fact — and the disagreement would be a duration.
     */
    const outOfOrder = [
      { startedAt: START + 60 * MINUTE, endedAt: START + 70 * MINUTE },
      { startedAt: START, endedAt: START + 10 * MINUTE },
    ];

    expect(lastEnd(outOfOrder)).toBe(START + 70 * MINUTE);
  });

  it('is null when there is nothing yet', () => {
    expect(lastEnd([])).toBeNull();
  });
});
