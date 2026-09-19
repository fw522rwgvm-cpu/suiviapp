/**
 * Activity segments, and the duration derived from them (specs 10.3, D12).
 *
 * Pure: no database, no clock of its own — every function takes `now`. That is
 * what makes a thirty-minute gap testable in Node, where nothing waits.
 *
 * ## THE PROBLEM THIS SOLVES, IN ONE SENTENCE
 *
 * > Une reprise sans limite de temps combinée à une durée de bout en bout
 * > produirait des séances de 72 heures, polluant durablement les statistiques.
 *
 * So the duration is the sum of intervals of actual work, and D9 forbids
 * storing it: the segments are stored, the duration is derived.
 */

/**
 * How long a silence has to be before it stops being part of the workout.
 *
 * D12 gives the number — thirty minutes — and it lives in a module of the
 * domain with its reason beside it, on the precedent PANEL_LOADING_MS and the
 * body map's shading thresholds set. It is a CHOICE, not a measurement: long
 * enough that a slow superset, a queue for the squat rack or a phone call does
 * not split a workout in two, short enough that going home ends it.
 *
 * Changing it does NOT rewrite history, which is the property that made storing
 * segments rather than a duration worth it: every past session is re-summed
 * from its own intervals the next time it is read.
 */
export const SESSION_ACTIVE_GAP_MS = 30 * 60 * 1000;

/** One interval of work, as stored. */
export interface ActivitySegment {
  startedAt: number;
  /**
   * The last instant at which something was written into this session.
   *
   * ## NEVER NULL WHILE THE APPLICATION IS RUNNING, AND THAT IS THE DESIGN
   *
   * The obvious shape is `ended_at IS NULL` for the segment in progress, closed
   * when the gap elapses. It cannot work here, and the reason is specs 2.2:
   * nothing of this application runs while it is backgrounded or killed, so
   * there is no moment at which the closing could happen. A killed session
   * would leave an open segment, and reading it would have to guess an end —
   * `COALESCE(ended_at, now)` counts the whole night, which is the exact defect
   * D12 wrote this mechanism to prevent.
   *
   * So the open segment carries its end AT ALL TIMES, bumped by every write.
   * A force quit therefore leaves it ending at the last thing that actually
   * happened, which is the truth without anybody having to compute it. The
   * "open" segment is not a state in the table: it is simply the most recent
   * one, and whether it can still be extended is a question about the clock.
   *
   * A NULL arriving from an archive is read as a zero-length segment, which is
   * the conservative direction — it under-counts rather than inventing time.
   */
  endedAt: number | null;
}

/** What a write must do to the segments before it does anything else. */
export type SegmentAction =
  | { kind: 'open'; startedAt: number }
  | { kind: 'extend'; endedAt: number };

/**
 * What the write about to happen must do to this session's segments.
 *
 * ## THE END OF A SEGMENT IS STAMPED BY THE WRITE THAT FOLLOWS THE GAP
 *
 * D12 says a segment "se ferme après 30 minutes sans aucune écriture". Read as
 * an instruction to a timer that is unimplementable, for the reason above. Read
 * as a rule about the NEXT write, it needs nothing to run in between: when a
 * write arrives more than the gap after the last one, the previous segment is
 * already correctly ended — it was ended by its own last write — and this write
 * opens a new one.
 *
 * The consequence is the property specs 10.3 is after: a session left open
 * overnight never counts the night, because the night is the space BETWEEN two
 * segments and no segment ever covered it.
 *
 * `lastEndedAt` is the end of the most recent segment, which is also the last
 * instant anything was written. There is nothing else to remember.
 */
export function segmentActionFor(
  lastEndedAt: number | null,
  now: number,
  gapMs: number = SESSION_ACTIVE_GAP_MS,
): SegmentAction {
  if (lastEndedAt === null) return { kind: 'open', startedAt: now };
  /**
   * A clock that went BACKWARDS lands here too, and opening a new segment is
   * the right answer: extending would write an `ended_at` before the segment's
   * `started_at`, which ck_segment_order refuses — turning a settings-level
   * oddity into a failed write in the middle of a workout. Slice 4's rule, from
   * the Open Food Facts limiter: being slightly too permissive costs a segment,
   * being too strict costs a feature that stops working.
   */
  if (now < lastEndedAt) return { kind: 'open', startedAt: now };
  if (now - lastEndedAt > gapMs) return { kind: 'open', startedAt: now };
  return { kind: 'extend', endedAt: now };
}

/**
 * The recorded duration: the sum of the segments, and nothing else.
 *
 * Every past session reads through here, so changing SESSION_ACTIVE_GAP_MS
 * changes what future sessions RECORD and never what past ones report.
 */
export function recordedDurationMs(segments: readonly ActivitySegment[]): number {
  let total = 0;
  for (const segment of segments) {
    // A NULL end is read as zero length rather than as "still running": it can
    // only come from an archive, and inventing time is the one direction this
    // project never takes.
    const endedAt = segment.endedAt ?? segment.startedAt;
    if (endedAt > segment.startedAt) total += endedAt - segment.startedAt;
  }
  return total;
}

/**
 * The duration to SHOW while a session is live (specs 10.3, "durée écoulée").
 *
 * The recorded total plus the time accruing since the last write — because a
 * timer that only moves when you type looks broken, and resting between two
 * sets is part of a workout.
 *
 * ## THE DISCONTINUITY, NAMED RATHER THAN HIDDEN
 *
 * Once the gap has elapsed, the tail stops being added and the displayed figure
 * DROPS by up to thirty minutes. That is arithmetically right — those minutes
 * were never work, and the session will not record them — and it is a backwards
 * jump on a timer, which is normally a defect.
 *
 * It is accepted because of who could see it: the jump needs somebody watching
 * this screen for thirty unbroken minutes without writing anything. Someone
 * mid-workout writes; someone who left is not looking, and finds the honest
 * figure when they come back. Reserve written down rather than discovered.
 *
 * The alternative — capping the tail at the gap — was refused: it shows half an
 * hour of work that did not happen, which is worse in the one direction this
 * project does not allow a number to be wrong.
 */
export function liveDurationMs(
  segments: readonly ActivitySegment[],
  now: number,
  gapMs: number = SESSION_ACTIVE_GAP_MS,
): number {
  const recorded = recordedDurationMs(segments);
  const lastEndedAt = lastEnd(segments);
  if (lastEndedAt === null) return recorded;

  const since = now - lastEndedAt;
  // Within the gap, the workout is still running and the tail counts. A clock
  // that went backwards gives a negative, which contributes nothing.
  if (since <= 0 || since > gapMs) return recorded;
  return recorded + since;
}

/**
 * The end of the most recent segment — the instant everything else is measured
 * against.
 *
 * Reads the MAXIMUM rather than the last element, so it does not depend on the
 * caller's ordering. Two sources for an order is how a list ends up disagreeing
 * with itself, and here the disagreement would be a duration.
 */
export function lastEnd(segments: readonly ActivitySegment[]): number | null {
  let latest: number | null = null;
  for (const segment of segments) {
    const endedAt = segment.endedAt ?? segment.startedAt;
    if (latest === null || endedAt > latest) latest = endedAt;
  }
  return latest;
}
