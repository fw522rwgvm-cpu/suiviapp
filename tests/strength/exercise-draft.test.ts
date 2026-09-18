import { describe, expect, it } from 'vitest';
import { MUSCLES, EQUIPMENT, SET_TYPES, type Muscle } from '../../src/core/db/schema';
import {
  DEFAULT_PROGRESSION_INCREMENT_KG,
  MAX_PROGRESSION_INCREMENT_KG,
  MIN_PROGRESSION_INCREMENT_KG,
  emptyExerciseDraft,
  formatIncrement,
  incrementOf,
  isValidExerciseDraft,
  normalizeProgressionIncrement,
  parseIncrement,
  muscleRoles,
  toggleSecondary,
  validateExerciseDraft,
  type ExerciseDraft,
  sameExerciseDraft,
} from '../../src/features/strength/domain/exercise-draft';
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  SET_TYPE_LABELS,
  equipmentLabel,
  muscleLabel,
  setTypeLabel,
} from '../../src/features/strength/domain/vocabulary';

function draft(over: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return { ...emptyExerciseDraft(DEFAULT_PROGRESSION_INCREMENT_KG), name: 'Squat', ...over };
}

describe('validating an exercise draft', () => {
  it('accepts the smallest complete exercise', () => {
    expect(validateExerciseDraft(draft())).toEqual([]);
    expect(isValidExerciseDraft(draft())).toBe(true);
  });

  it('refuses a name that is blank or only spaces', () => {
    expect(validateExerciseDraft(draft({ name: '' })).map((p) => p.kind)).toContain('name_missing');
    expect(validateExerciseDraft(draft({ name: '   ' })).map((p) => p.kind)).toContain(
      'name_missing',
    );
  });

  it('refuses an increment of zero or less, before SQL has to', () => {
    /**
     * ck_exercise_increment refuses this too. Caught here first so the form can
     * say which field is wrong, rather than the write failing with a constraint
     * name — the food_portion.name argument applied to a form.
     */
    expect(validateExerciseDraft(draft({ incrementKg: '0' })).map((p) => p.kind)).toContain(
      'increment_not_positive',
    );
    expect(validateExerciseDraft(draft({ incrementKg: '-2,5' })).map((p) => p.kind)).toContain(
      'increment_not_positive',
    );
  });

  it('tells an empty increment apart from a zero one', () => {
    /**
     * THE RULE SLICE 4 WROTE DOWN: absent must never become zero. Number('') is
     * 0, so an emptiness checked after the parse would report the wrong problem
     * — and a form that says "must be positive" about a field nobody has filled
     * is a form that sends you looking at the wrong thing.
     */
    expect(validateExerciseDraft(draft({ incrementKg: '' })).map((p) => p.kind)).toEqual([
      'increment_missing',
    ]);
    expect(validateExerciseDraft(draft({ incrementKg: '   ' })).map((p) => p.kind)).toEqual([
      'increment_missing',
    ]);
    expect(parseIncrement('')).toBeNull();
    expect(parseIncrement('0')).toBe(0);
  });

  it('refuses a muscle that is both primary and secondary', () => {
    /**
     * Not a database constraint and could not be one: the two live in different
     * tables, so SQL has nowhere to put it. What it produces is a body map lit
     * twice by one claim and a search matching the same exercise twice for one
     * term — plausible, and wrong in a way nobody would look for.
     */
    const problems = validateExerciseDraft(
      draft({ primaryMuscle: 'chest', secondaryMuscles: new Set(['chest', 'triceps']) }),
    );

    expect(problems).toContainEqual({ kind: 'secondary_repeats_primary', muscle: 'chest' });
  });

  it('collects every problem rather than stopping at the first', () => {
    const problems = validateExerciseDraft(
      draft({
        name: '',
        incrementKg: '0',
        primaryMuscle: 'chest',
        secondaryMuscles: new Set(['chest']),
      }),
    );

    expect(problems.map((p) => p.kind).sort()).toEqual([
      'increment_not_positive',
      'name_missing',
      'secondary_repeats_primary',
    ]);
  });
});

describe('the increment field, which is a string while it is typed', () => {
  it('accepts a comma, because a French keyboard offers one', () => {
    expect(parseIncrement('2,5')).toBe(2.5);
    expect(parseIncrement('2.5')).toBe(2.5);
  });

  it('survives a half-typed decimal without losing the separator', () => {
    /**
     * Slice 8 found this by shipping it: bound to a NUMBER, "2," parses to 2,
     * re-renders as "2", and the separator the user just typed disappears under
     * the caret. The draft holds the string; only validation reads the number.
     */
    expect(parseIncrement('2,')).toBe(2);
    expect(draft({ incrementKg: '2,' }).incrementKg).toBe('2,');
  });

  it('reads a value nobody could have typed as no value at all', () => {
    expect(parseIncrement('abc')).toBeNull();
    expect(parseIncrement('--')).toBeNull();
  });

  it('writes a number back in the field spelling', () => {
    expect(formatIncrement(2.5)).toBe('2,5');
    // Not "2,0": the field is a place to type, not a formatted display.
    expect(formatIncrement(2)).toBe('2');
  });

  it('round-trips through the field', () => {
    for (const value of [0.5, 1.25, 2.5, 5, 10]) {
      expect(parseIncrement(formatIncrement(value))).toBe(value);
    }
  });

  it('reads back what a valid draft stores', () => {
    expect(incrementOf(draft({ incrementKg: '1,25' }))).toBe(1.25);
  });
});

describe('the global increment setting', () => {
  it('falls back to the flagged default for an absent or unreadable value', () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeProgressionIncrement(value)).toBe(DEFAULT_PROGRESSION_INCREMENT_KG);
    }
  });

  it('clamps rather than refuses, on both ends', () => {
    /**
     * This project answers a bad settings value the same way everywhere —
     * normalizeCutoffHour and normalizeAdherenceTolerance clamp. A settings row
     * is never a reason to refuse to work.
     */
    expect(normalizeProgressionIncrement(0)).toBe(MIN_PROGRESSION_INCREMENT_KG);
    expect(normalizeProgressionIncrement(-5)).toBe(MIN_PROGRESSION_INCREMENT_KG);
    expect(normalizeProgressionIncrement(10_000)).toBe(MAX_PROGRESSION_INCREMENT_KG);
  });

  it('never returns a value ck_exercise_increment would refuse', () => {
    // The clamp and the CHECK have to agree, and the CHECK is `> 0`. This is
    // the assertion that keeps them agreeing if either moves.
    for (const value of [null, 0, -1, 0.0001, 1e9]) {
      expect(normalizeProgressionIncrement(value)).toBeGreaterThan(0);
    }
  });

  it('rounds to the gram, so a stored value reads back as one somebody typed', () => {
    expect(normalizeProgressionIncrement(2.4999999999)).toBe(2.5);
  });

  it('seeds a new draft from the setting and nowhere else', () => {
    /**
     * The single path specs 6.3 and 10.4 describe: read once, copied, and
     * thereafter the exercise's own. Asserted against the parameter rather than
     * a literal, so this cannot pass by coincidence if the default moves.
     */
    expect(emptyExerciseDraft(7.5).incrementKg).toBe(formatIncrement(7.5));
    expect(emptyExerciseDraft(1.25).incrementKg).toBe('1,25');
  });
});

describe('toggling a secondary muscle', () => {
  it('adds, removes, and never mutates its argument', () => {
    const start: ReadonlySet<'chest' | 'triceps'> = new Set(['chest']);

    const added = toggleSecondary(start, 'triceps');
    expect([...added].sort()).toEqual(['chest', 'triceps']);
    expect([...start]).toEqual(['chest']);

    const removed = toggleSecondary(added, 'chest');
    expect([...removed]).toEqual(['triceps']);
  });
});

describe('the displayed vocabulary', () => {
  it('labels every stored value, which the type enforces', () => {
    // Record<Muscle, string> is what makes adding a muscle without labelling it
    // a build failure rather than a raw `lower_back` on screen.
    for (const muscle of MUSCLES) expect(MUSCLE_LABELS[muscle]).toBeTruthy();
    for (const item of EQUIPMENT) expect(EQUIPMENT_LABELS[item]).toBeTruthy();
    for (const type of SET_TYPES) expect(SET_TYPE_LABELS[type]).toBeTruthy();
  });

  it('shows an unknown value as it stands rather than blanking it', () => {
    /**
     * These columns carry no CHECK, so a hand-repaired archive can hold
     * anything. The rule since meal-kinds.ts: rows this application did not
     * write are shown, never corrected — rewriting somebody's old data to
     * satisfy a rule that did not exist when it was made is what specs 5.2
     * forbids.
     */
    expect(muscleLabel('rhomboids')).toBe('rhomboids');
    expect(equipmentLabel('trap-bar')).toBe('trap-bar');
    expect(setTypeLabel('amrap')).toBe('amrap');
  });

  it('keeps null equipment null rather than inventing a label', () => {
    expect(equipmentLabel(null)).toBeNull();
  });

  it('labels the known values in French', () => {
    expect(muscleLabel('lower_back')).toBe('Lombaires');
    expect(equipmentLabel('cable')).toBe('Poulie');
    expect(setTypeLabel('work')).toBe('Travail');
  });
});

describe('the part each muscle plays', () => {
  it('names the primary and every secondary', () => {
    // What the body map on the editor shades by: an exercise has no sets, so
    // "principal" and "secondaire" are the only two steps it can offer.
    const roles = muscleRoles('chest', ['triceps', 'shoulders']);

    expect(roles.get('chest')).toBe('primary');
    expect(roles.get('triceps')).toBe('secondary');
    expect(roles.get('shoulders')).toBe('secondary');
    expect(roles.size).toBe(3);
  });

  it('lets the primary win a muscle listed on both sides', () => {
    /**
     * validateExerciseDraft refuses that draft, and this still has to answer:
     * it runs on every keystroke of a draft being built, including the instant
     * between choosing a new primary and the old one being cleared. A muscle
     * that is both is principally the one it is principally.
     */
    const roles = muscleRoles('chest', ['chest', 'triceps']);

    expect(roles.get('chest')).toBe('primary');
    expect(roles.size).toBe(2);
  });

  it('names the primary alone when nothing else is chosen', () => {
    expect([...muscleRoles('quads', []).entries()]).toEqual([['quads', 'primary']]);
  });
});

describe('whether two drafts say the same thing', () => {
  /** A filled draft, so every field has something to differ on. */
  function filled(): ExerciseDraft {
    return {
      ...emptyExerciseDraft(2.5),
      name: 'Développé couché',
      primaryMuscle: 'chest',
      secondaryMuscles: new Set(['triceps', 'shoulders']),
      equipment: 'barbell',
      noteExecution: 'Coudes à 45°',
      noteSetup: 'Banc plat',
      noteBreathing: 'Bloquer en bas',
      noteMistakes: 'Rebond sur la poitrine',
      isFavorite: true,
    };
  }

  it('says yes to a copy', () => {
    expect(sameExerciseDraft(filled(), filled())).toBe(true);
  });

  it('notices EVERY field of the draft', () => {
    /**
     * ## THE LIST IS KEYED BY THE TYPE, AND IT HAD TO BECOME SO
     *
     * The defect this guards is a field added to ExerciseDraft and forgotten in
     * sameExerciseDraft — which nothing else would catch, and which would make
     * a confirmation say there is nothing to lose when there is.
     *
     * It was an ARRAY, and slice 11 proved the array does not do the job:
     * `tracksDuration` was added to the draft and this test stayed green,
     * because a hand-kept list of examples cannot notice what is missing from
     * it. It was green on exactly the day it was written to be red.
     *
     * A Record keyed by `keyof ExerciseDraft` makes the compiler ask instead:
     * omit a field and `tsc` names it. That is the device this project already
     * uses for Record<Muscle, string> and for the switch in problemText, and it
     * belongs here more than anywhere, because here the test IS the barrier.
     */
    const changes: Record<keyof ExerciseDraft, Partial<ExerciseDraft>> = {
      name: { name: 'Développé incliné' },
      primaryMuscle: { primaryMuscle: 'shoulders' },
      equipment: { equipment: 'dumbbell' },
      incrementKg: { incrementKg: '1,25' },
      tracksDuration: { tracksDuration: true },
      isFavorite: { isFavorite: false },
      noteExecution: { noteExecution: 'autre' },
      noteSetup: { noteSetup: 'autre' },
      noteBreathing: { noteBreathing: 'autre' },
      noteMistakes: { noteMistakes: 'autre' },
      secondaryMuscles: { secondaryMuscles: new Set(['triceps']) },
    };

    for (const change of Object.values(changes)) {
      expect(sameExerciseDraft(filled(), { ...filled(), ...change })).toBe(false);
    }

    // Extra shapes of the fields where one example is not enough: clearing the
    // equipment, and sets that differ by size in both directions.
    const more: Partial<ExerciseDraft>[] = [
      { equipment: null },
      { secondaryMuscles: new Set(['triceps', 'shoulders', 'abs']) },
      { secondaryMuscles: new Set(['triceps', 'abs']) },
    ];
    for (const change of more) {
      expect(sameExerciseDraft(filled(), { ...filled(), ...change })).toBe(false);
    }
  });

  it('compares the secondary muscles as a SET, not as an order', () => {
    // They are toggled, so the order they arrive in is an accident of tapping.
    const one = { ...filled(), secondaryMuscles: new Set<Muscle>(['triceps', 'shoulders']) };
    const other = { ...filled(), secondaryMuscles: new Set<Muscle>(['shoulders', 'triceps']) };

    expect(sameExerciseDraft(one, other)).toBe(true);
  });

  it('compares the increment as the STRING it is', () => {
    /**
     * "2,5" and "2.5" parse to the same number and are not the same thing to
     * type over. A confirmation is about what would be lost, not about what
     * would be stored.
     */
    expect(
      sameExerciseDraft({ ...filled(), incrementKg: '2,5' }, { ...filled(), incrementKg: '2.5' }),
    ).toBe(false);
  });
});
