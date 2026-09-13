/**
 * What the three wheels of the quantity screen are showing, and the two rules
 * that keep what they show meaningful.
 *
 * Pure, and kept out of the component on purpose: these are rules about a
 * value, not about a control. A later adjustment to a picker's look must not
 * be able to undo them, and here they can be stated once and checked.
 */

/** The fractions a person actually says, in the order they grow. */
export const FRACTIONS: readonly { label: string; value: number }[] = [
  // The first is "none", spelled as a dash rather than as 0: a wheel showing 0
  // beside another 0 reads as a figure of nought point nought.
  { label: '—', value: 0 },
  { label: '1/8', value: 0.125 },
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 0.5 },
  { label: '2/3', value: 2 / 3 },
  { label: '3/4', value: 0.75 },
  { label: '7/8', value: 0.875 },
];

/** The first real fraction, where the dash is pushed when it cannot stay. */
const SOME = 1;

export interface WheelChoice {
  /** The whole part, as shown on the first wheel. */
  whole: number;
  /** Index into FRACTIONS. */
  fraction: number;
  /** Index into the units: 0 is the base unit, the rest are the food's portions. */
  unit: number;
}

/**
 * A unit the wheels can count in: the base unit, or one of the food's portions
 * with what one of them weighs.
 */
export interface WheelUnit {
  label: string;
  /** Base units in one of these. Null for the base unit itself. */
  size: number | null;
}

export function amountOf(choice: WheelChoice): number {
  return choice.whole + (FRACTIONS[choice.fraction]?.value ?? 0);
}

/** The nearest face the fraction wheel has. It has seven, and no others. */
export function nearestFraction(rest: number): number {
  return FRACTIONS.reduce(
    (best, candidate, index) =>
      Math.abs(candidate.value - rest) < Math.abs((FRACTIONS[best]?.value ?? 0) - rest)
        ? index
        : best,
    0,
  );
}

/**
 * What the wheels should show, given what they showed and what was just moved.
 *
 * ## A PORTION STARTS AT ONE
 *
 * Turning the unit wheel to "tranche" means "I am going to say this in
 * slices", and the answer that almost always follows is one of them. Carrying
 * the previous number across would offer 100 slices, which is not a mistake
 * anyone makes but is a number everyone then has to undo.
 *
 * Back the other way it is the opposite: base units are what the entry is
 * stored in, so leaving a portion for grams KEEPS THE AMOUNT and says it
 * differently. One slice becomes 25 g, not 1 g — a gram is never a portion of
 * anything, and the rule that mattered here from the start is that changing
 * how you say it must not change what you are about to eat.
 *
 * ## NOTHING AND NO FRACTION OF IT IS NOT A QUANTITY
 *
 * Zero with a dash beside it is an empty answer sitting in a control that has
 * no empty state, and the button below would simply be dead without saying
 * why. So the two can never be shown together: whichever wheel was NOT just
 * moved yields — the dash becomes an eighth, or the nought becomes a one.
 */
export function settleWheel(
  previous: WheelChoice,
  next: WheelChoice,
  units: readonly WheelUnit[],
): WheelChoice {
  if (next.unit !== previous.unit) {
    const arriving = units[next.unit];
    if (arriving !== undefined && arriving.size !== null) {
      return { whole: 1, fraction: 0, unit: next.unit };
    }

    // Leaving a portion for the base unit: say the same amount in base units.
    const leaving = units[previous.unit];
    const base = amountOf(previous) * (leaving?.size ?? 1);
    const whole = Math.floor(base);
    return { whole, fraction: nearestFraction(base - whole), unit: next.unit };
  }

  if (next.whole !== 0 || next.fraction !== 0) return next;

  // Both at nothing. The one that did not move gives way.
  return next.whole === previous.whole
    ? { ...next, whole: 1 }
    : { ...next, fraction: SOME };
}
