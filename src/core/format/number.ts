/**
 * Display rounding and French number formatting (specs 5.1).
 *
 * > Protein, carbs and fat to one decimal, kcal as a whole number. Internal
 * > calculations run at full precision.
 *
 * Rounding therefore belongs here and nowhere else: a value rounded on its way
 * into a calculation accumulates error, and a value rounded twice drifts.
 * Nothing in this module is ever fed back into arithmetic.
 *
 * No internationalisation library (D10): the interface is French only, so the
 * rules are written out rather than negotiated with a locale database whose
 * output varies with the ICU version shipped by the platform.
 */

/** Narrow enough to read as a group separator, unbreakable so it never wraps. */
const GROUP_SEPARATOR = '\u00A0';
const DECIMAL_SEPARATOR = ',';

/** Grams of protein, carbs or fat: one decimal. */
export function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Calories: a whole number. */
export function roundKcal(value: number): number {
  return Math.round(value);
}

function groupThousands(digits: string): string {
  // Walks from the right so the leftmost group is the short one.
  let out = '';
  for (let index = digits.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    out = digits.slice(start, index) + (out === '' ? '' : GROUP_SEPARATOR + out);
  }
  return out;
}

function formatFixed(value: number, decimals: number): string {
  // Adding zero collapses -0, which would otherwise print as "-0".
  const fixed = (value + 0).toFixed(decimals);
  const negative = fixed.startsWith('-');
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole = '0', fraction] = unsigned.split('.');
  const body =
    fraction === undefined
      ? groupThousands(whole)
      : groupThousands(whole) + DECIMAL_SEPARATOR + fraction;
  return negative && Number(unsigned) !== 0 ? `-${body}` : body;
}

/** "20,5" — grams of a macro, one decimal, French separator. */
export function formatMacro(value: number): string {
  return formatFixed(roundMacro(value), 1);
}

/**
 * "48" — grams of a macro, rounded to the nearest whole.
 *
 * A DIVERGENCE FROM SPECS 5.1, which asks for one decimal on protein, carbs
 * and fat, taken on request and only for the TOTALS of a day or a meal.
 *
 * The reasoning it rests on: a tenth of a gram is a real distinction on one
 * food, where it is what was measured. On a sum of a dozen entries it is
 * arithmetic noise wearing the clothes of precision — and it is read beside a
 * target that was itself typed as a round number. An individual entry keeps
 * its decimal, because there the figure IS the measurement.
 *
 * Internal calculation stays in full precision either way (specs 5.1); this is
 * a rounding at the point of display, like every other function here.
 */
export function formatMacroWhole(value: number): string {
  return formatFixed(Math.round(value), 0);
}

/** "2 450" — calories, whole, grouped in threes. */
export function formatKcal(value: number): string {
  return formatFixed(roundKcal(value), 0);
}

/**
 * Reads a number back from a field the user typed into.
 *
 * The iOS decimal keypad offers whichever separator the device is set to, so
 * both have to be accepted: refusing "20,5" from a French keyboard would be an
 * obstacle on the critical path, which conventions section 4 forbids outright.
 * Returns null rather than NaN — an expected failure is a value.
 */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '') return null;
  // Number('') is 0 and Number(' 1 2') is NaN, so the shape is checked first:
  // a lone sign or a stray letter must not read as a quantity.
  if (!/^-?\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * "120 g" — a quantity in base units. Quantities are entered by hand and are
 * rarely fractional, so a trailing ",0" would be noise.
 */
export function formatQuantity(value: number, unit: string): string {
  const rounded = roundMacro(value);
  const text = Number.isInteger(rounded) ? formatFixed(rounded, 0) : formatFixed(rounded, 1);
  return `${text}${GROUP_SEPARATOR}${unit}`;
}
