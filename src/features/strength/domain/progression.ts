import type { SetType } from '@/core/db/schema';

/**
 * Double progression (specs 10.4), as a pure function (D9).
 *
 * > Condition : sur la séance la plus récente comportant cet exercice, toutes
 * > les séries de travail ont atteint le haut de la plage de répétitions à la
 * > charge cible. Le RIR n'entre pas dans la condition.
 * > Effet : l'application affiche une suggestion à la séance suivante. Elle ne
 * > modifie jamais la routine ni la charge cible automatiquement.
 * > Incrément : défini par exercice.
 * > Ne s'applique qu'aux lignes où la règle est activée, et aux séries de type
 * > travail.
 *
 * It knows neither the database nor React: it is handed the working sets of one
 * session and the exercise's increment, and it answers with a number or with
 * nothing. D9 lists "suggestion de double progression" among the things that
 * are always recomputed, so nothing here is ever written down.
 *
 * ## IT ONLY EVER SUGGESTS, WHICH IS WHY EVERY DOUBT ANSWERS "NOTHING"
 *
 * Nobody is blocked by a missing suggestion and nobody is misled by one; a
 * wrong suggestion, on the other hand, is a heavier bar than the lifter has
 * earned, proposed by the application, in front of somebody about to load it.
 * So every case this function cannot evaluate confidently returns null rather
 * than a best guess. That asymmetry is the whole of its design.
 */

/** One set as the rule needs to see it. */
export interface ProgressionSet {
  setType: SetType;
  status: string;
  progressionEnabled: 0 | 1;
  targetLoadKg: number | null;
  targetRepsMax: number | null;
  loadKg: number | null;
  reps: number | null;
}

export interface ProgressionSuggestion {
  /** What to try next time, in kilograms. */
  loadKg: number;
  /** The exercise's own increment (specs 6.3), for the "+2,5 kg" in the label. */
  incrementKg: number;
  /** The target that was met, which the suggestion is measured from. */
  fromLoadKg: number;
}

/**
 * The suggestion one session earns for one exercise, or nothing.
 *
 * `sets` are the WORKING sets of the most recent session that contained this
 * exercise — the caller decides which session that is, because "la plus
 * récente" is a question about the history and this module is given only one
 * session's worth of rows.
 *
 * ## "TOUTES LES SÉRIES DE TRAVAIL" MEANS THE ENABLED ONES, AND THAT IS A READING
 *
 * Specs 10.4 says the condition covers "toutes les séries de travail" and then
 * says the rule "ne s'applique qu'aux lignes où la règle est activée". Read
 * together: among the lines carrying the rule, all must have reached the top.
 * A line with the rule switched off is not evidence for or against — switching
 * it off is how somebody says "do not reason about this set".
 *
 * FLAGGED as a reading; written up in specs 14.42. The alternative — requiring
 * every working set to carry the rule — would make one un-ticked line silently
 * disable progression for the whole exercise, which is a setting doing
 * something it does not say.
 *
 * ## A SET NOT VALIDATED FAILS THE CONDITION, IT DOES NOT VANISH
 *
 * This is why history-reads deliberately does not filter on status. Three sets
 * planned, two performed at the top of the range and one skipped, is not
 * "toutes les séries ont atteint le haut" — it is a session that was cut short.
 * Dropping the skipped row would turn an abandoned session into a perfect one
 * and propose more weight for less work.
 *
 * ## ONE TARGET LOAD, OR NOTHING
 *
 * Specs 10.4 says "à la charge cible", singular. Double progression is a rule
 * about a fixed working weight: you add repetitions until the top of the range,
 * then you add weight. Sets carrying different targets are a pyramid or a drop
 * scheme, which is a different rule the document does not describe — so there
 * is no honest single number to suggest, and the answer is nothing.
 *
 * FLAGGED, and it is the cautious direction: the cost is a suggestion that
 * does not appear on an unusual scheme.
 *
 * ## THE COMPARISONS ARE >=, NOT ==
 *
 * Somebody who did nine repetitions where eight were asked, or 75 kg where 70
 * were targeted, has done MORE than the condition requires. Equality would
 * withhold the suggestion from exactly the person who earned it hardest, and
 * would do it silently.
 *
 * ## THE RIR IS ABSENT, AND SPECS 10.4 SAYS SO IN AS MANY WORDS
 *
 * "Le RIR n'entre pas dans la condition." Written here because it is the first
 * thing somebody would reach for: three sets at the top of the range with a RIR
 * of zero looks like a lifter at their limit. The document decided otherwise,
 * and the reason it is defensible is that the RIR is a feeling, while the
 * repetitions and the load are what happened.
 */
export function suggestProgression(
  sets: readonly ProgressionSet[],
  incrementKg: number,
): ProgressionSuggestion | null {
  if (!Number.isFinite(incrementKg) || incrementKg <= 0) return null;

  const governed = sets.filter(
    (set) => set.setType === 'work' && set.progressionEnabled === 1,
  );
  if (governed.length === 0) return null;

  let target: number | null = null;

  for (const set of governed) {
    if (set.status !== 'done') return null;

    // A bodyweight set has no target load and a timed one has no rep range:
    // neither can be measured against "le haut de la plage à la charge cible",
    // so neither earns a suggestion in kilograms.
    if (set.targetLoadKg === null || set.targetRepsMax === null) return null;
    if (!Number.isFinite(set.targetLoadKg) || !Number.isFinite(set.targetRepsMax)) return null;

    if (target === null) target = set.targetLoadKg;
    else if (target !== set.targetLoadKg) return null;

    if (set.reps === null || !Number.isFinite(set.reps)) return null;
    if (set.loadKg === null || !Number.isFinite(set.loadKg)) return null;
    if (set.reps < set.targetRepsMax) return null;
    if (set.loadKg < set.targetLoadKg) return null;
  }

  if (target === null) return null;

  return {
    // Rounded to the gram, as normalizeProgressionIncrement rounds the
    // increment itself: 70 + 0.1 is 70.10000000000001 in binary floating point,
    // and a suggestion is a number somebody reads off a screen and puts on a
    // bar.
    loadKg: Math.round((target + incrementKg) * 1000) / 1000,
    incrementKg,
    fromLoadKg: target,
  };
}
