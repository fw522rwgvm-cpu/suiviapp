import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUSPENSION_MS,
  MAX_SUSPENSION_MS,
  RATE_LIMITS,
  RATE_WINDOW_MS,
  decide,
  emptyCallLog,
  minutesUntil,
  readSuspension,
  record,
  suspensionUntil,
  type CallLog,
} from '../../src/features/nutrition/off/rate-limit';

/**
 * The rate limiter, which protects something no test can observe: not being
 * banned by IP address (D11).
 *
 * That is why this is tested at all, against the rule that a bug visible on
 * screen does not deserve a test. Nothing here shows on screen. A limiter that
 * counts wrong looks exactly like one that counts right, right up until Open
 * Food Facts stops answering — at which point the application appears to be
 * permanently offline, on a phone that is not.
 *
 * Every function is pure and takes `now`, so a sixty-second window is tested
 * in microseconds and a clock moved backwards is a parameter rather than a
 * story.
 */

const T0 = 1_789_000_000_000;

function logWith(kind: 'lookup' | 'search', times: number[]): CallLog {
  return times.reduce((log, time) => record(log, kind, time), emptyCallLog());
}

describe('the sliding window', () => {
  it('allows a call on an empty log', () => {
    expect(decide(emptyCallLog(), 'lookup', T0, null)).toEqual({ allowed: true });
  });

  it('allows exactly the budget of D11, then refuses', () => {
    // 15 lookups a minute, 10 searches. Getting this off by one in either
    // direction is invisible: one too few costs a request nobody notices, one
    // too many is a ban nobody can undo.
    const lookups = logWith(
      'lookup',
      Array.from({ length: RATE_LIMITS.lookup }, (_, index) => T0 + index),
    );
    expect(decide(lookups, 'lookup', T0 + 100, null).allowed).toBe(false);

    const oneFewer = logWith(
      'lookup',
      Array.from({ length: RATE_LIMITS.lookup - 1 }, (_, index) => T0 + index),
    );
    expect(decide(oneFewer, 'lookup', T0 + 100, null).allowed).toBe(true);
  });

  it('counts the two kinds separately', () => {
    // Exhausting searches must not stop a scan. Being unable to log a product
    // in a shop because the search ran ten times would be the wrong thing to
    // break, and the limits differ anyway.
    const searches = logWith(
      'search',
      Array.from({ length: RATE_LIMITS.search }, (_, index) => T0 + index),
    );

    expect(decide(searches, 'search', T0 + 100, null).allowed).toBe(false);
    expect(decide(searches, 'lookup', T0 + 100, null).allowed).toBe(true);
  });

  it('frees a slot as the oldest call leaves the window, and says when', () => {
    const full = logWith(
      'lookup',
      Array.from({ length: RATE_LIMITS.lookup }, (_, index) => T0 + index * 100),
    );

    // Asked AFTER the last of them: the fifteenth call is at T0 + 1400, and a
    // decision taken before it would (rightly) not count calls that have not
    // happened yet.
    const refused = decide(full, 'lookup', T0 + 1500, null);
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    // The oldest call is at T0, so a slot opens one window later.
    expect(refused.retryAtMs).toBe(T0 + RATE_WINDOW_MS);
    expect(refused.reason).toBe('window');

    // And one millisecond after that, it is allowed again.
    expect(decide(full, 'lookup', T0 + RATE_WINDOW_MS, null).allowed).toBe(true);
  });

  it('drops calls that have left the window rather than accumulating them', () => {
    // Over a long session the log would otherwise grow for as long as the
    // application runs — and a filter over a list that never shrinks gets
    // slower on exactly the path D16 budgets in milliseconds.
    let log = logWith(
      'lookup',
      Array.from({ length: RATE_LIMITS.lookup }, (_, index) => T0 + index),
    );
    log = record(log, 'lookup', T0 + RATE_WINDOW_MS * 3);

    expect(log.lookup).toEqual([T0 + RATE_WINDOW_MS * 3]);
  });

  it('ignores a call stamped in the future, which only a clock change explains', () => {
    // Wind the clock forward, make a call, wind it back: the log now holds a
    // timestamp ahead of `now`. Counting it would refuse requests for as long
    // as the gap lasts, and the window cannot drain it — it never gets older.
    // The same reasoning as the suspension ceiling: distrust the clock, and
    // fail towards letting one extra request through rather than towards a
    // feature that stops working.
    const fromTheFuture = logWith(
      'lookup',
      Array.from({ length: RATE_LIMITS.lookup }, () => T0 + RATE_WINDOW_MS * 10),
    );

    expect(decide(fromTheFuture, 'lookup', T0, null).allowed).toBe(true);
  });

  it('counts a call that was sent, not one that succeeded', () => {
    // Recorded on dispatch: a request that timed out still cost the server its
    // slot, and not counting it is how a flaky network turns into a ban.
    // Asserted as the shape of the API — record() takes no outcome at all.
    expect(record(emptyCallLog(), 'lookup', T0).lookup).toEqual([T0]);
  });
});

describe('the suspension outranks the window', () => {
  it('refuses while suspended, even with an empty log', () => {
    const decision = decide(emptyCallLog(), 'lookup', T0, T0 + 60_000);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    // 'suspended' is the one specs 8.5 wants shown explicitly; 'window' stays
    // silent. The two must never be collapsed into one refusal.
    expect(decision.reason).toBe('suspended');
    expect(decision.retryAtMs).toBe(T0 + 60_000);
  });

  it('allows again the instant it lapses', () => {
    expect(decide(emptyCallLog(), 'lookup', T0, T0).allowed).toBe(true);
    expect(decide(emptyCallLog(), 'lookup', T0 + 1, T0).allowed).toBe(true);
  });
});

describe('reading a suspension back after a restart', () => {
  /**
   * THE HALF THAT SURVIVES BEING KILLED, which is the whole reason it is
   * persisted at all. A counter reset to zero costs nothing; a suspension
   * forgotten is the application walking straight back into a 429 that has
   * already been refused once, which is how an IP gets banned.
   */
  it('reads a live suspension', () => {
    expect(readSuspension(String(T0 + 60_000), T0)).toBe(T0 + 60_000);
  });

  it('reads an expired one as no suspension', () => {
    expect(readSuspension(String(T0 - 1), T0)).toBeNull();
    expect(readSuspension(String(T0), T0)).toBeNull();
  });

  it('IGNORES one too far ahead to be anything but a clock change', () => {
    // Wind the phone's clock back a day and a five-minute suspension becomes a
    // day-long one, with nothing on screen to explain it and no way to clear
    // it. Being slightly too permissive costs one refused request; being too
    // strict costs a feature that never works again.
    expect(readSuspension(String(T0 + MAX_SUSPENSION_MS + 1), T0)).toBeNull();
    expect(readSuspension(String(T0 + MAX_SUSPENSION_MS), T0)).toBe(
      T0 + MAX_SUSPENSION_MS,
    );
  });

  it('reads nonsense as no suspension', () => {
    // The value survives an export and an import — `setting` is an exported
    // table — and D7 expects a file repaired by hand.
    expect(readSuspension(null, T0)).toBeNull();
    expect(readSuspension('', T0)).toBeNull();
    expect(readSuspension('bientôt', T0)).toBeNull();
    expect(readSuspension('NaN', T0)).toBeNull();
    expect(readSuspension('Infinity', T0)).toBeNull();
  });
});

describe('how long a 429 lasts', () => {
  it('uses the default when the server says nothing', () => {
    expect(suspensionUntil(null, T0)).toBe(T0 + DEFAULT_SUSPENSION_MS);
  });

  it('honours a longer Retry-After in seconds', () => {
    expect(suspensionUntil('600', T0)).toBe(T0 + 600_000);
  });

  it('REFUSES to shorten below the default', () => {
    // A server answering "retry in 1 second" to a 429 is describing a queue,
    // not offering a slot. Taking it at its word puts us straight back into
    // the wall — and the wall is the thing that bans by IP.
    expect(suspensionUntil('1', T0)).toBe(T0 + DEFAULT_SUSPENSION_MS);
    expect(suspensionUntil('0', T0)).toBe(T0 + DEFAULT_SUSPENSION_MS);
    expect(suspensionUntil('-99', T0)).toBe(T0 + DEFAULT_SUSPENSION_MS);
  });

  it('caps a hostile or absurd Retry-After', () => {
    expect(suspensionUntil('999999999', T0)).toBe(T0 + MAX_SUSPENSION_MS);
  });

  it('falls back to the default on an HTTP-date, rather than parsing it', () => {
    // Deliberately not parsed: it would mean trusting a remote clock against a
    // local one, and `new Date()` on a foreign string is what D3 keeps out of
    // this codebase. The default is never wrong, only sometimes long.
    expect(suspensionUntil('Wed, 21 Oct 2026 07:28:00 GMT', T0)).toBe(
      T0 + DEFAULT_SUSPENSION_MS,
    );
  });
});

describe('what the message says', () => {
  it('rounds up to whole minutes, and never says zero', () => {
    // "Réessayez dans 0 minute" is worse than saying nothing: it reads as a
    // bug, and this is the one message in the application that is allowed to
    // interrupt (specs 8.5).
    expect(minutesUntil(T0 + 60_000, T0)).toBe(1);
    expect(minutesUntil(T0 + 61_000, T0)).toBe(2);
    expect(minutesUntil(T0 + 1, T0)).toBe(1);
    expect(minutesUntil(T0 - 5000, T0)).toBe(1);
  });
});
