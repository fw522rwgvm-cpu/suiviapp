import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import type { Macros } from '../../src/features/nutrition/domain/macros';
import type { DayFigure } from '../../src/features/stats/domain/adherence';
import { nutritionPanel } from '../../src/features/stats/domain/panel';
import {
  describeAdherenceDenominator,
  describeAdherenceExclusions,
  describeMeanBasis,
  formatAdherenceRate,
} from '../../src/features/stats/domain/stats-text';

/**
 * What the panel computes, and what it says about it.
 *
 * Specs 8.7 no 2 makes the denominator obligatory — "sans cela, la statistique
 * récompense l'abandon du journal" — so the sentences are as much a
 * requirement as the arithmetic, and they are tested as one.
 */

const TODAY = toLocalDate('2026-09-14');

function macros(protein: number, carbs: number, fat: number, kcal: number): Macros {
  return { protein, carbs, fat, kcal };
}

const GOAL = macros(150, 250, 70, 2200);

function day(date: string, consumed: Macros | null, target: Macros | null): DayFigure {
  return { date: toLocalDate(date), consumed, target };
}

describe('nutritionPanel', () => {
  it('draws today but does not average it in', () => {
    // The case the whole design turns on: a morning's 300 kcal is a bar on the
    // chart and is not part of the mean printed beside it.
    const panel = nutritionPanel(
      [
        day('2026-09-13', macros(150, 250, 70, 2000), GOAL),
        day('2026-09-14', macros(20, 30, 5, 300), GOAL),
      ],
      10,
      TODAY,
    );

    expect(panel.kcalSeries).toEqual([2000, 300]);
    expect(panel.meanConsumed?.kcal).toBe(2000);
    expect(panel.span).toBe(1);
    expect(panel.recorded).toBe(1);
  });

  it('leaves a gap in the series rather than a zero', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-11', macros(0, 0, 0, 2000), GOAL),
        day('2026-09-12', null, GOAL),
        day('2026-09-13', macros(0, 0, 0, 2000), GOAL),
      ],
      10,
      TODAY,
    );

    expect(panel.kcalSeries).toEqual([2000, null, 2000]);
    // And the mean is 2000, not 1333.
    expect(panel.meanConsumed?.kcal).toBe(2000);
  });

  it('rolls a seven-day mean lined up with the dates', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-12', macros(0, 0, 0, 1000), null),
        day('2026-09-13', macros(0, 0, 0, 3000), null),
      ],
      10,
      TODAY,
    );

    expect(panel.rollingKcalSeries).toEqual([1000, 2000]);
  });

  it('averages the goal only over the days that had one', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-12', macros(0, 0, 0, 2000), GOAL),
        // No goal. Must not drag the mean goal towards zero.
        day('2026-09-13', macros(0, 0, 0, 2000), null),
      ],
      10,
      TODAY,
    );

    expect(panel.meanTargetKcal).toBe(2200);
  });

  it('smooths each macro over the same week as the calories', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-12', macros(100, 200, 60, 1800), null),
        day('2026-09-13', macros(200, 300, 80, 2200), null),
      ],
      10,
      TODAY,
    );

    // Each position averages the window ending on it, exactly as the calories
    // do — the chart draws the two together on one pair of axes, so a macro
    // smoothed differently would be a line that cannot be compared.
    expect(panel.rollingMacroSeries.protein).toEqual([100, 150]);
    expect(panel.rollingMacroSeries.carbs).toEqual([200, 250]);
    expect(panel.rollingMacroSeries.fat).toEqual([60, 70]);
    expect(panel.rollingKcalSeries).toEqual([1800, 2000]);
  });

  it('leaves the raw macros untouched beside the smoothed ones', () => {
    // Both are kept: the smoothed series are what the chart draws, the raw ones
    // are what they are computed from, and nothing should have to undo one to
    // get the other.
    const panel = nutritionPanel(
      [day('2026-09-12', macros(100, 200, 60, 1800), null), day('2026-09-13', null, null)],
      10,
      TODAY,
    );

    expect(panel.macroSeries.protein).toEqual([100, null]);
    // A gap does not reset the smoothing: the window still holds a measurement.
    expect(panel.rollingMacroSeries.protein).toEqual([100, 100]);
  });

  it('has no split when nothing was recorded', () => {
    const panel = nutritionPanel([day('2026-09-13', null, GOAL)], 10, TODAY);
    expect(panel.splits).toBeNull();
    expect(panel.meanConsumed).toBeNull();
  });
});

describe('what the card says', () => {
  it('never shows a percentage without its denominator', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-11', GOAL, GOAL),
        day('2026-09-12', GOAL, GOAL),
        day('2026-09-13', macros(10, 10, 10, 100), GOAL),
      ],
      10,
      TODAY,
    );

    expect(formatAdherenceRate(panel.adherence.rate)).toBe('67 %');
    // Against the range the reader CHOSE — three days handed in — never
    // against the two that happened to be finished.
    expect(describeAdherenceDenominator(panel.adherence)).toBe(
      '2 sur 3 journées mesurées, sur 3 jours.',
    );
  });

  it('names both kinds of excluded day, and only when there are some', () => {
    const clean = nutritionPanel([day('2026-09-13', GOAL, GOAL)], 10, TODAY);
    expect(describeAdherenceExclusions(clean.adherence)).toBeNull();

    const messy = nutritionPanel(
      [
        day('2026-09-11', GOAL, GOAL),
        day('2026-09-12', null, GOAL),
        day('2026-09-13', GOAL, null),
      ],
      10,
      TODAY,
    );
    expect(describeAdherenceExclusions(messy.adherence)).toBe(
      'Non comptées : 1 journée non renseignée, 1 journée sans objectif.',
    );
  });

  it('agrees in the singular', () => {
    const panel = nutritionPanel([day('2026-09-13', GOAL, GOAL)], 10, TODAY);
    expect(describeAdherenceDenominator(panel.adherence)).toBe(
      '1 sur 1 journée mesurée, sur 1 jour.',
    );
  });

  it('names today among the exclusions, so the subtraction adds up', () => {
    // THE DEFECT THIS ANSWERS. Choosing seven days and reading "sur 6" was a
    // rule applied in silence: nothing on the screen accounted for the missing
    // day, and a denominator nobody can check is the thing specs 8.7 no 2
    // exists to prevent.
    const panel = nutritionPanel(
      [
        day('2026-09-12', GOAL, GOAL),
        day('2026-09-13', GOAL, GOAL),
        day('2026-09-14', GOAL, GOAL),
      ],
      10,
      TODAY,
    );

    expect(panel.range).toBe(3);
    expect(panel.span).toBe(2);
    expect(describeAdherenceDenominator(panel.adherence)).toBe(
      '2 sur 2 journées mesurées, sur 3 jours.',
    );
    expect(describeAdherenceExclusions(panel.adherence)).toBe(
      'Non comptées : la journée en cours.',
    );
  });

  it('adds up: judged plus every exclusion is the range', () => {
    const panel = nutritionPanel(
      [
        day('2026-09-10', GOAL, GOAL),
        day('2026-09-11', null, GOAL),
        day('2026-09-12', GOAL, null),
        day('2026-09-13', GOAL, GOAL),
        day('2026-09-14', GOAL, GOAL),
      ],
      10,
      TODAY,
    );

    const blank = panel.adherence.span - panel.adherence.recorded;
    const goalless = panel.adherence.recorded - panel.adherence.judged;
    const inProgress = panel.adherence.range - panel.adherence.span;

    expect(panel.adherence.judged + blank + goalless + inProgress).toBe(
      panel.adherence.range,
    );
  });

  it('says a dash and an explanation rather than nought per cent', () => {
    // Nought per cent is a measurement: it says every judged day missed. No
    // judged day is not that, and printing 0 % would tell someone they had
    // failed completely on the day they installed the application.
    const panel = nutritionPanel([day('2026-09-13', null, null)], 10, TODAY);
    expect(formatAdherenceRate(panel.adherence.rate)).toBe('—');
    expect(describeAdherenceDenominator(panel.adherence)).toBe(
      'Aucune journée à mesurer sur 1 jour.',
    );
  });

  it('says how many days a mean actually covers', () => {
    expect(describeMeanBasis(18, 30)).toBe(
      'Moyenne sur 18 journées renseignées, sur 30 jours — la journée en cours n’est pas comptée.',
    );
    expect(describeMeanBasis(1, 30)).toBe(
      'Moyenne sur 1 journée renseignée, sur 30 jours — la journée en cours n’est pas comptée.',
    );
    expect(describeMeanBasis(0, 30)).toBe('Aucune journée renseignée sur 30 jours.');
  });
});
