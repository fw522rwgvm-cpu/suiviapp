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

/** "2 450" — calories, whole, grouped in threes. */
export function formatKcal(value: number): string {
  return formatFixed(roundKcal(value), 0);
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
