import type { TextStyle } from 'react-native';

/**
 * Nunito, and how a weight becomes a face.
 *
 * ## THREE FILES, NOT ONE VARIABLE FONT
 *
 * Google publishes Nunito as a variable font these days, and one file would
 * have been tidier. It is not used, because `fontWeight` does not drive a
 * variable axis through React Native: iOS would register the font at its
 * default instance and SYNTHESISE the bold — a slanted, thickened fake that
 * looks wrong beside real type and is worse at small sizes, which is most of
 * this application.
 *
 * So three static instances are bundled and the weight picks the file. That is
 * also why nothing here maps a weight it has no face for: 500 and 600 both get
 * SemiBold, because rounding to a face that exists is the whole point.
 *
 * ## SIL OPEN FONT LICENSE 1.1
 *
 * Nunito is OFL, so bundling and redistributing it is allowed with the licence
 * beside it — assets/fonts/OFL.txt, which is why that file is in the repository
 * and must stay there.
 *
 * ## THE FILES ARE NOT REQUIRED FROM HERE
 *
 * They live in nunito-assets.ts, and the split is not tidiness: `require` of a
 * .ttf means something to Metro and nothing to Node. A test of this mapping —
 * which is the whole mechanism, and the thing that silently produces fake bold
 * when it is wrong — could not be written at all if the two shared a module.
 *
 * ## IT IS NEVER REQUIRED FOR THE APPLICATION TO WORK
 *
 * Loading happens at runtime and can fail — a corrupt asset, a hostile moment
 * in the bundler. `fontFamilyFor` then returns undefined and every Text falls
 * back to the system face, which is exactly what shipped for five slices.
 * Conventions section 4 forbids a blocking failure on the critical path, and a
 * typeface is the least critical thing on it.
 */

/** The family names iOS registers, which are the PostScript names of the files. */
export const NUNITO_REGULAR = 'Nunito-Regular';
export const NUNITO_SEMIBOLD = 'Nunito-SemiBold';
export const NUNITO_BOLD = 'Nunito-Bold';

/**
 * The face for a requested weight, or undefined while the fonts are not there.
 *
 * The application asks for 400, 500, 600 and 700. Anything else is rounded to
 * the nearest face rather than refused: a style is not an input to validate,
 * and there is no useful way to fail at one.
 */
export function fontFamilyFor(
  weight: TextStyle['fontWeight'],
  loaded: boolean,
): string | undefined {
  if (!loaded) return undefined;

  if (weight === 'bold') return NUNITO_BOLD;
  if (weight === 'normal' || weight === undefined || weight === null) return NUNITO_REGULAR;

  const numeric = typeof weight === 'number' ? weight : Number(weight);
  if (!Number.isFinite(numeric)) return NUNITO_REGULAR;

  if (numeric >= 700) return NUNITO_BOLD;
  if (numeric >= 500) return NUNITO_SEMIBOLD;
  return NUNITO_REGULAR;
}
