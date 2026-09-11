/**
 * Design tokens (D10).
 *
 * No component library, no NativeWind: native styles over a small token layer.
 * A library would bring none of the screens that actually matter here — the
 * progress ring, the RIR row, swipe to delete, the session banner — while
 * imposing its own look, its own theming system and its own release cadence.
 * NativeWind was ruled out more painfully still: it adds a step to Metro and
 * Babel, and therefore a failure point in a toolchain that cannot be debugged
 * locally.
 *
 * Tokens are values, not components. Nothing here imports React.
 */

export type ColorScheme = 'light' | 'dark';

/** Stored under the `theme` key of the settings table (schema 2.1). */
export type ThemePreference = 'light' | 'dark' | 'system';

export interface ColorTokens {
  /** Page background. */
  background: string;
  /** Raised surfaces: cards, rows, sheets. */
  surface: string;
  /** Hairlines and separators. */
  border: string;
  /** Primary reading colour. */
  text: string;
  /** Labels, captions, anything secondary. */
  textMuted: string;
  /** Disabled or placeholder text. */
  textFaint: string;
  /** Interactive elements and selected states. */
  accent: string;
  /** Text drawn on top of accent. */
  onAccent: string;
  /** Non-blocking warnings, such as the 10% kcal discrepancy (specs 5.1). */
  warning: string;
  /** Destructive actions. */
  danger: string;
}

const light: ColorTokens = {
  background: '#f7f7f8',
  surface: '#ffffff',
  border: '#e2e2e6',
  text: '#111113',
  textMuted: '#65656d',
  textFaint: '#9a9aa3',
  accent: '#2f6f4e',
  onAccent: '#ffffff',
  warning: '#8a5a00',
  danger: '#a8291f',
};

const dark: ColorTokens = {
  background: '#0f0f11',
  surface: '#1a1a1d',
  border: '#2c2c31',
  text: '#f2f2f4',
  textMuted: '#a0a0a9',
  textFaint: '#6b6b74',
  accent: '#6bbd8f',
  onAccent: '#0f0f11',
  warning: '#e0a942',
  danger: '#e8796e',
};

export const colors: Record<ColorScheme, ColorTokens> = { light, dark };

/** Multiples of 4. Enough steps to be useful, few enough to stay a decision. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  /** Screen titles. */
  title: { fontSize: 28, fontWeight: '600' },
  /** Section headings. */
  heading: { fontSize: 20, fontWeight: '600' },
  /** Default reading size. */
  body: { fontSize: 16, fontWeight: '400' },
  /** Labels and captions. */
  caption: { fontSize: 13, fontWeight: '400' },
  /** Figures that must be legible at a glance (specs 8.3). */
  figure: { fontSize: 34, fontWeight: '700' },
} as const;

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export function themeFor(scheme: ColorScheme): Theme {
  return { scheme, colors: colors[scheme], spacing, radius, typography };
}

/**
 * Resolves the stored preference against what the system reports.
 *
 * Pure, so the three-way choice is testable without rendering anything.
 *
 * The parameter is deliberately wider than ColorScheme: React Native's
 * useColorScheme reports null before the platform answers, and 'unspecified'
 * when it has no opinion. Both must read as light rather than crash or render
 * an undefined colour, so anything that is not 'dark' is light.
 */
export function resolveScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** Reading the `theme` setting back: an unknown value must not throw. */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
