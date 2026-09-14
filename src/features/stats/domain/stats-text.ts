import { formatKcal, formatMacroWhole } from '@/core/format';
import type { Adherence } from './adherence';

/**
 * The sentences the panel says about its own figures (specs 8.7).
 *
 * Pure, and here rather than in the components, for the reason portion-text
 * and recipe-text are: a sentence assembled in a render path is a sentence no
 * test can reach, and these are the ones that must not be wrong. A denominator
 * that says "sur 30 jours" when it means eighteen is a lie in the reassuring
 * direction, which is the direction this project refuses.
 */

/**
 * French agreement, done once rather than in a ternary per sentence.
 *
 * Zero takes the SINGULAR in French — "0 journée terminée" — which is the rule
 * an English-shaped `n === 1` check gets wrong, and the rule nobody would
 * notice being wrong until a range with no data was on screen.
 */
function plural(count: number, one: string, many = `${one}s`): string {
  return Math.abs(count) < 2 ? one : many;
}

/** "92 %", or a dash when nothing could be judged. */
export function formatAdherenceRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`;
}

/**
 * The denominator, which specs 8.7 no 2 makes obligatory.
 *
 * > Corollaire obligatoire : le pourcentage est toujours affiché avec son
 * > dénominateur — « 92 % sur 18 jours renseignés / 30 ». Sans cela, la
 * > statistique récompense l'abandon du journal.
 *
 * `span` rather than the range's own length, because the day in progress is
 * not one of the days being judged: saying "sur 30" when only 29 could ever
 * have counted would misstate the denominator in exactly the way this rule
 * exists to prevent.
 */
export function describeAdherenceDenominator(adherence: Adherence): string {
  const finished = `${adherence.span} ${plural(adherence.span, 'terminée')}`;

  if (adherence.judged === 0) {
    return adherence.span === 0
      ? 'Aucune journée terminée sur cette plage.'
      : `Aucune journée à mesurer sur ${finished}.`;
  }

  const measured = plural(adherence.judged, 'journée mesurée', 'journées mesurées');
  return `${adherence.within} sur ${adherence.judged} ${measured}, sur ${finished}.`;
}

/**
 * What was left out, when something was.
 *
 * Two absences, and they are different facts about the user's history rather
 * than two ways of saying "no data":
 *
 *  - nothing written down that day — specs 8.7 no 1, an absence of measurement;
 *  - written down, but the day had no goal — which is EVERY day materialised
 *    before migration 0004, permanently, and the sort of thing a user is
 *    entitled to be told rather than left to infer from a denominator that
 *    does not add up.
 *
 * Null when there is nothing to explain, so the card renders no line at all
 * rather than a reassuring "0 journées exclues".
 */
export function describeAdherenceExclusions(adherence: Adherence): string | null {
  const blank = adherence.span - adherence.recorded;
  const goalless = adherence.recorded - adherence.judged;

  const parts: string[] = [];
  if (blank > 0) {
    parts.push(`${blank} ${plural(blank, 'journée non renseignée', 'journées non renseignées')}`);
  }
  if (goalless > 0) {
    parts.push(`${goalless} ${plural(goalless, 'journée sans objectif', 'journées sans objectif')}`);
  }

  if (parts.length === 0) return null;
  return `Non comptées : ${parts.join(', ')}.`;
}

/** "± 10 % sur les quatre macros. La journée en cours n'est pas comptée." */
export function describeAdherenceRule(tolerancePct: number): string {
  return `± ${tolerancePct} % sur les quatre macros. La journée en cours n’est pas comptée.`;
}

/** "2 145 kcal", or a dash. Whole calories, as specs 5.1 requires. */
export function formatMeanKcal(value: number | null): string {
  return value === null ? '—' : `${formatKcal(value)} kcal`;
}

/**
 * "150 g", whole.
 *
 * Whole grams rather than the one decimal specs 5.1 asks of a single food, on
 * the precedent amendment 14.6 no 19 set for a day's and a meal's totals: a
 * tenth of a gram is a real distinction on one food, where it is what was
 * measured. On a mean over ninety days it is arithmetic noise wearing the
 * clothes of precision.
 */
export function formatMeanGrams(value: number): string {
  return `${formatMacroWhole(value)} g`;
}

/** "27 %", the share of calories one macro accounts for. */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** "sur 18 jours renseignés" — how many days a mean actually covers. */
export function describeMeanBasis(recorded: number, span: number): string {
  if (recorded === 0) return `Aucune journée renseignée sur ${span}.`;
  const days = plural(recorded, 'journée renseignée', 'journées renseignées');
  return `Moyenne sur ${recorded} ${days}, sur ${span}.`;
}
