import { useFonts } from 'expo-font';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { NUNITO_FONTS } from './nunito-assets';
import { resolveScheme, themeFor, type Theme, type ThemePreference } from './tokens';

/**
 * Light / dark / system (D10).
 *
 * Slice 0 follows the system setting. The stored preference arrives with the
 * Settings screen in slice 7, which is why `preference` is already a prop: the
 * shape does not change, only where the value comes from.
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
