import { NUNITO_BOLD, NUNITO_REGULAR, NUNITO_SEMIBOLD } from './font';

/**
 * The font files themselves, kept apart from the mapping that names them.
 *
 * `require` of a .ttf is a Metro instruction and nothing else: Node cannot
 * parse it. Keeping it here is what lets font.ts — which holds the
 * weight-to-face mapping, the part that silently produces synthetic bold when
 * it is wrong — be imported and tested from Node.
 *
 * The keys become the family names iOS registers, which is why they come from
 * font.ts rather than being spelled out a second time.
 */
export const NUNITO_FONTS: Record<string, number> = {
  [NUNITO_REGULAR]: require('../../../assets/fonts/Nunito-Regular.ttf') as number,
  [NUNITO_SEMIBOLD]: require('../../../assets/fonts/Nunito-SemiBold.ttf') as number,
  [NUNITO_BOLD]: require('../../../assets/fonts/Nunito-Bold.ttf') as number,
};
