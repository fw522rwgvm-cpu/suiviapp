import { GlassContainer } from 'expo-glass-effect';
import { useId } from 'react';
import { InputAccessoryView, Keyboard, StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { canUseGlass, GlassButton, MERGE_DISTANCE } from './glass-button';

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
 * ## BUILT THE WAY iOS 26 BUILDS A BAR: A GLASS CONTAINER OF GLASS CONTROLS
 *
 * Three shapes were tried before this one — a painted surface with a hairline
 * (the pre-26 accessory), floating capsules, a full-width slab of glass — and
 * none of them was it. What was missing is the piece that makes an iOS 26 bar
 * look like one: `UIGlassContainerEffect`.
 *
 * Apple does not put one material behind a bar. Each control carries its own
 * `UIGlassEffect`, and the group sits inside a `UIGlassContainerEffect`, which
 * is what lets neighbouring controls AFFECT ONE ANOTHER — they merge as they
 * approach and part as they separate. That blending is the signature; capsules
 * without it look stuck on, and a single slab looks like the old bar.
 *
 * expo-glass-effect exposes both, and the container is the one this project had
 * never used: `GlassContainer` is that view, `spacing` is the distance at which
 * its children begin to merge. So the strip itself is TRANSPARENT and the
 * controls are the material — which is also the rule this project already has
 * about never painting behind glass, arriving from the other end.
 *
 * Where the material is unavailable the strip paints again, exactly as it did:
 * a transparent bar holding painted buttons would be neither.
 *
 * RESERVE, AND IT IS THE USUAL ONE: `GlassContainer` is a native view. It comes
 * from a package that is already in the binary, so no rebuild is expected — but
 * that is a deduction from the lockfile, not an observation. If the bar renders
 * empty on the device, this is the first thing to suspect.
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
  const dismiss = () => Keyboard.dismiss();
  const accessoryId = `keypad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <>
      {children(accessoryId)}

      <InputAccessoryView nativeID={accessoryId}>
        {glass ? (
          // No background anywhere near it: the controls are the material, and
          // opacity behind them is exactly what cancels the effect.
          <GlassContainer spacing={MERGE_DISTANCE} style={styles.bar}>
            <GlassButton label="OK" accessibilityLabel={label} onPress={dismiss} />
          </GlassContainer>
        ) : (
          <View
            style={[
              styles.bar,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <GlassButton label="OK" accessibilityLabel={label} onPress={dismiss} />
          </View>
        )}
      </InputAccessoryView>
    </>
  );
}

const styles = StyleSheet.create({
  // Laid out absolutely by iOS and sized to its content, so the content has to
  // declare a height of its own — here through its padding.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    // Room for a capsule and the air around it. Laid out absolutely by iOS and
    // sized to its content, so something here has to say how tall it is.
    height: 56,
  },
});
