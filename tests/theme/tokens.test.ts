import { describe, expect, it } from 'vitest';
import {
  colors,
  parseThemePreference,
  resolveScheme,
  themeFor,
  type ColorTokens,
} from '../../src/core/theme/tokens';

/**
 * Theme tokens (D10).
 *
 * The three-way choice is worth pinning down because 'system' is not a colour
 * scheme: it is an instruction to go and ask. Getting that wrong yields a theme
 * that looks right on the developer's device and wrong on everyone else's.
 */

describe('theme resolution', () => {
  it('honours an explicit preference over the system setting', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('follows the system when asked to', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('falls back to light while the platform has not answered', () => {
    // useColorScheme returns null before the platform reports in, and
    // 'unspecified' when it has no opinion. Neither may render an undefined
    // colour, which React Native would ignore in silence.
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
    expect(resolveScheme('system', '')).toBe('light');
  });

  it('reads an unknown stored preference as system rather than throwing', () => {
    // The value comes from the settings table, so it can be anything.
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('nonsense')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
  });
});

describe('token completeness', () => {
  const keys: (keyof ColorTokens)[] = [
    'background',
    'surface',
    'border',
    'text',
    'textMuted',
    'textFaint',
    'accent',
    'onAccent',
    'warning',
    'danger',
    'macroProtein',
    'macroCarbs',
    'macroFat',
  ];

  it('defines every colour in both schemes', () => {
    // A token missing from one scheme renders as undefined, which React Native
    // ignores silently: black text on a black background, and no error.
    for (const key of keys) {
      expect(colors.light[key], `light.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.dark[key], `dark.${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
  });

  it('never paints text in the background colour', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = colors[scheme];
      expect(palette.text).not.toBe(palette.background);
      expect(palette.textMuted).not.toBe(palette.background);
      expect(palette.onAccent).not.toBe(palette.accent);
    }
  });

  it('inverts between the two schemes', () => {
    expect(colors.light.background).not.toBe(colors.dark.background);
    expect(colors.light.text).not.toBe(colors.dark.text);
  });

  it('gives each macro its own colour, distinct from the accent', () => {
    // Three bars in one colour are three bars you have to read the label of.
    // The accent is reserved for what can be touched: borrowing it for a
    // quantity weakens both meanings.
    for (const scheme of ['light', 'dark'] as const) {
      const palette = colors[scheme];
      const macros = [palette.macroProtein, palette.macroCarbs, palette.macroFat];

      expect(new Set(macros).size, scheme).toBe(3);
      for (const macro of macros) {
        expect(macro, scheme).not.toBe(palette.accent);
        expect(macro, scheme).not.toBe(palette.surface);
      }
    }
  });

  it('builds a complete theme for either scheme', () => {
    const theme = themeFor('dark');
    expect(theme.scheme).toBe('dark');
    expect(theme.colors).toBe(colors.dark);
    expect(theme.spacing.lg).toBe(16);
    expect(theme.typography.body.fontSize).toBe(16);
  });

  it('draws no shadow in the dark, where a black one would be invisible', () => {
    // The border carries the definition there instead. A shadow drawn where it
    // cannot be seen is cost with no effect.
    expect(themeFor('dark').shadow.shadowOpacity).toBe(0);
    expect(themeFor('light').shadow.shadowOpacity).toBeGreaterThan(0);
  });
});
