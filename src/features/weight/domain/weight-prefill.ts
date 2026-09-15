import { compareLocalDate, type LocalDate } from '@/core/date';

/**
 * What a date proposes before anything is typed, and how a tap adjusts it
 * (specs 9.1, amended — see specs 14.15).
 *
 * Pure (D9): no database, no React, no clock. `today` is always a parameter.
 *
 * ## ONE FUNCTION, AND EVERYTHING READS IT
 *
 * The card shows a figure, the "+" and "−" adjust it, and the window opens on
 * it. Slice 4 settled what happens when those are three code paths: they agree
 * almost always, and the day they diverge the row LIES ABOUT WHAT ITS OWN
 * BUTTON DOES — both numbers being plausible, nothing says so.
 *
 * > La quantité affichée EST celle qui sera ajoutée. Pas « la même à peu
 * > près » : la ligne, le bouton et l'écran tirent la valeur d'une seule
 * > fonction pure, une seule fois.
 *
 * The same rule, applied here. Every test asserts against this function and
 * never against a literal.
 */

/**
 * What the card has to show for a date.
 *
 * THREE CASES, NEVER TWO. A figure carried over from an earlier weighing is not
 * a measurement of this date, and a card that drew them alike would state a
 * weight nobody stood on a scale for — plausible, wrong, and invisible. The
 * kind is what lets the card say which it is.
 */
export type WeightPrefill =
  /** This date was weighed. The figure is a measurement. */
  | { kind: 'measured'; valueKg: number }
  /** Not weighed; the figure is carried from the last weighing before it. */
  | { kind: 'carried'; valueKg: number; from: LocalDate }
  /** Nothing to propose: nothing has ever been weighed before this date. */
  | { kind: 'none' };

/**
 * The figure a date proposes.
 *
 * > Par défaut la valeur du poids du jour doit être la même que celle de la
 * > journée précédente.
 *
 * ## "THE PREVIOUS DAY" IS READ AS "THE LAST WEIGHING BEFORE THIS ONE"
 *
 * Interpretation, flagged. The literal reading is the civil day before, and it
 * would leave the default empty on any date whose eve was missed — which on a
 * history that deliberately has holes (nobody weighs daily) is most of them.
 * The useful reading is the one the quantity chain of specs 8.4 already uses:
 * the last one there was, whenever it was.
 *
 * `from` travels with the figure so the card can say WHEN it came from. A
 * weight carried over from three weeks ago is worth proposing and worth
 * labelling; the same figure with no date beside it is a claim.
 */
export function weightPrefill(
  measured: number | null,
  previous: { date: LocalDate; valueKg: number } | null,
): WeightPrefill {
  if (measured !== null) return { kind: 'measured', valueKg: measured };
  if (previous !== null) {
    return { kind: 'carried', valueKg: previous.valueKg, from: previous.date };
  }
  return { kind: 'none' };
}

/** The figure itself, or null when there is nothing to propose. */
export function prefillValue(prefill: WeightPrefill): number | null {
  return prefill.kind === 'none' ? null : prefill.valueKg;
}

/**
 * One notch of a domestic scale.
 *
 * The same tenth formatWeight always prints, so a tap moves the figure by
 * exactly one visible digit — a step the display rounded away would be a button
 * that appears to do nothing.
 */
export const WEIGHT_STEP_KG = 0.1;

/**
 * The smallest weight a step may land on.
 *
 * ck_weight_value refuses anything at or below zero, and a CHECK violation is a
 * thrown SQLite error, not a disabled button. Nobody will ever step down from
 * 0.1 kg — but "nobody will" is not a reason to leave a crash reachable, and the
 * clamp costs one comparison.
 */
export const MIN_WEIGHT_KG = WEIGHT_STEP_KG;

/**
 * The value one tap away, up or down.
 *
 * ## IT ROUNDS, AND IT HAS TO
 *
 * 78.4 - 0.1 is 78.30000000000001 in binary floating point. Stored as such it
 * would be a weight with fourteen decimals in the database, exported with them
 * into the archive, and displayed as 78,3 — so the figure on screen and the
 * figure in the file would stop being the same number, silently, after the
 * first tap. Rounding to the tenth here keeps the stored value exactly what the
 * card says it is.
 */
export function stepWeight(valueKg: number, steps: number): number {
  const stepped = Math.round((valueKg + steps * WEIGHT_STEP_KG) * 10) / 10;
  return Math.max(MIN_WEIGHT_KG, stepped);
}

/**
 * Whether a date may be weighed at all.
 *
 * > On ne doit pas pouvoir définir le poids pour une journée future.
 *
 * ## A DIVERGENCE FROM SPECS 9.1, REQUESTED AND RECORDED
 *
 * The specs say "saisie possible sur n'importe quelle date, passée comme
 * future, sans limite". This contradicts that sentence outright, so the
 * sentence is amended rather than quietly ignored (specs 14.15).
 *
 * ## AND IT CANNOT BE A CHECK, FOR THE REASON target_date CANNOT
 *
 * "In the future" is not a property of the row: it is a relation between the
 * row and the clock, and it changes on its own overnight. A CHECK is evaluated
 * at write time and would then be silently false for every measurement that
 * ages — which is not corruption, it is yesterday. So the rule lives at the
 * write boundary and on screen, where it can say why.
 *
 * The consequence, stated so it is deliberate: a future measurement already in
 * the database — from an archive written before this rule, or repaired by
 * hand — stays perfectly legal. It is read, drawn and deletable like any other.
 * What is refused is CREATING one.
 */
export function canWeighOn(date: LocalDate, today: LocalDate): boolean {
  return compareLocalDate(date, today) <= 0;
}
