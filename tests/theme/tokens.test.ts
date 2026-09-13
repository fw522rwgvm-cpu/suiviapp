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

/**
 * Relative luminance and contrast, WCAG 2.1.
 *
 * Twelve lines rather than a dependency: this is the whole of the formula, it
 * has not changed since 2008, and section 5 is not widened for arithmetic.
 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** HSV saturation and value: how vivid a colour is, which luminance is not. */
function channels(hex: string): number[] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
}

function value(hex: string): number {
  return Math.max(...channels(hex));
}

function saturation(hex: string): number {
  const parts = channels(hex);
  const top = Math.max(...parts);
  return top === 0 ? 0 : (top - Math.min(...parts)) / top;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('the destructive colour stays readable', () => {
  /**
   * WHY THIS ONE IS PINNED, when no other colour is.
   *
   * `danger` is the one token used in two incompatible ways: as a FILL under
   * the label of the swipe action, and as TEXT on a card — the food editor's
   * delete button, and every validation problem. Brightening it for one use
   * degrades the other, and the failure is invisible to whoever makes the
   * change: a red that is hard to read still looks red.
   *
   * 4.5:1 is the WCAG AA threshold for normal text, which is what these are.
   * iOS systemRed in light mode (#ff3b30) reaches 3.55:1 and is therefore not
   * usable here, however well it would suit a button on its own — the reason
   * that decision is recorded rather than left to be rediscovered.
   */
  it('clears AA as text on its own surface, in both themes', () => {
    expect(contrast(colors.light.danger, colors.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.dark.danger, colors.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('clears AA under the label of a filled button, in both themes', () => {
    // The swipe action paints `danger` and writes `onDanger` on it — its own
    // token since the accent became mint, because near-black reads on the mint
    // and white reads on the red. One token serving both fills was how
    // changing the green broke this button without touching it.
    expect(contrast(colors.light.onDanger, colors.light.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.dark.onDanger, colors.dark.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('is VIVID rather than merely safe, which is the point of it', () => {
    /**
     * Guards the other direction, and not with luminance — which was the first
     * attempt and was simply the wrong instrument: a saturated red has a low
     * relative luminance by construction (the formula weights green at 0,72),
     * so comparing it to a pale grey says nothing about how vivid it looks.
     *
     * Saturation and value are what "punchy" means. Both predecessors fail
     * this, each in its own way: the light brick #a8291f was saturated but
     * dark (value 0,66), and the dark salmon #e8796e was bright but washed out
     * (saturation 0,53) — which is why it read as a disabled control.
     */
    for (const danger of [colors.light.danger, colors.dark.danger]) {
      expect(saturation(danger)).toBeGreaterThanOrEqual(0.7);
      expect(value(danger)).toBeGreaterThanOrEqual(0.85);
    }
  });
});

describe('the four meal colours', () => {
  const MEAL_KEYS = ['mealBreakfast', 'mealLunch', 'mealDinner', 'mealSnack'] as const;

  it('gives each meal a colour of its own', () => {
    // "Different and coherent with what the icon depicts" was the requirement.
    // Coherence cannot be asserted; distinctness can, and it is the half that
    // silently breaks when a palette is edited.
    for (const scheme of ['light', 'dark'] as const) {
      const used = MEAL_KEYS.map((key) => colors[scheme][key]);
      expect(new Set(used).size).toBe(MEAL_KEYS.length);
    }
  });

  it('clears the 3:1 a graphical object needs, on its own surface', () => {
    // A glyph is a graphical object, not text: WCAG asks 3:1 of it rather than
    // the 4.5:1 that governs a sentence. Below that the icon stops being
    // readable as a shape, which is the only thing it is there to be.
    for (const scheme of ['light', 'dark'] as const) {
      for (const key of MEAL_KEYS) {
        expect(
          contrast(colors[scheme][key], colors[scheme].surface),
          `${scheme}.${key}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the wine clear of the destructive red', () => {
    // The two are the only reds on a meal card, and one of them means "this
    // deletes something". They are told apart by vividness rather than by hue:
    // wine is a darker, far less saturated red than a button that destroys.
    for (const scheme of ['light', 'dark'] as const) {
      expect(colors[scheme].mealDinner, scheme).not.toBe(colors[scheme].danger);
      expect(
        saturation(colors[scheme].mealDinner),
        `${scheme} wine is quieter than danger`,
      ).toBeLessThan(saturation(colors[scheme].danger));
    }
  });
});

describe('the accent, now that it is the mint', () => {
  it('is the same hex in both themes, which was asked for by name', () => {
    // A darkened light-theme variant was tried and rejected on sight: it read
    // as a different, duller colour rather than as the same one adapted.
    expect(colors.light.accent).toBe('#08c99c');
    expect(colors.dark.accent).toBe('#08c99c');
  });

  it('is readable as a label on the DARK surface', () => {
    // Where it is exemplary: 9.6:1. It tints chevrons, "Enregistrer", the add
    // button and every header.
    expect(contrast(colors.dark.accent, colors.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * THE LIGHT THEME DOES NOT CLEAR IT, AND THAT IS A DECISION.
   *
   * Recorded as a measurement rather than asserted as a threshold, because the
   * palette no longer meets one and pretending otherwise would either delete
   * the knowledge or fail the build over something already decided. What this
   * guards instead is the direction: if the figure ever moves, this test says
   * so, and it names the way out.
   */
  it('records what the mint costs on white rather than hiding it', () => {
    const measured = contrast(colors.light.accent, colors.light.surface);

    // Below 3:1, the threshold for a drawn shape, let alone the 4.5:1 a label
    // needs. The way out is a darker SURFACE, never a darker green.
    expect(measured).toBeLessThan(3);
    expect(measured).toBeCloseTo(2.13, 2);
  });

  it('keeps a filled button readable, which the colour did not decide', () => {
    // White on this mint is 1.81:1; near-black on it is 10.43:1. Every save
    // button writes onAccent on an accent fill, so this had to move with the
    // green without being a compromise on it.
    expect(contrast(colors.light.onAccent, colors.light.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.dark.onAccent, colors.dark.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives calories the accent itself, which is deliberate', () => {
    // Calories are what the gauge draws and what specs 8.3 makes legible
    // without interaction. One colour across the gauge, the dot and the
    // headline says they are one thing — so this is the one macro allowed to
    // wear the interactive colour, and the assertion exists so nobody
    // "corrects" it back.
    expect(colors.light.macroKcal).toBe(colors.light.accent);
    expect(colors.dark.macroKcal).toBe(colors.dark.accent);
  });

  it('keeps protein away from the accent now that both could be green', () => {
    // The accent was green once and was moved off it because it sat next to
    // the teal of protein. The mint brings that back, so protein took the blue
    // the accent vacated. Blue channel dominant on one, green on the other.
    for (const scheme of ['light', 'dark'] as const) {
      const protein = colors[scheme].macroProtein;
      const red = parseInt(protein.slice(1, 3), 16);
      const green = parseInt(protein.slice(3, 5), 16);
      const blue = parseInt(protein.slice(5, 7), 16);

      expect(blue, `${scheme} protein is a blue`).toBeGreaterThan(green);
      expect(blue, `${scheme} protein is a blue`).toBeGreaterThan(red);
    }
  });
});
