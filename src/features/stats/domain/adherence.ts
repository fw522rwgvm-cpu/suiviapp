import { compareLocalDate, type LocalDate } from '@/core/date';
import type { Macros } from '@/features/nutrition/domain/macros';

/**
 * The adherence rate (specs 8.7).
 *
 * > Taux d'adhérence : proportion de jours dans la cible, avec seuil de
 * > tolérance réglable, exprimé en pourcentage et appliqué aux quatre macros.
 *
 * Pure (D9): no database, no React, no clock. `today` is a parameter.
 *
 * The specs give one sentence and one worked example. Everything below is what
 * that sentence had to be pinned down to, and each decision is written out
 * because every one of them produces a number that looks right either way.
 */

/** One day of the range, as the reads hand it over. */
export interface DayFigure {
  date: LocalDate;
  /** What was eaten. Null when the day has no entry at all. */
  consumed: Macros | null;
  /** The day's goal, the sum of its meals'. Null when no meal carries one. */
  target: Macros | null;
}

export interface Adherence {
  /**
   * Every day of the range the user chose — today included.
   *
   * IT EXISTS BECAUSE THE DENOMINATOR HAS TO BE RECOGNISABLE. `span` is the
   * range minus today, and a card that answered "7 jours" with "sur 6" was
   * arithmetic nobody could check: the missing day was a rule applied in
   * silence. Specs 8.7 no 2 makes the denominator obligatory precisely so the
   * figure cannot mislead, and a denominator the reader does not recognise
   * does the very thing it was there to prevent.
   *
   * So the sentences count against this, and name what was taken out of it.
   */
  range: number;
  /** Days in the range that could be judged at all — the range minus today. */
  span: number;
  /** Of those, how many have at least one entry. */
  recorded: number;
  /** Of those, how many also have a goal. The denominator specs 8.7 no 2 shows. */
  judged: number;
  /** Of the judged, how many sit inside the tolerance on all four macros. */
  within: number;
  /** null when nothing could be judged: a rate over zero days is not zero. */
  rate: number | null;
  /**
   * The same rate, macro by macro.
   *
   * ## IT DOES NOT REPLACE THE ONE ABOVE, IT EXPLAINS IT
   *
   * Specs 8.7 asks for a proportion of DAYS, and that stays the headline. What
   * four rates add is the thing the single figure cannot say: WHICH of the four
   * is costing the days. A month at 40 % reads very differently when protein is
   * at 95 % and carbohydrates at 45 %.
   *
   * Over the same denominator — the judged days — so the five figures are
   * comparable and one invariant holds them together: the overall rate can
   * never exceed the smallest of the four, since a day counts overall only if
   * it counted on every one of them. A test pins that.
   */
  byMacro: MacroAdherence;
}

export interface MacroAdherence {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  kcal: number | null;
}

/**
 * Whether one macro sits inside its tolerance band.
 *
 * ## THE BAND IS TWO-SIDED
 *
 * "Dans la cible" with a tolerance reads as a band around the goal, not as a
 * ceiling. Eating half one's protein target is not being on target, and a
 * one-sided reading would count it as a success — which is the wrong answer for
 * the macro the whole application exists to hit.
 *
 * Note this is the opposite of the Journal's calorie gauge, which IS one-sided
 * and absolute (fifty kilocalories over, specs 8.3). They answer different
 * questions: the gauge says "you have eaten more than you meant to today", this
 * says "this day landed where it was aimed". Sharing a rule between them would
 * tie a display colour to a statistic for ever.
 *
 * ## A GOAL OF ZERO ALLOWS NOTHING, AND THAT IS THE TRUTHFUL ANSWER
 *
 * A percentage of zero is zero, so the band collapses to the point. Eating
 * nothing meets a goal of nothing; eating anything does not. The alternative
 * — treating a zero goal as "anything passes" — would quietly excuse the one
 * case where the goal is most explicit.
 */
export function isMacroWithin(
  consumed: number,
  target: number,
  tolerancePct: number,
): boolean {
  // Math.abs on the target, not because a negative goal is expected — nothing
  // can write one — but because an allowance must never come out negative and
  // refuse a value that is exactly on target.
  const allowance = (Math.abs(target) * tolerancePct) / 100;
  return Math.abs(consumed - target) <= allowance;
}

/**
 * Whether a day counts as being on target.
 *
 * ALL FOUR, AND THAT IS WHAT THE SENTENCE SAYS. Specs 8.7 asks for a
 * proportion of DAYS, singular, and the threshold is "appliqué aux quatre
 * macros" — so the threshold applies to each and the day is the thing being
 * judged. Four separate rates would be four numbers where the specs give one,
 * and the denominator of point 2 would have nothing to be the denominator of.
 */
export function isDayWithin(
  consumed: Macros,
  target: Macros,
  tolerancePct: number,
): boolean {
  return (
    isMacroWithin(consumed.protein, target.protein, tolerancePct) &&
    isMacroWithin(consumed.carbs, target.carbs, tolerancePct) &&
    isMacroWithin(consumed.fat, target.fat, tolerancePct) &&
    isMacroWithin(consumed.kcal, target.kcal, tolerancePct)
  );
}

/**
 * The rate, and every figure needed to say what it is a rate OF.
 *
 * ## THREE KINDS OF DAY ARE LEFT OUT, AND ALL THREE FOR THE SAME REASON
 *
 * A day is only judged if there is something to judge it against and something
 * to judge. Each exclusion is an absence of measurement, which specs 8.7 no 1
 * already establishes is not a failure:
 *
 *  1. **No entry.** Written into the specs: "une journée sans aucune entrée
 *     n'est pas un échec, c'est une absence de mesure."
 *
 *  2. **No goal.** A day cannot be inside a target it does not have. This is
 *     not a rare case: EVERY day materialised before migration 0004 is in it,
 *     permanently, since templates did not exist then and specs 8.1 forbids
 *     applying one retroactively. Counting those as failures would make the
 *     figure say something about the schema's history rather than about eating.
 *
 *  3. **Today.** ASSUMPTION, FLAGGED — no document mentions it. A day still
 *     being lived is a partial measurement: at nine in the morning it is short
 *     of its goal by almost all of it, so including it would show a rate that
 *     drops every morning and recovers every evening, for a reason that has
 *     nothing to do with what anyone ate. That is the same argument no 1 makes
 *     about an unrecorded day, applied to a day that is not finished rather
 *     than not started. The chart still draws today: watching the bar grow is
 *     the point of looking. Only the STATISTIC waits for the day to be over.
 *
 * ## THE GOAL IS THE ONE THE JOURNAL SHOWS, PARTIAL INCLUDED
 *
 * Specs 8.1 makes a day's goal the sum of its meals', and amendment 14.6 no 10
 * allows a meal to carry none. So a day whose breakfast alone is targeted has a
 * goal covering one quarter of it, and comparing the whole day's eating against
 * it reads as a large overshoot.
 *
 * That is a real tension, and it is resolved the way it already is on screen:
 * the Journal's remaining banner has summed exactly this partial goal since
 * slice 5 and the user reads it daily. Making the statistic disagree with the
 * banner would put two answers to "what was this day's goal" in one
 * application — which is the defect this project spends its effort avoiding.
 * One answer, and it is the visible one.
 *
 * ## THE RATE IS NULL, NOT ZERO, WHEN NOTHING COULD BE JUDGED
 *
 * Zero per cent is a measurement: it says every judged day missed. No judged
 * day at all is not that, and rendering it as 0 % would tell the user they had
 * failed completely on the day they installed the application.
 */
export function adherenceOf(
  days: readonly DayFigure[],
  tolerancePct: number,
  today: LocalDate,
): Adherence {
  const finished = days.filter((day) => compareLocalDate(day.date, today) < 0);
  const recorded = finished.filter((day) => day.consumed !== null);
  const judged = recorded.filter((day) => day.target !== null);

  const within = judged.filter((day) =>
    // Both are known non-null by the filters above; the checks are what tells
    // TypeScript so, and they cost nothing.
    day.consumed !== null && day.target !== null
      ? isDayWithin(day.consumed, day.target, tolerancePct)
      : false,
  );

  const rateOf = (macro: keyof Macros): number | null => {
    if (judged.length === 0) return null;
    const held = judged.filter((day) =>
      day.consumed !== null && day.target !== null
        ? isMacroWithin(day.consumed[macro], day.target[macro], tolerancePct)
        : false,
    );
    return held.length / judged.length;
  };

  return {
    range: days.length,
    span: finished.length,
    recorded: recorded.length,
    judged: judged.length,
    within: within.length,
    rate: judged.length === 0 ? null : within.length / judged.length,
    byMacro: {
      protein: rateOf('protein'),
      carbs: rateOf('carbs'),
      fat: rateOf('fat'),
      kcal: rateOf('kcal'),
    },
  };
}
