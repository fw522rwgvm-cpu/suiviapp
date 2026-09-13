import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';
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
        // A touch larger than the system default, and bold rather than its
        // semibold: it is the one word on the bar that says where you are, it
        // sits beside two icons rather than centred so it has the room, and it
        // now heads a page whose own section titles are bold too.
        headerTitleStyle: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
        ...(glass
          ? { scrollEdgeEffects: { top: 'soft' as const } }
          : { headerBlurEffect: 'systemChromeMaterial' as const }),
      }}
    >
      <Stack.Screen name="index" />
      {/*
        A TRANSPARENT MODAL, not a push: the Journal stays mounted and visible
        underneath, so choosing a date reads as something opening on top rather
        than as going somewhere else — which is what it is. A pushed screen is
        opaque by definition and cannot show anything behind it.

        No header either: the screen carries its own two buttons, and a bar
        above a floating panel would make it look like a page again.
      */}
      <Stack.Screen
        name="calendar"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
    </RequestedDateProvider>
  );
}
