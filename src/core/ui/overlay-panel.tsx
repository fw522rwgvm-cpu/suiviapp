import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
 * AND WITH `animation: 'fade'`, which is not cosmetic. The default slides the
 * WHOLE SCREEN up from the bottom — the dimming backdrop included — so the
 * black rose into place along with the window, which reads as a sheet of dark
 * paper arriving rather than as the room going dim. A dim happens where it is;
 * only the window should travel.
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
 * ## The drag lives on the actions row, not on the whole panel
 *
 * Dragging anywhere would fight the scroll view inside: two gestures claiming
 * the same downward movement, and the one that wins depends on where the
 * finger happened to land. The top strip is unambiguous — nothing there
 * scrolls — and it is where the hand already goes to dismiss a sheet.
 *
 * Lives in core/ui with three real users on the day it is written — the
 * calendar, the quantity editor and free entry.
 */

/** Far enough to be a decision rather than a twitch. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 700;
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

  const drag = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    // Downward only: dragging up is not a dismissal.
    .failOffsetY(-10)
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        // The screen's own fade carries it out from here; the panel just has
        // to stop resisting.
        runOnJS(onDismiss)();
        return;
      }
      drag.value = withTiming(0, { duration: 180 });
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }],
  }));

  return (
    <View style={{ width, height }}>
      {/* Tapping what is still visible closes, as tapping outside should. */}
      <Pressable style={styles.fill} onPress={onDismiss} accessibilityLabel="Fermer">
        <View style={[styles.fill, styles.backdrop]} />
      </Pressable>

      <Animated.View
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
          panelStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.actions}>
            {/* A spacer keeps the trailing action trailing when there is no
                leading one, without a second layout branch. */}
            {left ?? <View />}
            {right ?? <View />}
          </View>
        </GestureDetector>

        <View style={styles.body}>{children}</View>
      </Animated.View>
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
