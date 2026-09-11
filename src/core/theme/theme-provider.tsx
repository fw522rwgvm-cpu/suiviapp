import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { resolveScheme, themeFor, type Theme, type ThemePreference } from './tokens';

/**
 * Light / dark / system (D10).
 *
 * Slice 0 follows the system setting. The stored preference arrives with the
 * Settings screen in slice 7, which is why `preference` is already a prop: the
 * shape does not change, only where the value comes from.
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
  const theme = useMemo(
    () => themeFor(resolveScheme(preference, systemScheme)),
    [preference, systemScheme],
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
