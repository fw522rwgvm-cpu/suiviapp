import { formatQuantity } from '@/core/format';
import type { QuantityChoice } from '../domain/portions';

/**
 * French wording for portions (D10: no internationalisation library).
 *
 * Display strings live in the domain that uses them, and these are shared by
 * the journal row and the quantity screen — two real users, which is what the
 * shared-core rule asks for before anything moves.
 *
 * The plural is not decoration. "2 tranche" reads as a bug in a screen whose
 * whole job is to be trusted at a glance, and the naive rule gets one of the
 * eight names of specs 6.1 wrong: morceau takes an x, not an s.
 */

/** Words ending in -eau take -x in the plural. */
function pluralise(name: string): string {
  const [head = '', ...rest] = name.split(' ');
  const plural = head.endsWith('eau') ? `${head}x` : `${head}s`;
  // Only the head word agrees: "cuilleres a soupe", never "cuilleres a soupes".
  return [plural, ...rest].join(' ');
}

/**
 * "2 tranches", "1 bol", "2,5 cuillères à soupe".
 *
 * A fractional count is kept rather than rounded away: 60 g of a 25 g slice is
 * 2,4 slices, and rounding it for display then reading it back would move the
 * quantity every time the entry was opened.
 */
export function formatPortionCount(count: number, name: string): string {
  const rounded = Math.round(count * 10) / 10;
  // The portion's name IS the unit here, which is what formatQuantity is for:
  // it already drops a trailing ",0" and joins with a non-breaking space, so
  // "2 tranches" never wraps between the figure and the word.
  // French pluralises from 2; 1,5 stays singular, as does 0,5.
  return formatQuantity(rounded, rounded >= 2 ? pluralise(name) : name);
}

/**
 * What a journal row says about a quantity.
 *
 * The portion first and the base quantity beside it: the portion is what was
 * meant, the grams are what it came to. Showing only the grams would be
 * showing the storage form, which is the same mistake as showing a free entry
 * as "100 g".
 */
export function formatEntryQuantity(
  quantity: number,
  baseUnit: string,
  portionName: string | null,
  portionQuantity: number | null,
): string {
  if (portionName === null || portionQuantity === null || portionQuantity <= 0) {
    return formatQuantity(quantity, baseUnit);
  }

  const count = formatPortionCount(quantity / portionQuantity, portionName);
  return `${count} · ${formatQuantity(quantity, baseUnit)}`;
}

/**
 * A quantity as it was CHOSEN, in one phrase.
 *
 * The portion alone when there is one: "2 tranches" is the decision, "50 g" is
 * what it came to, and the two together say one fact twice in a place that has
 * room for one. That is the basket's rule, and it applies wherever a quantity
 * is shown as something about to happen rather than as something already in
 * the journal — where formatEntryQuantity shows both, because an entry has to
 * be readable against a total.
 *
 * Written once here rather than in each caller: the basket row and the recents
 * row ask exactly the same question, and two spellings of it would drift.
 */
export function formatChoiceQuantity(choice: QuantityChoice, baseUnit: string): string {
  return choice.portion === null
    ? formatQuantity(choice.baseQuantity, baseUnit)
    : formatPortionCount(choice.portion.count, choice.portion.name);
}
