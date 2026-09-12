import { useRouter } from 'expo-router';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
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
 * Used with `presentation: 'transparentModal'`, which keeps the screen beneath
 * mounted and visible, and with `animation: 'none'`, which is the subtle half.
 *
 * ## Why the animation is ours and not the presentation's
 *
 * The window has to rise from the bottom and fall back down; the backdrop has
 * to darken WHERE IT IS. Every built-in presentation moves the whole screen as
 * one, so the dimming veil rose along with the window — which reads as a sheet
 * of dark paper arriving rather than as the room going dim. Fading the screen
 * fixed that and lost the rising.
 *
 * Two movements, two rules, so two animations: the panel translates, the
 * backdrop only changes opacity. Nothing built in expresses that, so the
 * presentation is told to do nothing at all.
 *
 * ## The cost, and how it is paid
 *
 * Doing it here means EVERY way out has to play it — the button, the swipe,
 * the backdrop, and a screen inside that saves and closes itself. A child
 * calling router.back() directly would have the window vanish mid-flight.
 *
 * So the closing function is published on a context, and useDismiss() hands it
 * to whoever asks. Outside a panel the same hook answers with a plain
 * router.back(), which is what lets the very same screens serve as a step
 * inside the add modal, where there is no panel to fold away.
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

const RISE: WithTimingConfig = { duration: 260 };
const FALL: WithTimingConfig = { duration: 200 };

/** Far enough to be a decision rather than a twitch. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 700;

const DismissContext = createContext<(() => void) | null>(null);

/**
 * How to leave, whatever you are inside.
 *
 * In a panel it folds the window away first; anywhere else it is router.back().
 * Screens call this rather than the router, so that one screen can be both a
 * step in a modal and an overlay route without knowing which it is.
 */
export function useDismiss(): () => void {
  const inPanel = useContext(DismissContext);
  const router = useRouter();
  return inPanel ?? (() => router.back());
}

export function OverlayPanel({
  onDismiss,
  left,
  right,
  children,
}: {
  /** Called once the window has finished folding away. */
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

  // 0 is fully below the screen, 1 is open.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const travel = height - insets.top;

  useEffect(() => {
    progress.value = withTiming(1, RISE);
  }, [progress]);

  function close(): void {
    progress.value = withTiming(0, FALL, (finished) => {
      if (finished === true) runOnJS(onDismiss)();
    });
  }

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    // Downward only: dragging up is not a dismissal.
    .failOffsetY(-10)
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        // The drag is handed over to the closing animation rather than reset,
        // so the window carries on downward from where the finger left it
        // instead of snapping back up first.
        progress.value = 1 - drag.value / travel;
        drag.value = 0;
        runOnJS(close)();
        return;
      }
      drag.value = withTiming(0, RISE);
    });

  // Darkens where it is. The panel travels; this never does.
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.28 }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel + drag.value }],
  }));

  return (
    <DismissContext.Provider value={close}>
      <View style={{ width, height }}>
        {/* Tapping what is still visible closes, as tapping outside should. */}
        <Pressable style={styles.fill} onPress={close} accessibilityLabel="Fermer">
          <Animated.View style={[styles.fill, styles.backdrop, backdropStyle]} />
        </Pressable>

        <Animated.View
          style={[
            styles.panel,
            {
              top: insets.top,
              paddingBottom: insets.bottom,
              // The PAGE colour, not the card colour: what goes inside carries
              // its own cards, and cards painted surface on a surface panel
              // stop being visible. The backdrop, the corners and the lift are
              // what say this is floating — not its fill.
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              ...theme.shadow,
              // It floats over the page rather than sitting on it, so it
              // carries its own lift even in the dark, where cards have none.
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
    </DismissContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { backgroundColor: '#000000' },
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
