/**
 * The buffer behind the deferred write rhythm of D12.
 *
 * > Écriture différée d'une fraction de seconde pour les champs en cours de
 * > frappe, **vidée systématiquement au passage en arrière-plan**.
 *
 * Pure, and that is the point: the hook that wires it owns a timer and an
 * AppState subscription, neither of which exists in Node. What CAN be tested is
 * the thing whose failure is silent — that a flush writes every pending field
 * exactly once and leaves nothing behind. Slice 9 put `core/ui/reveal.ts` in
 * the same position for the same reason: a calculation left in a component is a
 * calculation nothing checks.
 */

export interface TypedFields {
  reps: number | null;
  loadKg: number | null;
  durationSeconds: number | null;
}

export interface PendingWrites<K> {
  /** Records what a field now holds, replacing any earlier value for that key. */
  put(key: K, fields: TypedFields): void;
  /** Whether anything is waiting. */
  isEmpty(): boolean;
  /**
   * Hands over everything pending and empties the buffer.
   *
   * TAKES THE ENTRIES OUT BEFORE THE CALLER WRITES THEM, never after. A write
   * that throws must not leave the buffer holding a value the caller believes
   * it has written — and more importantly, a keystroke arriving DURING the
   * write belongs to the next flush, not to this one. Draining first is what
   * makes that true without any locking.
   */
  drain(): [K, TypedFields][];
}

export function createPendingWrites<K>(): PendingWrites<K> {
  let pending = new Map<K, TypedFields>();

  return {
    put(key, fields) {
      // LAST VALUE WINS, and a Map is what says so. Typing "7" then "72" must
      // write 72 once, not 7 and then 72: the intermediate value was never a
      // quantity anybody meant, and writing it would be the defect slice 6
      // named on the recipe quantity — a list re-scaled through 1, then 13,
      // then 137.
      pending.set(key, fields);
    },
    isEmpty() {
      return pending.size === 0;
    },
    drain() {
      const entries = [...pending.entries()];
      pending = new Map();
      return entries;
    },
  };
}

/**
 * How long a field waits before it is written (D12, "une fraction de seconde").
 *
 * A CHOICE rather than a measurement, living in the domain with its reason
 * beside it — PANEL_LOADING_MS's arrangement.
 *
 * Short enough that the window in which a force quit costs something is shorter
 * than the pause between two digits; long enough that typing "72,5" is one
 * write and not four. Dropping it to zero was the tempting hardening and it is
 * refused: that is the immediate rhythm with extra steps, and a write per
 * keystroke on the one screen specs 10.3 requires to survive anything.
 *
 * What a lost flush can cost, stated rather than promised away: the last few
 * hundred milliseconds of typing in ONE field. Never a validated set, which is
 * synchronous; never the session, its blocks or its sets, which exist from the
 * start.
 */
export const DEFERRED_WRITE_MS = 400;
