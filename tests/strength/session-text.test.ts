import { describe, expect, it } from 'vitest';
import type { SetTarget } from '../../src/features/strength/domain/session-set';
import {
  durationPlaceholder,
  durationText,
  loadPlaceholder,
  progressText,
  repsPlaceholder,
  restText,
  rirLabel,
  elapsedText,
  previousText,
} from '../../src/features/strength/domain/session-text';

/**
 * The French a session is described in. Pure, so the wording is something a
 * test can hold still (D9).
 */

const MINUTE = 60_000;

function target(overrides: Partial<SetTarget> = {}): SetTarget {
  return {
    setType: 'work',
    repsMin: null,
    repsMax: null,
    loadKg: null,
    rir: null,
    durationSeconds: null,
    ...overrides,
  };
}

describe('the duration on the band', () => {
  it('says minutes while there are no hours', () => {
    // "0:47" spends three characters saying zero, on the one figure the band
    // exists to carry.
    expect(durationText(47 * MINUTE)).toBe('47 min');
    expect(durationText(0)).toBe('0 min');
  });

  it('gains the hours field only when there are hours', () => {
    expect(durationText(60 * MINUTE)).toBe('1 h 00');
    expect(durationText(95 * MINUTE)).toBe('1 h 35');
    expect(durationText(3 * 60 * MINUTE + 5 * MINUTE)).toBe('3 h 05');
  });

  it('carries NO seconds, which is what stops the band moving', () => {
    /**
     * The band is on every screen of the application (specs 10.3), and a digit
     * changing every second in the corner of the eye is a cost paid on screens
     * that have nothing to do with training. Seconds belong to the rest timer,
     * which has its own countdown.
     */
    expect(durationText(47 * MINUTE + 30_000)).toBe('47 min');
    expect(durationText(47 * MINUTE)).toBe(durationText(47 * MINUTE + 59_000));
  });

  it('never goes negative on a clock that went backwards', () => {
    expect(durationText(-5000)).toBe('0 min');
  });
});

describe('the rest countdown, where seconds DO matter', () => {
  it('always writes minutes and seconds', () => {
    // A bare "38" where a duration belongs is a number the reader has to
    // classify before reading.
    expect(restText(38_000)).toBe('0:38');
    expect(restText(90_000)).toBe('1:30');
    expect(restText(0)).toBe('0:00');
  });

  it('rounds UP, so it never shows zero while time is left', () => {
    expect(restText(1)).toBe('0:01');
    expect(restText(59_500)).toBe('1:00');
  });
});

describe('what a field says it expects', () => {
  it('shows the WHOLE range, which is what specs 10.3 asks', () => {
    /**
     * > pour une plage, la plage complète.
     *
     * "6" alone would be the application picking one end for the user — and
     * the top is the end specs 10.4 fires the progression rule on.
     */
    expect(repsPlaceholder(target({ repsMin: 6, repsMax: 8 }))).toBe('6-8');
  });

  it('shows one number when the target is fixed', () => {
    expect(repsPlaceholder(target({ repsMin: 8, repsMax: 8 }))).toBe('8');
    expect(repsPlaceholder(target({ repsMin: 8 }))).toBe('8');
    expect(repsPlaceholder(target({ repsMax: 8 }))).toBe('8');
  });

  it('shows a dash when nothing is prescribed', () => {
    // An exercise added live prescribes nothing, and a dash says so where a
    // zero would be a target nobody set.
    expect(repsPlaceholder(target())).toBe('—');
    expect(loadPlaceholder(target())).toBe('—');
    expect(durationPlaceholder(target())).toBe('—');
  });

  it('writes a load the way the rest of the application writes numbers', () => {
    expect(loadPlaceholder(target({ loadKg: 72.5 }))).toBe('72,5');
    expect(loadPlaceholder(target({ loadKg: 70 }))).toBe('70');
  });

  it('keeps a bodyweight movement at zero rather than at nothing', () => {
    // Zero is a stated load: ck_set_actual_load allows it, and "0" and "—" say
    // different things to somebody standing in front of a dip bar.
    expect(loadPlaceholder(target({ loadKg: 0 }))).toBe('0');
  });
});

describe('the RIR scale', () => {
  it('writes the top of the scale as open-ended', () => {
    // Specs 10.3 spells it "4+": the one value whose label is not its number.
    expect(rirLabel(4)).toBe('4+');
    expect(rirLabel(5)).toBe('4+');
  });

  it('writes a half with a comma', () => {
    expect(rirLabel(1.5)).toBe('1,5');
    expect(rirLabel(2)).toBe('2');
    expect(rirLabel(0)).toBe('0');
  });
});

describe('how far through the sets a session is', () => {
  it('says done over total', () => {
    expect(progressText(3, 12)).toBe('3/12');
    expect(progressText(0, 0)).toBe('0/0');
  });
});

describe('elapsedText', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(elapsedText(0)).toBe('0:00');
    expect(elapsedText(9_000)).toBe('0:09');
    expect(elapsedText(5 * 60_000 + 23_000)).toBe('5:23');
    expect(elapsedText(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('gains the hours field only when there are hours', () => {
    // "0:05:23" spends three characters saying zero, on the one figure this
    // block exists to carry — the same rule durationText follows above.
    expect(elapsedText(60 * 60_000)).toBe('1:00:00');
    expect(elapsedText(65 * 60_000 + 23_000)).toBe('1:05:23');
  });

  it('TICKS, which is the reason it exists beside durationText', () => {
    /**
     * durationText refuses seconds because the banner it feeds sits on every
     * screen, where a twitching figure is a cost paid on pages that have
     * nothing to do with training. On the session's own page the opposite is
     * true: a workout clock that does not move looks stopped.
     *
     * So the two must NOT agree second by second, and this is what would fail
     * if somebody folded them back into one function.
     */
    const a = elapsedText(5 * 60_000);
    const b = elapsedText(5 * 60_000 + 1_000);

    expect(a).not.toBe(b);
    expect(durationText(5 * 60_000)).toBe(durationText(5 * 60_000 + 1_000));
  });

  it('never goes negative, whatever the clock says', () => {
    // Same guard as durationText: a device clock moved backwards must not
    // produce "-1:-30" on the figure somebody reads between two sets.
    expect(elapsedText(-5_000)).toBe('0:00');
  });
});

describe('previousText', () => {
  const some = { loadKg: 50, reps: 5, durationSeconds: null, rir: 2 };

  it('writes the asked-for shape', () => {
    // Requested literally: "50kg x 5" and, on the line below, "RIR 2".
    expect(previousText(some)).toEqual({ line: '50kg × 5', rir: 'RIR 2' });
  });

  it('writes a decimal load the way the rest of the application does', () => {
    expect(previousText({ ...some, loadKg: 72.5 }).line).toBe('72,5kg × 5');
  });

  it('says 4+ rather than 4, because that is what the value means', () => {
    expect(previousText({ ...some, rir: 4 }).rir).toBe('RIR 4+');
  });

  it('gives a DASH and no second line when there is no history', () => {
    // A blank where a figure belongs reads as a rendering fault. A dash says
    // the question was asked and the answer is nothing — the ordinary state of
    // the first session of every routine.
    expect(previousText(null)).toEqual({ line: '—', rir: null });
  });

  it('omits the RIR line rather than drawing an empty one', () => {
    // A set recorded before the RIR had a column of its own, or one arriving
    // from an archive. A blank second row would make the column look ragged for
    // a reason nobody can see.
    expect(previousText({ ...some, rir: null }).rir).toBeNull();
  });

  it('states a timed set as a time, with no multiplication', () => {
    // "45 s" rather than "0kg × 45": a plank has no load and no repetitions,
    // and inventing a product would be a shape that means nothing.
    expect(previousText({ loadKg: null, reps: null, durationSeconds: 45, rir: 1 })).toEqual({
      line: '45 s',
      rir: 'RIR 1',
    });
  });

  it('copes with half a record, which a killed session can leave', () => {
    expect(previousText({ ...some, loadKg: null }).line).toBe('× 5');
    expect(previousText({ ...some, reps: null }).line).toBe('50kg');
    expect(previousText({ loadKg: null, reps: null, durationSeconds: null, rir: 2 }).line).toBe('—');
  });
});
