import { describe, expect, it } from 'vitest';
import { parseDecimal } from '../../src/core/format';

/**
 * The defect DecimalInput exists to end, pinned as arithmetic.
 *
 * The component itself does not render from Node, so what is fixed here is the
 * ROUND TRIP it removes — the one the food editor, the portion editor, the
 * ingredient editor, the recipe yield and the adjusted lines all performed on
 * every keystroke.
 */

/** What the broken binding did: number in state, string on screen. */
function throughNumber(typed: string): { stored: number; shown: string } {
  const stored = parseDecimal(typed) ?? 0;
  return { stored, shown: stored === 0 ? '' : String(stored).replace('.', ',') };
}

/** What DecimalInput does: text in state, number reported upwards. */
function throughText(typed: string): { stored: number | null; shown: string } {
  return { stored: parseDecimal(typed), shown: typed };
}

/** Types a string one character at a time through a binding. */
function type(
  chars: string,
  binding: (typed: string) => { shown: string },
): string {
  let shown = '';
  for (const char of chars) shown = binding(shown + char).shown;
  return shown;
}

describe('typing a decimal through a NUMBER', () => {
  it('eats the separator and moves the digits', () => {
    /**
     * NOT MERELY "LOSES THE DECIMAL" — this is the assertion that matters.
     *
     *   typed "1"    -> stored 1  -> shows "1"
     *   typed "1,"   -> stored 1  -> shows "1"      the comma is gone
     *   typed "1,2"  -> the field now holds "12"
     *
     * One point two grams becomes twelve. Plausible, wrong, invisible.
     */
    expect(type('1,2', throughNumber)).toBe('12');
    expect(parseDecimal(type('1,2', throughNumber))).toBe(12);
  });

  it('does it with a point as readily as a comma', () => {
    // Not a French-keyboard problem: the separator is eaten either way.
    expect(type('1.2', throughNumber)).toBe('12');
  });

  it('makes the decimal unreachable however long the number', () => {
    expect(type('12,5', throughNumber)).toBe('125');
    expect(type('0,3', throughNumber)).toBe('3');
  });
});

describe('typing a decimal through the TEXT', () => {
  it('keeps every intermediate state a person types', () => {
    expect(type('1,2', throughText)).toBe('1,2');
    expect(parseDecimal(type('1,2', throughText))).toBe(1.2);
  });

  it('lets a half-typed value exist', () => {
    // "1," is a legal intermediate state of typing "1,2" and must survive on
    // screen; it simply parses to 1 for anyone who asks.
    expect(throughText('1,').shown).toBe('1,');
    expect(throughText('1,').stored).toBe(1);
  });

  it('takes both separators, whichever the keyboard offers', () => {
    expect(throughText('1,2').stored).toBe(1.2);
    expect(throughText('1.2').stored).toBe(1.2);
  });

  it('reports null for an empty field rather than zero', () => {
    // A macro nobody has filled in is not a macro of zero — the distinction the
    // whole of specs 8.5 rests on, one field down.
    expect(throughText('').stored).toBeNull();
  });

  it('survives the values a scale and a label actually produce', () => {
    for (const typed of ['0,1', '1,2', '12,5', '78,4', '104,9', '2450']) {
      expect(type(typed, throughText)).toBe(typed);
    }
  });
});
