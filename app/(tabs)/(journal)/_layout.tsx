import { Stack } from 'expo-router';
import { fontFamilyFor, useTheme } from '@/core/theme';
import { useStackHeaderOptions } from '@/core/ui/stack-header';
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
 * That conditional now lives in core/ui/stack-header, shared by the three
 * stacks; it still asks isLiquidGlassAvailable() before requesting an iOS 26
 * behaviour, which is the precedent the tabs layout set.
 *
 * This rests on the screens using contentInsetAdjustmentBehavior="automatic" —
 * they do — so that the content starts below the bar rather than under it.
 *
 * Route wiring only (D10): this reads the theme and declares screen options.
 */
export default function JournalLayout() {
  const theme = useTheme();
  // The four options every stack shares now live in core/ui/stack-header; the
  // title style below stays here, because extra-bold Nunito is this bar's
  // decision and not a mechanism three stacks have in common.
  const header = useStackHeaderOptions();

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
        ...header,
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
      }}
    >
      <Stack.Screen name="index" />
      {/*
        A TRANSPARENT MODAL, like every other window in this application.

        It was a zoom transition for a while — the sheet coming out of the
        calendar button, with an interactive dismissal that took it back in.
        That was dropped: Apple's transition scales the presenting screen back
        while the sheet is up, the API offers nothing to turn that off, and the
        Journal shrinking behind with the window showing white above and below
        it was worse to look at than the anchoring was good. See the note in
        calendar-screen.tsx.

        So: `animation: 'none'`, exactly like its siblings, because OverlayPanel
        raises and folds the window itself. That is also what keeps the backdrop
        darkening where it is instead of rising with the panel — every built-in
        presentation moves the whole screen as one.

        No header: the screen carries its own two buttons, and a bar above a
        floating panel would make it look like a page again.
      */}
      <Stack.Screen
        name="calendar"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
        }}
      />
    </Stack>
    </RequestedDateProvider>
  );
}
