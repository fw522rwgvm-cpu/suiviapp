import { StyleSheet, Text as RNText, type TextProps } from 'react-native';
import { fontFamilyFor, useTheme } from '@/core/theme';

/**
 * Every piece of text in the application, wearing Nunito.
 *
 * ## WHY A WRAPPER AND NOT A GLOBAL SETTING
 *
 * React Native has no global font. The move that used to serve — assigning
 * Text.defaultProps at startup — is gone: React 19 removed defaultProps for
 * function components, and this project is on React 19.2. Reaching for it
 * anyway would need a type assertion onto a component, which conventions
 * section 4 rules out, to set a field React no longer reads.
 *
 * So the family is applied here, in one component that every screen imports
 * instead of react-native's. Thirty-five files changed their import once; the
 * next change of typeface changes one line.
 *
 * ## THE WEIGHT PICKS THE FILE, AND THEN STOPS BEING A WEIGHT
 *
 * Three static faces are bundled, so `fontWeight: '600'` has to become
 * `fontFamily: 'Nunito-SemiBold'`. The weight is then reset to normal on the
 * way out — otherwise iOS is asked for a bold rendering OF AN ALREADY BOLD
 * FACE and synthesises one on top, which is the smeared double-bold that gives
 * bundled fonts a bad name.
 *
 * A caller may still set `fontFamily` itself and win: its style sits after the
 * family this adds, which is what lets one screen escape without an argument.
 *
 * ## IT IS NEVER AN OBSTACLE
 *
 * While the fonts are not registered — the first frames, or for ever if
 * loading failed — fontFamilyFor returns undefined, nothing is overridden, and
 * this renders exactly the Text it wraps.
 */
export function Text({ style, ...props }: TextProps) {
  const theme = useTheme();

  // Flattened because a style is routinely an array here, and the weight has
  // to be read before it can be answered.
  const flattened = StyleSheet.flatten(style);
  const fontFamily = fontFamilyFor(flattened?.fontWeight, theme.fontsLoaded);

  if (fontFamily === undefined) {
    return <RNText style={style} {...props} />;
  }

  return <RNText style={[{ fontFamily }, style, styles.faceCarriesTheWeight]} {...props} />;
}

const styles = StyleSheet.create({
  /** The face is already the weight; asking for it twice synthesises a fake. */
  faceCarriesTheWeight: { fontWeight: 'normal' },
});
