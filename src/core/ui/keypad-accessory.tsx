import { useId } from 'react';
import { InputAccessoryView, Keyboard, StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { canUseGlass, GlassButton } from './glass-button';

/**
 * The bar above a numeric keypad, carrying one word: OK.
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
 * FormNavigation's bar carries previous/next arrows, and is right to: it
 * serves a form of several fields. A lone field given the same bar would show
 * two arrows that are both disabled — two dead controls, which slice 4
 * refused in as many words. That is the whole difference between the two bars,
 * and why this is not a special case of that one.
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
 * ## THE BAR IS A ROW OF GLASS CONTROLS, NOT A PAINTED STRIP
 *
 * It was a filled surface with a hairline on top, which is the pre-26 shape of
 * an accessory and which is what was reported: it does not look like Safari's.
 * On iOS 26 the accessory is not a bar at all — it is controls floating over
 * the page, each one its own capsule of glass, and the page shows through
 * between them.
 *
 * So the strip loses its fill and its rule, and the control becomes a
 * GlassButton, which is the one way a view drawn in JavaScript receives the
 * material (see glass-button.tsx). This is NOT the "never glass in a native
 * header" rule pointing the other way: a header already has UIKit's material
 * behind whatever it is given, and an InputAccessoryView is an empty container
 * we fill ourselves.
 *
 * Where the material is unavailable the strip paints again, exactly as before.
 * A transparent bar with a painted button on it would be neither.
 *
 * ## IT RENDERS AFTER THE FIELD, AND THAT IS THE CALLER'S JOB
 *
 * The native view binds by looking for an input carrying its id, so the field
 * has to be in the window already — which means mounted first. Hence the
 * render-prop shape: the caller writes the field, gets the id, and this places
 * the bar behind it.
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
  const theme = useTheme();
  const glass = canUseGlass();
  const accessoryId = `keypad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <>
      {children(accessoryId)}

      <InputAccessoryView nativeID={accessoryId}>
        <View
          style={[
            styles.bar,
            glass
              ? null
              : {
                  backgroundColor: theme.colors.surface,
                  borderTopColor: theme.colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
          ]}
        >
          <GlassButton label="OK" accessibilityLabel={label} onPress={() => Keyboard.dismiss()} />
        </View>
      </InputAccessoryView>
    </>
  );
}

const styles = StyleSheet.create({
  // Laid out absolutely by iOS and sized to its content, so the content has to
  // declare a height of its own — here through its padding.
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    // Enough that a capsule has air around it rather than sitting against the
    // keyboard: floating is the whole look, and a tight fit undoes it.
    paddingVertical: 8,
  },
});
