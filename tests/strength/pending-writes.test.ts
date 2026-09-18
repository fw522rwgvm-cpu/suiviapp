import { describe, expect, it } from 'vitest';
import {
  DEFERRED_WRITE_MS,
  createPendingWrites,
  type TypedFields,
} from '../../src/features/strength/domain/pending-writes';

/**
 * The buffer behind the deferred write rhythm of D12.
 *
 * What is testable here is the half whose failure is SILENT: a flush that loses
 * an entry, or writes one twice, or leaves the buffer holding something the
 * caller believes it has written. The timer and the AppState subscription are
 * in the hook, where Node cannot reach them.
 */

function fields(loadKg: number): TypedFields {
  return { reps: null, loadKg, durationSeconds: null };
}

describe('what is waiting to be written', () => {
  it('starts empty', () => {
    expect(createPendingWrites<string>().isEmpty()).toBe(true);
  });

  it('keeps only the LAST value of a field', () => {
    /**
     * Typing "7" then "72" must write 72 once, not 7 and then 72: the
     * intermediate value was never a quantity anybody meant. The same defect
     * slice 6 named on the recipe quantity, where a list re-scaled through 1,
     * then 13, then 137 — two passes at amounts nobody wanted.
     */
    const buffer = createPendingWrites<string>();
    buffer.put('set-1', fields(7));
    buffer.put('set-1', fields(72));

    expect(buffer.drain()).toEqual([['set-1', fields(72)]]);
  });

  it('keeps every distinct field', () => {
    const buffer = createPendingWrites<string>();
    buffer.put('set-1', fields(70));
    buffer.put('set-2', fields(80));

    expect(buffer.drain()).toHaveLength(2);
  });

  it('empties on drain, so nothing is written twice', () => {
    const buffer = createPendingWrites<string>();
    buffer.put('set-1', fields(70));

    expect(buffer.drain()).toHaveLength(1);
    expect(buffer.drain()).toEqual([]);
    expect(buffer.isEmpty()).toBe(true);
  });

  it('DRAINS BEFORE THE CALLER WRITES, so a keystroke during a write is not lost', () => {
    /**
     * THE PROPERTY THAT NEEDS NO LOCKING.
     *
     * The buffer hands its entries over and empties itself in one step, so
     * anything arriving while the caller is writing belongs to the NEXT flush.
     * Had drain cleared afterwards, that keystroke would be wiped by a clear it
     * never belonged to — and the loss would be invisible, because the value on
     * screen would still be the one the user typed.
     */
    const buffer = createPendingWrites<string>();
    buffer.put('set-1', fields(70));

    const taken = buffer.drain();
    // The write is "happening" here, and the user types again.
    buffer.put('set-1', fields(75));

    expect(taken).toEqual([['set-1', fields(70)]]);
    expect(buffer.drain()).toEqual([['set-1', fields(75)]]);
  });

  it('is a fraction of a second, which is what D12 asks for', () => {
    // Pinned so a change is a decision: shorter is the immediate rhythm with
    // extra steps, longer is a wider window in which a force quit costs typing.
    expect(DEFERRED_WRITE_MS).toBeGreaterThan(0);
    expect(DEFERRED_WRITE_MS).toBeLessThan(1000);
  });
});
