import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '@/core/theme';

/**
 * The header options every native stack in this application shares.
 *
 * ## THE THIRD USER SETTLED IT, WHICH IS WHAT THE RULE SAYS
 *
 * A component moves to core/ui at its SECOND real user. The Journal's stack and
 * the Settings' stack were that second, and slice 5 deliberately left them
 * apart — "two stacks with the same options are not yet a component… this is
 * the second, so the next one settles it", written into settings/_layout.tsx
 * and carried as an open point ever since. The Stats stack of slice 8 is the
 * third, so it is settled here rather than copied a third time.
 *
 * ## WHAT IS SHARED IS NOT EVERYTHING, AND THE DIFFERENCE IS THE POINT
 *
 * The title style stays with each stack. The Journal writes its date in
 * extra-bold Nunito because that one word says where you are and it heads a
 * page whose own section titles are bold; the Settings and the Stats want an
 * ordinary bar title. Folding those together would be sharing a decision rather
 * than a mechanism — and the mechanism is what keeps repeating.
 *
 * So this returns the four options that must never differ, and every caller
 * spreads its own headerTitleStyle beside them.
 *
 * ## WHY headerTransparent RATHER THAN A PAINTED BAR
 *
 * Painting the bar colors.background gives the right colour and kills the
 * glass: opacity is exactly what cancels the effect. Transparent gives the same
 * colour BECAUSE IT IS LITERALLY THE SAME SURFACE — the page shows through —
 * and the content keeps scrolling underneath.
 *
 * Ordering trap, and the reason there is no backgroundColor anywhere near this:
 * headerTransparent only clears the background if headerStyle does not set one.
 *
 * What keeps the title legible once content is under it depends on the OS, and
 * the documentation warns that the two overlap if both are set: iOS 26 fades
 * the content at the edge itself, earlier versions blur behind the bar. Asking
 * isLiquidGlassAvailable() first is the precedent the tab bar set — the specs
 * announce iOS 18 while the effect wants 26.
 */
export function useStackHeaderOptions() {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  return {
    headerTransparent: true,
    headerShadowVisible: false,
    headerTintColor: theme.colors.accent,
    ...(glass
      ? { scrollEdgeEffects: { top: 'soft' as const } }
      : { headerBlurEffect: 'systemChromeMaterial' as const }),
  };
}
