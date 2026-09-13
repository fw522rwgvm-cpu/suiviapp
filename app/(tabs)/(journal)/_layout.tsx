import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { fontFamilyFor, useTheme } from '@/core/theme';
import { RequestedDateProvider } from '@/features/nutrition/hooks/requested-date';

/**
 * A native stack inside the Journal tab, so the screens get a system header.
 *
 * NativeTabs supplies no header of its own, and the Journal has things a header
 * is for: the date being looked at, the previous/next navigation of specs 8.3,
 * and the library icon of specs 7. The same stack carries the library and the
 * food editor, pushed on top — which is why the tab bar stays put while you
 * browse (browsing is a push, adding is a modal).
 *
 * The group parentheses matter: (journal) adds no path segment, so the Journal
 * stays the tabs group's index route rather than moving to /journal.
 *
 * ## The header is TRANSPARENT, not painted
 *
 * The brief was that the top band read as the same sheet of paper as the
 * content under it. Painting it colors.background did that and cost the glass,
 * which the iOS 26 direction warns about in as many words: opacity is exactly
 * what cancels the effect.
 *
 * headerTransparent gets the same result without the cost. The bar has no
 * background of its own, so at rest what shows through IS the page background —
 * the same colour, because it is literally the same surface — and the content
 * keeps scrolling underneath. Note the ordering trap: headerTransparent only
 * clears the background if headerStyle does not set one, so there must be no
 * backgroundColor here.
 *
 * What keeps the title legible once content is under it differs by OS, and the
 * two are documented to overlap if both are set:
 *
 *  - iOS 26 fades the content out at the edge itself (scrollEdgeEffects), which
 *    is the native answer and the better-looking one;
 *  - before that, a blur behind the bar is what does it.
 *
 * The conditional follows the precedent already set in the tabs layout, which
 * asks isLiquidGlassAvailable() before requesting an iOS 26 behaviour.
 *
 * This rests on the screens using contentInsetAdjustmentBehavior="automatic" —
 * they do — so that the content starts below the bar rather than under it.
 *
 * Route wiring only (D10): this reads the theme and declares screen options.
 */
export default function JournalLayout() {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  return (
    /*
      The provider wraps the stack so the Journal and the calendar screen share
      it: the calendar asks for a day, the Journal takes it once and clears it.
      See features/nutrition/hooks/requested-date.tsx for why that is not a
      route parameter. Mounting a provider is wiring, which is all app/ does.
    */
    <RequestedDateProvider>
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: theme.colors.accent,
        /**
         * THE TITLE WAS THE ONE PIECE OF TEXT STILL IN THE SYSTEM FACE.
         *
         * core/ui/text cannot reach it: the bar is a UINavigationBar and the
         * title is painted by UIKit, not rendered as a Text in the tree. Its
         * font comes from headerTitleStyle or from nowhere — and with nothing
         * set it came from nowhere, so the date sat in San Francisco above a
         * page entirely in Nunito.
         *
         * Extra-bold rather than bold: it is the one word on the bar that says
         * where you are, it sits beside two icons rather than centred so it has
         * the room, and it now heads a page whose own section titles are bold.
         * Asking for 800 is what makes the fourth face worth bundling — against
         * a Bold file iOS would synthesise the extra weight instead.
         */
        headerTitleStyle: {
          color: theme.colors.text,
          fontSize: 20,
          fontWeight: '800',
          fontFamily: fontFamilyFor('800', theme.fontsLoaded),
        },
        ...(glass
          ? { scrollEdgeEffects: { top: 'soft' as const } }
          : { headerBlurEffect: 'systemChromeMaterial' as const }),
      }}
    >
      <Stack.Screen name="index" />
      {/*
        A PUSH, AND IT USED TO BE A TRANSPARENT MODAL.
        
        The transparency existed to show the Journal behind a floating panel.
        Once the calendar became a full-width sheet running to the bottom edge,
        it covered everything anyway — so the presentation was buying nothing
        and charging for it: a modal is presented ON THE WINDOW, iOS scales the
        presenting screen back behind it, and what showed in the strips above
        and below was the window itself, white. The dim backdrop had been
        hiding that for as long as OverlayPanel drew one.

        Pushed, the screen belongs to this stack: nothing is presented over the
        window, nothing scales, and no window shows through.

        `gestureEnabled` is what makes the drag dismiss it. Under Link.AppleZoom
        the native interactive dismissal follows the finger back into the button
        rather than sliding the screen away — and expo-router reads this very
        flag to decide whether to allow it, so leaving it to a default would be
        leaving the gesture to one.

        NO `animation` OVERRIDE, UNLIKE EVERY OTHER WINDOW IN THIS APPLICATION.
        The others set it to 'none' because OverlayPanel raises and folds them
        itself. This one is reached through Link.AppleZoom, so the NATIVE
        transition owns both directions — it grows the screen out of the header
        button and shrinks it back into it. Silencing the animation here, or
        letting the screen animate itself, is what made it leave downwards while
        it had arrived from the header.

        No header: the screen carries its own two buttons.
      */}
      <Stack.Screen
        name="calendar"
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />
    </Stack>
    </RequestedDateProvider>
  );
}
