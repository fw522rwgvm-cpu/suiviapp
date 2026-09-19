import { describe, expect, it } from 'vitest';
import {
  suggestProgression,
  type ProgressionSet,
} from '../../src/features/strength/domain/progression';

/**
 * Double progression (specs 10.4), on rows rather than on a database.
 *
 * The rule only ever SUGGESTS, so the interesting assertions are all of the
 * same shape: a case where a plausible reading would have proposed a heavier
 * bar than the lifter earned.
 */

/** One working set of a routine line carrying the rule, performed as written. */
function aSet(over: Partial<ProgressionSet> = {}): ProgressionSet {
  return {
    setType: 'work',
    status: 'done',
    progressionEnabled: 1,
    targetLoadKg: 70,
    targetRepsMax: 8,
    loadKg: 70,
    reps: 8,
    ...over,
  };
}

describe('the condition of specs 10.4', () => {
  it('fires when every governed set reached the top of the range at the target', () => {
    const suggestion = suggestProgression([aSet(), aSet(), aSet()], 2.5);

    expect(suggestion).toEqual({ loadKg: 72.5, incrementKg: 2.5, fromLoadKg: 70 });
  });

  it('does not fire when one set fell short of the top', () => {
    // "TOUTES les séries de travail ont atteint le haut de la plage."
    expect(suggestProgression([aSet(), aSet(), aSet({ reps: 7 })], 2.5)).toBeNull();
  });

  it('does not fire when one set was lighter than the target', () => {
    expect(suggestProgression([aSet(), aSet({ loadKg: 65 })], 2.5)).toBeNull();
  });

  it('counts doing MORE than asked, because >= is not ==', () => {
    /**
     * Nine repetitions where eight were asked, and 75 kg where 70 were
     * targeted, are both more than the condition requires. Equality would
     * withhold the suggestion from the person who earned it hardest, and would
     * do it silently.
     */
    expect(suggestProgression([aSet({ reps: 9 }), aSet({ loadKg: 75 })], 2.5)).not.toBeNull();
  });

  it('is blocked by a set that was skipped or never validated', () => {
    /**
     * THE REASON history-reads DELIBERATELY DOES NOT FILTER ON STATUS.
     *
     * Two sets at the top of the range and a third abandoned is a session that
     * was cut short, not "toutes les séries ont atteint le haut". Dropping the
     * unfinished row would turn it into a perfect session and propose more
     * weight for less work.
     */
    expect(suggestProgression([aSet(), aSet({ status: 'skipped' })], 2.5)).toBeNull();
    expect(suggestProgression([aSet(), aSet({ status: 'pending' })], 2.5)).toBeNull();
  });

  it('ignores the RIR entirely, as specs 10.4 says in as many words', () => {
    // "Le RIR n'entre pas dans la condition." The type carries no RIR at all,
    // which is the strongest form of that: it cannot be consulted by accident.
    const atTheLimit = [aSet(), aSet(), aSet()];
    expect(suggestProgression(atTheLimit, 2.5)?.loadKg).toBe(72.5);
  });
});

describe('what the rule is scoped to', () => {
  it('ignores warm-ups, drop sets and long sets', () => {
    // "Ne s'applique qu'aux […] séries de type travail." The warm-up here is
    // deliberately short of the top: if it were counted, nothing would fire.
    const suggestion = suggestProgression(
      [aSet({ setType: 'warmup', reps: 3, loadKg: 20 }), aSet(), aSet()],
      2.5,
    );
    expect(suggestion?.loadKg).toBe(72.5);
  });

  it('ignores a line whose rule is switched off, rather than being blocked by it', () => {
    /**
     * A READING, FLAGGED. Specs 10.4 says "toutes les séries de travail" and
     * then "ne s'applique qu'aux lignes où la règle est activée": among the
     * lines carrying the rule, all must have reached the top. Switching the
     * rule off on a line is how somebody says "do not reason about this set" —
     * the other reading would make one un-ticked line silently disable
     * progression for the whole exercise.
     */
    const suggestion = suggestProgression(
      [aSet(), aSet({ progressionEnabled: 0, reps: 4, loadKg: 40 })],
      2.5,
    );
    expect(suggestion?.loadKg).toBe(72.5);
  });

  it('suggests nothing when no line carries the rule', () => {
    expect(suggestProgression([aSet({ progressionEnabled: 0 })], 2.5)).toBeNull();
    expect(suggestProgression([], 2.5)).toBeNull();
  });
});

describe('the cases it refuses to evaluate', () => {
  it('says nothing about a bodyweight exercise', () => {
    /**
     * No target load means "à la charge cible" cannot be checked, and "+2,5 kg"
     * on a pull-up is a sentence about nothing. FLAGGED: specs 10.4 does not
     * cover the case.
     */
    expect(
      suggestProgression([aSet({ targetLoadKg: null, loadKg: null })], 2.5),
    ).toBeNull();
  });

  it('says nothing about an exercise measured in seconds', () => {
    // A plank has no rep range, so it has no top to reach.
    expect(
      suggestProgression([aSet({ targetRepsMax: null, reps: null })], 2.5),
    ).toBeNull();
  });

  it('says nothing when the governed sets carry DIFFERENT target loads', () => {
    /**
     * FLAGGED, and the cautious direction. Specs 10.4 says "à la charge cible",
     * singular: double progression is a rule about a fixed working weight.
     * Sets at 60, 70 and 80 are a pyramid, which is a different scheme the
     * document does not describe — so there is no single honest number to
     * suggest, and the cost of saying nothing is a suggestion that does not
     * appear on an unusual routine.
     */
    const pyramid = [
      aSet({ targetLoadKg: 60, loadKg: 60 }),
      aSet({ targetLoadKg: 70, loadKg: 70 }),
      aSet({ targetLoadKg: 80, loadKg: 80 }),
    ];
    expect(suggestProgression(pyramid, 2.5)).toBeNull();
  });

  it('says nothing with a nonsensical increment', () => {
    // ck_exercise_increment refuses a non-positive one at the INSERT, so this
    // is only reachable from a hand-repaired archive. Nothing is the honest
    // answer: "Essayez 70 kg (+0 kg)" is a suggestion to do what you just did.
    expect(suggestProgression([aSet()], 0)).toBeNull();
    expect(suggestProgression([aSet()], Number.NaN)).toBeNull();
  });
});

describe('the number it proposes', () => {
  it('is the target plus the exercise increment', () => {
    expect(suggestProgression([aSet()], 5)?.loadKg).toBe(75);
    expect(suggestProgression([aSet({ targetLoadKg: 100, loadKg: 100 })], 1.25)?.loadKg).toBe(
      101.25,
    );
  });

  it('is rounded to the gram, so binary floating point never shows', () => {
    // 70 + 0.1 is 70.10000000000001, and a suggestion is a number somebody
    // reads off a screen and puts on a bar.
    expect(suggestProgression([aSet()], 0.1)?.loadKg).toBe(70.1);
  });

  it('carries the target it came from, so the label can show its working', () => {
    const suggestion = suggestProgression([aSet()], 2.5);
    expect(suggestion?.fromLoadKg).toBe(70);
    expect(suggestion?.incrementKg).toBe(2.5);
  });
});
