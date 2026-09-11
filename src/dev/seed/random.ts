/**
 * A deterministic pseudo-random generator.
 *
 * Deterministic is the whole point. D15 gives the demo data generator four
 * jobs, and one of them is reproducing a bug without exposing real data — a
 * generator that draws differently on every run reproduces nothing. Same seed,
 * same database, on any machine.
 *
 * mulberry32: thirty-two bits of state, four lines, no dependency. The
 * statistical quality of the draw is irrelevant here; repeatability is not.
 */
export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform integer in [min, max], both included. */
  between(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive);
  }

  return {
    next,
    int,
    between: (min, max) => min + int(max - min + 1),
    pick<T>(items: readonly T[]): T {
      const item = items[int(items.length)];
      if (item === undefined) {
        throw new Error('Cannot pick from an empty list');
      }
      return item;
    },
    chance: (probability) => next() < probability,
  };
}
