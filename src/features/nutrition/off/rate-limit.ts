/**
 * The Open Food Facts rate limiter (D11, specs 8.5).
 *
 * > Rate limiting: 15 requests/minute for product lookups, 10/minute for
 * > searches. An overrun reported by the server suspends remote calls for
 * > several minutes, with an EXPLICIT MESSAGE — the only case where the
 * > message is not discreet. A custom identification header is compulsory.
 *
 * ## TWO MECHANISMS, AND ONLY ONE OF THEM SURVIVES A FORCED QUIT
 *
 * They are easy to conflate and they answer different questions.
 *
 * The SLIDING WINDOW is preventive, and it lives in memory. It expires after
 * sixty seconds, and how far it can be exceeded after a restart is bounded by
 * how fast a person can act: the scan is a lookup and D11 notes it is never
 * two in a row, and the search only fires on an explicit submit. Persisting it
 * would mean one SQLite write PER REMOTE REQUEST to protect a counter that
 * dies in a minute, which is a bad trade in both directions.
 *
 * The SUSPENSION is different, and it is persisted. It is the state whose loss
 * has a cost outside this phone: the server has said stop, and an application
 * that is killed, restarted and starts again is how an IP gets banned. One
 * write, in the rare case, into `setting` — which exists precisely so that a
 * preference never costs a migration.
 *
 * ## THE CLOCK IS NOT TRUSTED
 *
 * A suspension is an instant (D3), and an instant read back after the phone's
 * clock has moved is not a measurement. Winding the clock back would leave
 * `suspended_until` far in the future and suspend the application for as long
 * as the user's patience lasts, with nothing on screen explaining why and no
 * way to clear it. So a suspension further away than MAX_SUSPENSION_MS is read
 * as expired: the failure mode of being slightly too permissive is one refused
 * request, and the failure mode of being too strict is a feature that never
 * works again.
 *
 * ## EVERYTHING HERE IS PURE
 *
 * No clock, no database, no fetch: the caller passes `now`. That is what makes
 * a sixty-second window testable without waiting sixty seconds, and it is the
 * same shape the rest of the project's domain modules have.
 */

/**
 * The two rhythms of D11, which are not interchangeable.
 *
 * A lookup is cheap and happens one at a time; a search is expensive and the
 * specs forbid firing it as the user types. They are counted separately
 * because the limits differ, and because exhausting one must not silently
 * disable the other — being unable to scan because a search ran ten times
 * would be the wrong thing to break.
 */
export type OffRequestKind = 'lookup' | 'search';

/** Per minute, per IP address. Observed values, dated 10/09/2026 (specs 13.8). */
export const RATE_LIMITS: Readonly<Record<OffRequestKind, number>> = {
  lookup: 15,
  search: 10,
};

export const RATE_WINDOW_MS = 60_000;

/**
 * How long a 429 suspends remote calls when the server does not say.
 *
 * D11 says "several minutes" and names no number. Five is a guess, flagged as
 * one: long enough to be a real pause rather than a stutter, short enough that
 * a shopping trip is not written off. It costs nothing to change.
 */
export const DEFAULT_SUSPENSION_MS = 5 * 60_000;

/**
 * The ceiling on any suspension, however it arrives.
 *
 * It bounds a hostile Retry-After and, more importantly, a clock that moved:
 * see the header. An hour is far longer than any legitimate pause and far
 * shorter than "forever".
 */
export const MAX_SUSPENSION_MS = 60 * 60_000;

/** Timestamps of recent calls, per kind. Immutable; in memory only. */
export type CallLog = Readonly<Record<OffRequestKind, readonly number[]>>;

export function emptyCallLog(): CallLog {
  return { lookup: [], search: [] };
}

/**
 * Whether a call may go out, and if not, when to try again.
 *
 * A value, never an exception (conventions section 4): being rate-limited is
 * an expected state of a remote call, not a programming error.
 */
export type RateDecision =
  | { allowed: true }
  | {
      allowed: false;
      /**
       * 'suspended' means the SERVER said stop, and it is the one case specs
       * 8.5 wants shown explicitly. 'window' is our own preventive counter and
       * must stay silent — the user did nothing wrong and there is nothing to
       * decide.
       */
      reason: 'suspended' | 'window';
      retryAtMs: number;
    };

/** Calls still inside the window at `now`. */
function withinWindow(times: readonly number[], now: number): number[] {
  // `now - time < RATE_WINDOW_MS` rather than `<=`, so a call exactly one
  // minute old has left the window rather than pinning it shut.
  return times.filter((time) => now - time < RATE_WINDOW_MS && time <= now);
}

export function decide(
  log: CallLog,
  kind: OffRequestKind,
  now: number,
  suspendedUntil: number | null,
): RateDecision {
  // The suspension outranks the window: the server's refusal is a fact about
  // the outside world, where the window is only our own estimate of it.
  if (suspendedUntil !== null && suspendedUntil > now) {
    return { allowed: false, reason: 'suspended', retryAtMs: suspendedUntil };
  }

  const recent = withinWindow(log[kind], now);
  if (recent.length < RATE_LIMITS[kind]) return { allowed: true };

  // The oldest call in the window is the one whose expiry frees a slot.
  const oldest = Math.min(...recent);
  return { allowed: false, reason: 'window', retryAtMs: oldest + RATE_WINDOW_MS };
}

/**
 * Records a call that actually went out.
 *
 * Called on DISPATCH rather than on success: a request that was sent and timed
 * out still cost the server its slot, and not counting it is how a flaky
 * network turns into a ban.
 *
 * Entries outside the window are dropped here, so the log cannot grow without
 * bound over a long session.
 */
export function record(log: CallLog, kind: OffRequestKind, now: number): CallLog {
  return { ...log, [kind]: [...withinWindow(log[kind], now), now] };
}

/**
 * Reads a persisted suspension, defending against a clock that has moved.
 *
 * Returns null — meaning "not suspended" — for anything that is not a
 * plausible instant in the near future. That covers a corrupt value, a
 * suspension already expired, and the one that matters: a stamp so far ahead
 * that only a clock change can explain it.
 *
 * A suspension imported from an archive lands here too, `setting` being an
 * exported table. Harmless: by the time an archive is imported the stamp is
 * long past, and a past stamp reads as expired.
 */
export function readSuspension(raw: string | null, now: number): number | null {
  if (raw === null) return null;

  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= now) return null;
  if (parsed - now > MAX_SUSPENSION_MS) return null;

  return parsed;
}

/**
 * When a 429 lifts.
 *
 * `Retry-After` is read when the server sends one and it is a plain number of
 * seconds, which is the form this API would use. The HTTP-date form is not
 * parsed: it would mean trusting a remote clock against a local one to decide
 * how long to wait, and `new Date()` on a foreign string is exactly the kind
 * of date handling D3 exists to keep out of this codebase. The default is used
 * instead, which is never wrong, only sometimes longer than necessary.
 *
 * Capped at MAX_SUSPENSION_MS, and floored at the default: a server answering
 * "retry in 1 second" to a 429 is not offering a slot, it is describing a
 * queue, and taking it at its word would put us straight back into the wall.
 */
export function suspensionUntil(retryAfter: string | null, now: number): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter.trim());

  const requested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  const clamped = Math.min(Math.max(requested, DEFAULT_SUSPENSION_MS), MAX_SUSPENSION_MS);

  return now + clamped;
}

/** Whole minutes left, rounded up, for the one message that is not discreet. */
export function minutesUntil(retryAtMs: number, now: number): number {
  return Math.max(1, Math.ceil((retryAtMs - now) / 60_000));
}
