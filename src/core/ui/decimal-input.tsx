import { useState } from 'react';
import type { Ref } from 'react';
import type { TextInput, TextInputProps } from 'react-native';
import { parseDecimal } from '@/core/format';
import { FormInput } from './form-section';

/**
 * A numeric field whose value lives as a NUMBER in the caller's state.
 *
 * ## THE BUG THIS EXISTS TO END, WHICH WAS SHIPPED IN FIVE PLACES
 *
 * The obvious way to bind a number to a text field is to render `String(value)`
 * and parse on every keystroke. It eats the decimal separator, and it does not
 * merely lose it — it moves the digits:
 *
 *   typed "1"    -> stored 1  -> field shows "1"
 *   typed "1,"   -> stored 1  -> field shows "1"     <- the comma is gone
 *   typed "1,2"  -> is now "12" in the field
 *   stored: 12
 *
 * Twelve grams where one point two was meant. Plausible, wrong, and invisible —
 * the only kind of wrong this project treats as serious. It was reachable on
 * the four macros of a food, a portion's quantity, an ingredient's quantity, a
 * recipe's yield and an adjusted line.
 *
 * ## THE TEXT IS THE STATE WHILE IT IS BEING TYPED
 *
 * So the field holds what was typed, verbatim, and reports the parsed number
 * upwards. "1," is a legal intermediate state of typing "1,2" and must survive
 * on screen; it simply parses to 1 for anyone who asks.
 *
 * ## AND IT RESYNCS WHEN THE VALUE CHANGES FROM OUTSIDE
 *
 * A form that loads a food, or an Open Food Facts product, or rescales its
 * lines, changes these numbers without anyone typing. The field notices because
 * the incoming value differs from what its own text parses to, and only then
 * does it overwrite what is on screen — so loading fills the field, while
 * typing is never interrupted by the value it just produced.
 *
 * Adjusted DURING the render rather than in an effect. That is React's own
 * answer to a prop the state must follow, and it is the rule this project
 * learned twice: an effect runs after its render has been painted, so the field
 * would show the stale text for a frame and then flick.
 */
export function DecimalInput({
  value,
  onChangeValue,
  ref,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  /** The number the caller holds. Null renders as an empty field. */
  value: number | null;
  /** The parsed number, or null when the field is empty or half-typed. */
  onChangeValue: (value: number | null) => void;
  ref?: Ref<TextInput>;
}) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    /**
     * Only when it did not come from this field.
     *
     * Typing "1," reports 1, so the caller's value becomes 1 and arrives back
     * here — and overwriting the text with "1" at that moment is exactly the
     * bug. Comparing against what the text PARSES TO tells the two apart: after
     * "1," the parse is 1 and the incoming value is 1, so nothing is touched.
     */
    if (parseDecimal(text) !== value) setText(toText(value));
  }

  return (
    <FormInput
      ref={ref}
      value={text}
      onChangeText={(typed) => {
        setText(typed);
        onChangeValue(parseDecimal(typed));
      }}
      // French keyboards put the comma on this pad, US ones the point;
      // parseDecimal takes both.
      keyboardType="decimal-pad"
      {...props}
    />
  );
}

/**
 * How a number is first written into the field.
 *
 * The comma, because it is what the French keyboard offers and what
 * formatWeight and formatMacro print — a field that showed "1.2" beside a label
 * reading "1,2" would look like two different numbers.
 *
 * Null is an empty field rather than "0": a macro nobody has filled in is not a
 * macro of zero, and starting every row at "0" would mean deleting a character
 * before typing one.
 */
function toText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}
