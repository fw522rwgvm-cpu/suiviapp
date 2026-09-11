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
  /**
   * One colour per macro, and the same one everywhere it appears.
   *
   * Three bars in the accent colour are three bars you have to read the label
   * of. Given a colour each, the remaining banner is answerable at a glance,
   * which is what D16 asks of that surface specifically — and specs 8.3 wants
   * the figures legible without any interaction.
   *
   * Deliberately NOT the accent: the accent means "you can touch this". A
   * quantity of protein is not touchable, and borrowing the interactive colour
   * for it makes both meanings weaker.
   */
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;
}

const light: ColorTokens = {
  // Slightly warmer and lighter than the surfaces, so a white card reads as
  // raised against it rather than merging into it.
  background: '#f4f5f7',
  surface: '#ffffff',
  border: '#e6e7ec',
  text: '#111113',
  textMuted: '#65656d',
  textFaint: '#9a9aa3',
  accent: '#2f6f4e',
  onAccent: '#ffffff',
  warning: '#8a5a00',
  danger: '#a8291f',
  macroProtein: '#2f7d8c',
  macroCarbs: '#d98324',
  macroFat: '#8a5cc4',
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
  // Lifted, not the same hex: a colour that reads on white disappears on near
  // black, and the point of giving each macro a colour is that it be readable.
  macroProtein: '#5cc4d4',
  macroCarbs: '#f0a94c',
  macroFat: '#b18ce0',
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
  sm: 8,
  md: 12,
  lg: 18,
  /** Cards that carry a whole section. Generous, in the current idiom. */
  xl: 24,
  pill: 999,
} as const;

/**
 * Card elevation, per scheme.
 *
 * A soft shadow is what makes a light interface read as stacked cards rather
 * than as boxes drawn on a page, and it is most of the difference between a
 * hairline-bordered list and something that looks designed.
 *
 * It is scheme-dependent because a black shadow does nothing on a near-black
 * background: in the dark the border does the work instead, so the shadow is
 * switched off rather than drawn where it cannot be seen.
 *
 * A value, not a component: nothing here imports React.
 */
export interface ShadowTokens {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  /** Android only. Kept so the token is complete, not because it is used. */
  elevation: number;
}

const shadows: Record<ColorScheme, ShadowTokens> = {
  light: {
    shadowColor: '#0b0b1a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  dark: {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
};

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
  shadow: ShadowTokens;
}

export function themeFor(scheme: ColorScheme): Theme {
  return { scheme, colors: colors[scheme], spacing, radius, typography, shadow: shadows[scheme] };
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
