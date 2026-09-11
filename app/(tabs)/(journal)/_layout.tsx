import { Stack } from 'expo-router';
import { useTheme } from '@/core/theme';

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
 * THE HEADER BACKGROUND IS PAINTED, AND THAT IS A DIVERGENCE.
 *
 * The iOS 26 direction says never to paint the background of a glass surface,
 * because opacity is exactly what cancels the effect — and that rule stands for
 * the tab bar, which is left alone. Here it is set aside deliberately, on
 * request: the header is to read as the same sheet of paper as the content
 * under it rather than as a separate bar floating above it. headerShadowVisible
 * is off for the same reason — the hairline seam is what makes two surfaces
 * look like two surfaces.
 *
 * What it costs: this header no longer frosts as content scrolls under it. The
 * reservation CLAUDE.md already records cuts the other way here — glass costs
 * contrast, and nothing on this bar is a figure that has to be read at a
 * glance, so the loss is an effect rather than legibility.
 *
 * The variant that would have kept both is headerTransparent, letting the
 * content scroll underneath. It is not taken because its interaction with the
 * three-page carousel cannot be checked without the device.
 *
 * Route wiring only (D10): this reads the theme and declares screen options.
 */
export default function JournalLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.accent,
        headerTitleStyle: { color: theme.colors.text },
      }}
    />
  );
}
