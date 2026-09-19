import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import { newId } from '../../src/core/id';
import type { SessionId } from '../../src/core/db/schema';
import type { HistorySet } from '../../src/features/strength/data/history-reads';
import {
  epleyOneRm,
  exerciseSessionPoints,
  ONE_RM_MAX_REPS,
  personalRecords,
  setVolume,
} from '../../src/features/strength/domain/exercise-stats';

/**
 * The arithmetic of specs 10.1, on rows rather than on a database.
 *
 * What is worth asserting here is not that multiplication multiplies. It is
 * the three places a plausible wrong answer is available: a null read as a
 * zero, a set the scope excludes counted anyway, and a record re-dated to the
 * last time it was equalled.
 */

const DAY = 24 * 60 * 60 * 1000;
const START = 1_789_600_000_000;

/**
 * A distinct session id per number, stable within a test.
 *
 * `newId` rather than a hand-written string: toEntityId VALIDATES, so
 * "session-1" comes back null and every assertion below would compare null to
 * null and pass. The defect specs 9.32 no 4 found inside its own test.
 */
const sessions = new Map<number, SessionId>();
function sess(n: number): SessionId {
  const held = sessions.get(n);
  if (held !== undefined) return held;
  const fresh = newId<SessionId>();
  sessions.set(n, fresh);
  return fresh;
}

/**
 * One working, validated set. Every field a fold reads is defaulted to
 * something ordinary, so a test states only what it is about.
 */
function aSet(over: Partial<HistorySet> = {}): HistorySet {
  return {
    sessionId: sess(1),
    date: toLocalDate('2026-09-01'),
    startedAt: START,
    setIndex: 1,
    setType: 'work',
    status: 'done',
    progressionEnabled: 1,
    targetLoadKg: 70,
    targetRepsMin: 8,
    targetRepsMax: 8,
    loadKg: 70,
    reps: 8,
    completedAt: START,
    ...over,
  };
}

describe('Epley', () => {
  it('is charge × (1 + reps / 30)', () => {
    // Specs 10.1, quoted. 100 × (1 + 5/30) = 116,66…
    expect(epleyOneRm(100, 5)).toBeCloseTo(116.6667, 4);
    // One repetition is its own maximum, plus the formula's own 1/30.
    expect(epleyOneRm(100, 1)).toBeCloseTo(103.3333, 4);
  });

  it('stops at twelve repetitions, and twelve itself qualifies', () => {
    // The cap is the specification's, and "12 répétitions ou moins" includes
    // twelve. Reading it as strict would silently drop a whole set type.
    expect(epleyOneRm(100, ONE_RM_MAX_REPS)).not.toBeNull();
    expect(epleyOneRm(100, ONE_RM_MAX_REPS + 1)).toBeNull();
  });

  it('answers null — never zero — when a half is missing', () => {
    /**
     * THE RULE OF SLICE 4, AND IT DECIDES A REAL CASE HERE.
     *
     * A bodyweight set has no load. Zero would be a number somebody reads as
     * "a very low one-rep max" rather than as "not applicable", and it would
     * sit at the bottom of a chart instead of out of it.
     */
    expect(epleyOneRm(null, 8)).toBeNull();
    expect(epleyOneRm(70, null)).toBeNull();
    expect(epleyOneRm(0, 8)).toBeNull();
    // Zero reps is a row somebody validated without typing: load × 1 would
    // claim the target was lifted once.
    expect(epleyOneRm(70, 0)).toBeNull();
  });
});

describe('set volume', () => {
  it('is charge × répétitions', () => {
    expect(setVolume(70, 8)).toBe(560);
  });

  it('is null for a bodyweight set, not zero', () => {
    // Zero would rank a set of fifteen pull-ups below a set of one curl.
    expect(setVolume(null, 15)).toBeNull();
  });
});

describe('session points', () => {
  it('groups by session and folds the five series together', () => {
    const points = exerciseSessionPoints([
      aSet({ loadKg: 60, reps: 10 }),
      aSet({ loadKg: 70, reps: 8, setIndex: 2 }),
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-08'), loadKg: 72.5, reps: 8 }),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]?.setCount).toBe(2);
    expect(points[0]?.maxLoadKg).toBe(70);
    expect(points[0]?.totalReps).toBe(18);
    // 60×10 + 70×8
    expect(points[0]?.sessionVolume).toBe(1160);
    expect(points[0]?.bestSetVolume).toBe(600);
    expect(points[1]?.maxLoadKg).toBe(72.5);
  });

  it('excludes what the scope excludes, and the totals show it', () => {
    /**
     * Specs 10.1: "sur les séries de travail validées uniquement". The warm-up
     * here is heavier and longer than the working set on purpose — if the
     * scope leaked, every figure below would be the warm-up's.
     */
    const points = exerciseSessionPoints([
      aSet({ setType: 'warmup', loadKg: 200, reps: 12 }),
      aSet({ status: 'skipped', loadKg: 300, reps: 12, setIndex: 2 }),
      aSet({ status: 'pending', loadKg: 400, reps: 12, setIndex: 3 }),
      aSet({ loadKg: 70, reps: 8, setIndex: 4 }),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]?.setCount).toBe(1);
    expect(points[0]?.maxLoadKg).toBe(70);
    expect(points[0]?.totalReps).toBe(8);
    expect(points[0]?.sessionVolume).toBe(560);
  });

  it('produces NO point for a session where nothing counted', () => {
    /**
     * Not a point at zero. A session whose working sets were all skipped is an
     * absence of measurement, and specs 9.2 already settles the analogous case
     * normatively: "les jours sans mesure sont ignorés, sans interpolation".
     * A zero would draw a spike to the axis that nobody trained.
     */
    expect(exerciseSessionPoints([aSet({ status: 'skipped' })])).toEqual([]);
  });

  it('keeps a bodyweight session at null volume while still counting its reps', () => {
    const points = exerciseSessionPoints([
      aSet({ loadKg: null, reps: 12, targetLoadKg: null }),
      aSet({ loadKg: null, reps: 10, targetLoadKg: null, setIndex: 2 }),
    ]);

    expect(points[0]?.sessionVolume).toBeNull();
    expect(points[0]?.maxLoadKg).toBeNull();
    expect(points[0]?.bestOneRm).toBeNull();
    // The one series a bodyweight exercise can honestly fill.
    expect(points[0]?.totalReps).toBe(22);
  });

  it('keeps the read order rather than re-deriving it', () => {
    /**
     * A session logged for YESTERDAY starts later than one logged for today.
     * The fold must not sort on the instant, and the way to catch that is to
     * hand it rows whose two orders disagree.
     */
    const points = exerciseSessionPoints([
      aSet({ sessionId: sess(1), date: toLocalDate('2026-09-01'), startedAt: START + DAY }),
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-02'), startedAt: START }),
    ]);

    expect(points.map((point) => point.date)).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('personal records', () => {
  it('finds the four of specs 10.1', () => {
    const records = personalRecords([
      // Session 1: two sets, 1160 of volume.
      aSet({ loadKg: 60, reps: 10 }),
      aSet({ loadKg: 70, reps: 8, setIndex: 2 }),
      // Session 2: one very heavy single. Best load and best 1RM, worst volume.
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-08'), loadKg: 110, reps: 2 }),
    ]);

    expect(records.maxLoadKg?.value).toBe(110);
    expect(records.maxLoadKg?.date).toBe('2026-09-08');
    // 110 × (1 + 2/30) = 117,33 beats 70 × (1 + 8/30) = 88,67
    expect(records.bestOneRm?.value).toBeCloseTo(117.3333, 4);
    expect(records.bestSetVolume?.value).toBe(600);
    expect(records.bestSetVolume?.date).toBe('2026-09-01');
    // The heavy single is a 220 session; the first one is 1160.
    expect(records.bestSessionVolume?.value).toBe(1160);
    expect(records.bestSessionVolume?.date).toBe('2026-09-01');
  });

  it('keeps the FIRST date a record was reached', () => {
    /**
     * Strictly greater. Somebody who has lifted 100 kg three times set that
     * record the first time — re-dating it to the most recent attempt would
     * say the record is newer than it is, which is the one thing the date
     * exists to answer.
     */
    const records = personalRecords([
      aSet({ loadKg: 100, reps: 5 }),
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-08'), loadKg: 100, reps: 5 }),
    ]);

    expect(records.maxLoadKg?.value).toBe(100);
    expect(records.maxLoadKg?.date).toBe('2026-09-01');
  });

  it('is null across the board with nothing countable', () => {
    // Not zeroes. A screen has to be able to say "pas encore de record" rather
    // than print four noughts nobody's training produced.
    expect(personalRecords([aSet({ status: 'pending' })])).toEqual({
      maxLoadKg: null,
      bestOneRm: null,
      bestSetVolume: null,
      bestSessionVolume: null,
    });
  });

  it('agrees with the session points about the best session', () => {
    /**
     * The two must not be two spellings of one sum. This asserts the record
     * against the fold rather than against a literal, the way slice 4 holds
     * every prefill assertion against readQuantityPrefill.
     */
    const history = [
      aSet({ loadKg: 60, reps: 10 }),
      aSet({ loadKg: 70, reps: 8, setIndex: 2 }),
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-08'), loadKg: 80, reps: 8 }),
      aSet({ sessionId: sess(2), date: toLocalDate('2026-09-08'), loadKg: 80, reps: 8, setIndex: 2 }),
    ];

    const best = Math.max(
      ...exerciseSessionPoints(history).map((point) => point.sessionVolume ?? 0),
    );
    expect(personalRecords(history).bestSessionVolume?.value).toBe(best);
  });
});
