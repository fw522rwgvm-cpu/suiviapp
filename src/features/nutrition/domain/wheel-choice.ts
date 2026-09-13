import type { QuantityChoice } from './portions';
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

/**
 * Where the three wheels must stand to show a quantity.
 *
 * PURE, AND CALLED AT MOUNT RATHER THAN IN AN EFFECT — that distinction is the
 * whole reason it exists as a function. It used to live inside a useEffect: the
 * wheels mounted on a default of 100 and were moved to the real value once the
 * query answered, one render later, which on the device is visible. The wheels
 * spun into place every time the screen opened.
 *
 * An effect runs after its render has been painted, so no arrangement of
 * effects can fix that; the value has to be known before the wheels exist.
 * Callers therefore hold the screen until they have it, and this turns it into
 * an initial state.
 *
 * The unit is resolved against the portions the food offers TODAY. One renamed
 * or dropped since falls back to base units, which is the same answer the
 * pre-fill chain gives for the same reason.
 */
export function wheelFor(
  choice: QuantityChoice,
  portions: readonly { name: string }[],
): WheelChoice {
  const amount = choice.portion === null ? choice.baseQuantity : choice.portion.count;
  const named = choice.portion?.name ?? null;
  const found = portions.findIndex((portion) => portion.name === named);
  const unit = named === null || found < 0 ? 0 : found + 1;

  // The NEAREST face the wheel has, not the exact remainder: these are wheels,
  // and 0,37 of a slice is not one of their faces. A quantity in base units
  // lands on the dash, whole numbers being what it deals in.
  const whole = Math.floor(amount);

  return { whole, fraction: nearestFraction(amount - whole), unit };
}

/**
 * The largest whole number the wheels carry.
 *
 * Declared here rather than in the picker because it is now a DOMAIN limit:
 * a quantity typed by hand has to be brought back inside it, and that is a
 * rule about quantities rather than about how many rows a list renders. The
 * picker reads it from here.
 */
export const LAST_WHOLE = 1000;

/**
 * The same wheels, standing on a quantity typed by hand (specs 8.4).
 *
 * ## WHY THE UNIT IS UNTOUCHED
 *
 * Typing replaces the NUMBER, never what it counts. The field opens on the row
 * showing "2 tranches (50 g)", so what is being retyped is the 2 — and a
 * keyboard that silently switched a portion back to grams would answer a
 * question nobody asked.
 *
 * ## AND WHY IT GOES THROUGH THE WHEELS AT ALL
 *
 * The wheels stay the single source of truth: what is typed lands on them, and
 * everything downstream reads them. The alternative — keeping the typed value
 * beside them — is two answers to one question, which is the shape of bug this
 * whole screen already avoids once.
 *
 * The cost, and it is visible rather than silent: the wheels carry eight
 * fractions, so a decimal they cannot express lands on the nearest one they
 * can. Typing 137,3 g gives 137 and a third. For the case that motivated a
 * keyboard at all — a whole number of grams off a scale — there is nothing to
 * lose, and the wheels visibly move to what was understood.
 */
export function wheelWithAmount(wheel: WheelChoice, amount: number): WheelChoice {
  // Clamped rather than refused: a hand on a number pad produces 1370 for 137
  // often enough, and a wheel that cannot show it would otherwise be left on a
  // value nobody chose.
  const bounded = Math.min(Math.max(amount, 0), LAST_WHOLE);
  const whole = Math.floor(bounded);

  return { ...wheel, whole, fraction: nearestFraction(bounded - whole) };
}
