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
  /**
   * Interactive elements and selected states.
   *
   * IT IS A BLUE BECAUSE EVERYTHING ELSE WAS TAKEN. Four nutrients hold orange,
   * teal, violet and magenta; red means something has gone wrong and amber
   * means something is worth a second look. What was left, once those six are
   * spoken for, is the band between them -- and it happens to be the one hue
   * iOS itself uses for "you can touch this", which is not a coincidence worth
   * fighting.
   *
   * IT WAS BLUE, AND BEFORE THAT GREEN. The green was dropped because it sat
   * next to the teal of protein, and an accent and a figure could be mistaken
   * for each other on the one screen where both appear at once.
   *
   * It is now a mint green — #08c99c, asked for by name as the application's
   * colour. Which brings that exact collision back, so the answer is the other
   * half of the trade: THE ACCENT VACATED BLUE, AND PROTEIN TOOK IT. The two
   * are now a green and a blue rather than two greens, and the reason the old
   * note gave for avoiding green no longer applies.
   *
   * ## THE SAME HEX IN BOTH THEMES, AND WHAT THAT COSTS
   *
   * A darkened variant was tried for the light theme and rejected on sight: it
   * read as a different, duller colour rather than as the same one adapted.
   * The brand colour is the brand colour, so #08c99c is used as given on both
   * surfaces. Decision recorded rather than inferred.
   *
   * The price, measured: 2.13:1 against white. That is below the 4.5:1 a label
   * needs and below even the 3:1 a drawn shape needs. So in the LIGHT theme
   * everything tinted with the accent — the chevrons, "Enregistrer", the add
   * button's glyph — is faint, and the gauge is a pale ring on a white card.
   * On the dark surface it reaches 9.60:1 and is exemplary.
   *
   * If that becomes a problem in use, the way out is NOT a darker green, which
   * is the thing that was rejected: it is a darker surface behind the accent —
   * a tinted card under the gauge, or a dark-only application. The tests below
   * record the measurement instead of asserting a threshold the palette no
   * longer meets, so the number is visible rather than lost.
   *
   * `onAccent` IS WHITE, ASKED FOR AFTER SEEING IT. Near-black on this mint
   * measures 8.98:1 and white measures 2.13:1, so the readable choice was the
   * dark one — and it was tried, and it read as a black label on a bright
   * button rather than as a filled control. White it is, at the same 2.13:1
   * the accent already carries against white elsewhere: the compromise is one
   * compromise, consistently, rather than two different ones.
   *
   * The same value in both themes, because THE FILL IS THE SAME HEX IN BOTH.
   * A button that is one colour cannot carry two different labels depending on
   * a setting that does not change it.
   */
  accent: string;
  /**
   * The two steps between "untouched" and the accent, for the body map's
   * shading (specs 10.2).
   *
   * They are the ACCENT DESATURATED TOWARDS THE SURFACE, not three unrelated
   * colours: the map shades one quantity, so its steps have to read as one
   * scale. A hue change would say the muscles differ in kind rather than in
   * amount.
   *
   * Only three lit steps, and the lightest is deliberately well clear of
   * `border`, which is what an unworked region uses: the distinction that must
   * never be missed is worked-at-all against not-worked, and it is the one a
   * gradient blurs.
   */
  muscleLight: string;
  muscleMid: string;
  /** Text drawn on top of accent. */
  onAccent: string;
  /**
   * Text drawn on top of danger.
   *
   * Its own token since the accent became mint. The two fills no longer take
   * the same label colour — near-black reads on the mint and white reads on
   * the red — and one token serving both was how changing the green broke the
   * delete button without touching it.
   */
  onDanger: string;
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
   *
   * CALORIES ARE THE EXCEPTION, AND DELIBERATELY SO: they wear the accent
   * itself. Calories are the figure the gauge draws and the one specs 8.3 makes
   * legible without interaction, so one colour across the gauge, the dot and
   * the headline says they are one thing. The rule below holds for the other
   * three, which are quantities and not the subject.
   *
   * THREE HUES, AS FAR APART AS THREE CAN BE, once the accent and the
   * destructive red are excluded: orange for carbs, blue for protein, violet
   * for fat. Protein moved off teal when the accent became mint, which is what
   * keeps them apart -- a green beside a teal was the very problem the accent
   * note above records, and an amber would sit on top of the orange, and a
   * red would be read as something having gone wrong.
   *
   * In the spirit of the app the design was asked to follow, not sampled from
   * it: one flat, distinct hue per nutrient, worn as a small filled dot beside
   * a name rather than as a fill behind it.
   */
  macroKcal: string;
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;

  /**
   * One colour per meal, chosen to agree with WHAT ITS ICON DEPICTS rather
   * than to fill out a palette: coffee, cutlery, wine, a carrot.
   *
   * They are allowed to sit near the macro hues, and that is not an oversight.
   * A meal is identified by the SHAPE of its glyph and a macro bar by the
   * label written on it, so neither is ever decoded by colour — which is what
   * would make a shared hue family cost something. Being coherent with the
   * thing drawn was the requirement; being unlike the other three meals is the
   * rest of it, and a test pins both.
   *
   * Each clears 3:1 against its own surface — the WCAG threshold for a
   * graphical object, which is what a glyph is, rather than the 4.5:1 that
   * governs text.
   */
  mealBreakfast: string;
  mealLunch: string;
  mealDinner: string;
  mealSnack: string;
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
  accent: '#08c99c',
  /** The accent at roughly a third and two thirds, on the light ground. */
  muscleLight: '#a8ecdc',
  muscleMid: '#4fd9ba',
  onAccent: '#ffffff',
  onDanger: '#ffffff',
  warning: '#8a5a00',
  /**
   * Destructive, and deliberately bright.
   *
   * It was a brick red — safe, and so muted that "Supprimer" read as one more
   * label. Brightened on request, with the ceiling set by arithmetic rather
   * than by taste: this colour is used BOTH as a fill under a white label and
   * as text on a white card (a validation problem, the delete button of the
   * food editor), so it has to clear 4.5:1 against white in both directions.
   *
   * iOS systemRed (#ff3b30) is brighter still and reaches only 3.55:1, which
   * is why the system's own red is not used here: Apple applies it to labels
   * this application also uses for sentences. This is the brightest red that
   * clears the bar — 4.60:1, pinned by a test.
   */
  danger: '#e02d1f',
  macroKcal: '#08c99c',
  macroProtein: '#3457c5',
  macroCarbs: '#d98324',
  macroFat: '#8a5cc4',
  /** Coffee. */
  mealBreakfast: '#7a4e24',
  /** Cutlery: the one neutral of the four, and the only one that is not food. */
  mealLunch: '#6b6257',
  /** Wine, kept well clear of the destructive red — darker and far less vivid. */
  mealDinner: '#9b2242',
  /** A carrot, and nothing else this colour needs to mean. */
  mealSnack: '#cc5a0a',
};

const dark: ColorTokens = {
  background: '#0f0f11',
  surface: '#1a1a1d',
  border: '#2c2c31',
  text: '#f2f2f4',
  textMuted: '#a0a0a9',
  textFaint: '#6b6b74',
  accent: '#08c99c',
  /**
   * Towards the dark surface rather than towards white: on #1a1a1d a pale mint
   * would be the BRIGHTEST thing on the figure, so the scale would run
   * backwards — the least worked muscle shouting loudest.
   */
  muscleLight: '#1d5a4c',
  muscleMid: '#0a9a78',
  onAccent: '#ffffff',
  onDanger: '#0f0f11',
  warning: '#e0a942',
  /**
   * iOS systemRed for dark mode, exactly.
   *
   * On a near-black ground the arithmetic runs the other way — a bright red
   * gains contrast rather than losing it — so the system's own value clears
   * the bar comfortably (5.10:1 as text, 5.62:1 under the dark label of a
   * filled button) and there is no reason to invent a different one.
   *
   * The previous salmon was washed out: desaturated enough to read as a
   * disabled control rather than as a destructive one.
   */
  danger: '#ff453a',
  // Lifted, not the same hex: a colour that reads on white disappears on near
  // black, and the point of giving each macro a colour is that it be readable.
  macroKcal: '#08c99c',
  macroProtein: '#7f9cf5',
  macroCarbs: '#f0a94c',
  macroFat: '#b18ce0',
  // Lifted like the macros: a colour that reads on white disappears on near
  // black, and a glyph nobody can make out is a glyph with no colour at all.
  mealBreakfast: '#d0a173',
  mealLunch: '#b5aa9a',
  mealDinner: '#e8718f',
  mealSnack: '#ff9b45',
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
  /**
   * Whether Nunito is registered yet.
   *
   * On the theme because a typeface is part of how the application looks, and
   * because every Text already reads the theme — a second context would be a
   * second subscription on the most numerous component in the tree.
   *
   * False is a working state, not a failure: core/ui/text falls back to the
   * system face, which is what shipped for five slices.
   */
  fontsLoaded: boolean;
}

export function themeFor(scheme: ColorScheme, fontsLoaded = false): Theme {
  return {
    scheme,
    colors: colors[scheme],
    spacing,
    radius,
    typography,
    shadow: shadows[scheme],
    fontsLoaded,
  };
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
