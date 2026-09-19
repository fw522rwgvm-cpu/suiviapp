import { useEffect, useState } from 'react';
import {
  SESSION_ACTIVE_GAP_MS,
  liveDurationMs,
  type ActivitySegment,
} from '../domain/session-activity';

/**
 * The duration to show while a session runs (specs 10.3, "durée écoulée").
 *
 * ## IT TICKS ONCE A MINUTE, BECAUSE THAT IS WHAT IT DISPLAYS
 *
 * durationText writes minutes, never seconds — a banner that appears on every
 * screen of the application must not have a digit changing in the corner of the
 * eye. So a timer faster than the smallest unit shown would be renders nobody
 * can see, on the screen where React has the least to spare.
 *
 * Fifteen seconds rather than sixty, and that is the one subtlety: the ticks
 * are not aligned to the minute boundary, so a sixty-second interval can lag
 * the displayed minute by up to a minute. Four times a minute bounds the lag at
 * fifteen seconds, which is under what anyone notices, for four renders of two
 * numbers.
 *
 * ## AND THE ARITHMETIC IS NOT HERE
 *
 * liveDurationMs is pure and tested, including the discontinuity when the
 * activity gap elapses. What this adds is a clock, which is exactly what a test
 * in Node cannot have — the division section 9.20 no 4 drew for reveal.ts.
 */
export function useLiveDuration(
  segments: readonly ActivitySegment[],
  gapMs: number = SESSION_ACTIVE_GAP_MS,
  tickMs: number = BANNER_TICK_MS,
): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  return liveDurationMs(segments, now, gapMs);
}

/**
 * How often each reader needs a new instant, and they do NOT need the same.
 *
 * The persistent banner shows minutes (durationText refuses seconds, because it
 * sits on every screen of the application and a twitching figure is a cost paid
 * on pages that have nothing to do with training). Fifteen seconds is four
 * times more often than it can possibly change, which is cheap and generous.
 *
 * The session's own page shows SECONDS since specs 14.38, so fifteen made it
 * look stopped for fourteen of them — reported as "le champ de durée ne se met
 * pas à jour toutes les secondes". It ticks every second, and that is the whole
 * of what it costs: one setState on the screen you are looking at.
 *
 * Two constants rather than one interval fast enough for both, because the
 * banner's interval runs on EVERY screen and the session's runs on one.
 */
export const BANNER_TICK_MS = 15_000;
export const SESSION_TICK_MS = 1_000;
