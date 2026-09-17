import { GlassView } from 'expo-glass-effect';
import { useId } from 'react';
import { InputAccessoryView, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { canUseGlass } from './glass-button';

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
 * ## THE BAR CARRIES THE MATERIAL; WHAT IS ON IT DOES NOT
 *
 * It was a painted surface with a hairline, which is the pre-26 shape of an
 * accessory, and then it was a row of glass capsules floating over the page.
 * Neither looked like the system's, and the second was reported as still wrong.
 *
 * What iOS 26 does to a bar is put its own material BEHIND it and leave the
 * controls on it as plain tinted glyphs and words. So that is what this does:
 * the strip is a GlassView — a real UIVisualEffectView, the same material, not
 * an imitation of it — and the chevrons and the OK are bare Pressables on top.
 * Capsules inside it would be glass inside glass, which is the mistake the iOS
 * 26 direction names for headers.
 *
 * ## AND "EXACTLY THE SAME" IS NOT REACHABLE, WHICH IS WORTH SAYING
 *
 * InputAccessoryView hands over an EMPTY container. iOS exposes no standard
 * accessory bar to ask for — not through React Native, and not through UIKit
 * either outside a web view, where Safari's comes from. Everything in this bar
 * is drawn here. What can be shared with the system is the material and the
 * proportions; the rest is a reconstruction, said plainly rather than implied.
 *
 * Where the material is unavailable the strip paints again, exactly as it did
 * before: a transparent bar over the page would be neither one thing nor the
 * other.
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
        {glass ? (
          // No backgroundColor anywhere near it: opacity is exactly what
          // cancels the effect, which is the standing rule for every glass
          // surface in this project.
          <GlassView style={styles.bar} glassEffectStyle="regular">
            <Done label={label} />
          </GlassView>
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
            <Done label={label} />
          </View>
        )}
      </InputAccessoryView>
    </>
  );
}

/** One word, in the accent, the way a bar button reads. */
function Done({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => Keyboard.dismiss()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.done, { color: theme.colors.accent }]}>OK</Text>
    </Pressable>
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
    // The system's own accessory height. Laid out absolutely by iOS and sized
    // to its content, so something here has to say how tall it is.
    height: 44,
  },
  done: { fontSize: 17, fontWeight: '600' },
});
