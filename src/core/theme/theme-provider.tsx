import { useFonts } from 'expo-font';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { NUNITO_FONTS } from './nunito-assets';
import { resolveScheme, themeFor, type Theme, type ThemePreference } from './tokens';

/**
 * Light / dark / system (D10).
 *
 * Slice 0 followed the system setting. Slice 7 feeds it the stored preference,
 * which is why `preference` was already a prop: the shape did not change, only
 * where the value comes from.
 *
 * ## THE TOKENS ARE ONLY HALF THE SCREEN
 *
 * Everything below is what THIS APPLICATION draws. The other half is drawn by
 * UIKit and takes no notice of these tokens: the tab bar, the native headers,
 * the quantity UIPickerView, ActionSheetIOS, alerts, the keyboard. app.config
 * sets userInterfaceStyle 'automatic', so all of that follows the SYSTEM — and
 * a user who picks "sombre" while iOS is light would get dark cards under a
 * light tab bar.
 *
 * Appearance.setColorScheme is what closes the gap, and it does more than its
 * own documentation admits ("this will not change the appearance of the system
 * UI"): its iOS implementation walks every window of every connected scene and
 * sets overrideUserInterfaceStyle on each, so UIKit's own chrome follows.
 * Read in React Native's source — RCTAppearance.mm — rather than assumed.
 *
 * 'unspecified' hands control back to the OS, which is exactly what 'system'
 * means. It is the value the TYPES accept and the one RCTConvert maps to
 * UIUserInterfaceStyleUnspecified; the JS layer special-cases it to report the
 * real system scheme afterwards. `null` reaches the same place at runtime and
 * is what the .d.ts refuses — which is the useful half of the check here.
 *
 * It runs in an effect rather than during render because it mutates native
 * windows: there is nothing to set before the windows exist, and the frame it
 * costs is a frame of the system chrome, never of a figure being read.
 *
 * ## IT ALSO LOADS THE TYPEFACE, AND NEVER WAITS FOR IT
 *
 * Nunito is registered at runtime rather than embedded at build time, so no
 * binary has to be rebuilt for it — expo-font's native module ships with `expo`
 * itself and is already in the installed client.
 *
 * NOTHING IS GATED ON IT. The children render on the first frame whatever the
 * fonts are doing, and `fontsLoaded` simply goes true underneath them a moment
 * later. Holding the application back for a typeface would put a blank screen
 * on the critical path of an application whose whole target is fifteen seconds
 * (specs 4), to change how the letters are shaped.
 *
 * A failure is the same story with a longer wait: useFonts reports the error,
 * the flag stays false, and every Text keeps the system face.
 */

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  preference = 'system',
}: {
  children: ReactNode;
  preference?: ThemePreference;
}) {
  const systemScheme = useColorScheme();
  const [fontsLoaded] = useFonts(NUNITO_FONTS);

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const theme = useMemo(
    () => themeFor(resolveScheme(preference, systemScheme), fontsLoaded),
    [preference, systemScheme, fontsLoaded],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return theme;
}
