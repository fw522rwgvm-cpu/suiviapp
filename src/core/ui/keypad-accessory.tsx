import { useId } from 'react';
import { InputAccessoryView, Keyboard } from 'react-native';
import { BarConfirm, BarSpacer, KEYBOARD_BAR_BACKDROP, KeyboardBar } from './keyboard-bar';

/**
 * The bar above a numeric keypad, carrying one control: the tick that finishes.
 *
 * ## WHY IT EXISTS AT ALL
 *
 * iOS number pads have no return key. A field that opens one therefore has no
 * way to say "done" except tapping somewhere harmless, which on a form is
 * tapping something. Slice 4 met this on the quantity screen and answered it
 * with this bar; slice 7 meets it again on the adherence tolerance, which is
 * the second real user — so it moves here, which is the rule.
 *
 * ## ONE FIELD, SO NO CHEVRONS
 *
 * FormNavigation's bar carries previous/next arrows, and is right to: it serves
 * a form of several fields. A lone field given the same bar would show two
 * arrows that are both dead, which slice 4 refused in as many words. That is
 * the whole difference between the two bars, and why this is not a special case
 * of that one.
 *
 * ## ONE BAR PER FIELD, NEVER SHARED
 *
 * InputAccessoryView reads as something a nativeID attaches to several inputs.
 * It is not: RCTInputAccessoryComponentView, on entering the window, finds THE
 * FIRST field carrying that id and gives it the bar. So the id is generated
 * here, per instance, and handed back rather than taken as a prop — a caller
 * cannot accidentally reuse one.
 *
 * The id is punctuation-free because it crosses to a native view as a plain
 * string and useId spells its own with colons.
 *
 * ## IT RENDERS AFTER THE FIELD, AND THAT IS THE CALLER'S JOB
 *
 * The native view binds by looking for an input carrying its id, so the field
 * has to be in the window already — which means mounted first. Hence the
 * render-prop shape: the caller writes the field, gets the id, and this places
 * the bar behind it.
 *
 * What the bar LOOKS like is in core/ui/keyboard-bar.tsx, shared with the form
 * navigation's, so the two cannot drift.
 */
export function KeypadAccessory({
  label,
  children,
}: {
  /** What the OK confirms, for VoiceOver. "Valider la quantité", say. */
  label: string;
  /** The field. Receives the id to put on its inputAccessoryViewID. */
  children: (accessoryId: string) => React.ReactNode;
}) {
  const accessoryId = `keypad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <>
      {children(accessoryId)}

      <InputAccessoryView nativeID={accessoryId} backgroundColor={KEYBOARD_BAR_BACKDROP}>
        <KeyboardBar>
          <BarSpacer />
          <BarConfirm label={label} onPress={() => Keyboard.dismiss()} />
        </KeyboardBar>
      </InputAccessoryView>
    </>
  );
}
