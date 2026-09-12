import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/core/theme';

/**
 * A window that opens over the screen behind it, rather than replacing it.
 *
 * ## What it is for
 *
 * A pushed or full-screen route is opaque by definition, so it reads as going
 * somewhere else. Picking a date, correcting a quantity, fixing four numbers —
 * none of those is leaving the day. They are things done ON it, and a panel
 * with the Journal showing behind says so before a single word is read.
 *
 * Used with `presentation: 'transparentModal'`, which is what keeps the screen
 * underneath mounted and visible. Without that the backdrop here would dim
 * nothing and the rounded corners would frame a black rectangle.
 *
 * ## Two things it does deliberately
 *
 * IT CARRIES ITS OWN SIZE, taken from the window rather than from its parent.
 * The calendar screen came up blank twice because a wrapper it was inside took
 * no part in layout, and `flex: 1` inside nothing is zero. Sizing from the
 * window cannot collapse, whatever a presentation or a wrapper turns out to do.
 *
 * ITS TOP EDGE IS AT THE ISLAND, its bottom at the screen edge. So the bottom
 * corners fall off screen and only the top two are rounded: the panel hangs
 * from the top rather than floating in the middle, which is what makes the
 * strip of dimmed Journal above read as "behind" rather than as a margin.
 *
 * Lives in core/ui with three real users on the day it is written — the
 * calendar, the quantity editor and free entry.
 */
export function OverlayPanel({
  onDismiss,
  left,
  right,
  children,
}: {
  /** Tapping the strip of screen still showing above. */
  onDismiss: () => void;
  /** Leading action, if the panel has one. */
  left?: ReactNode;
  /** Trailing action — in practice, the way out. */
  right?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ width, height }}>
      {/* Tapping what is still visible closes, as tapping outside should. */}
      <Pressable style={styles.fill} onPress={onDismiss} accessibilityLabel="Fermer">
        <View style={[styles.fill, styles.backdrop]} />
      </Pressable>

      <View
        style={[
          styles.panel,
          {
            top: insets.top,
            paddingBottom: insets.bottom,
            // The PAGE colour, not the card colour: what goes inside carries
            // its own cards, and cards painted surface on a surface panel stop
            // being visible. The backdrop, the corners and the lift are what
            // say this is floating — not its fill.
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            ...theme.shadow,
            // It floats over the page rather than sitting on it, so it carries
            // its own lift even in the dark, where cards deliberately have none.
            shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.18,
            shadowRadius: 24,
          },
        ]}
      >
        <View style={styles.actions}>
          {/* A spacer keeps the trailing action trailing when there is no
              leading one, without a second layout branch. */}
          {left ?? <View />}
          {right ?? <View />}
        </View>

        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { backgroundColor: '#000000', opacity: 0.28 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    // The content needs air under the actions: side by side they read as one
    // block, and what follows starts being mistaken for part of it.
    marginBottom: 18,
  },
  body: { flex: 1 },
});
