import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/core/theme';

/**
 * Swipe left to delete (specs 8.3), and to take a line out of the basket.
 *
 * ## How close this gets to the system, and where it stops
 *
 * The Files app uses UISwipeActionsConfiguration on a UITableView. React
 * Native binds nothing to it — there is no component, in the framework or in
 * the libraries section 5 allows, that IS that control; the ones that look
 * like it are JavaScript reimplementations too. Matching it exactly would mean
 * a native module and every list in the application rebuilt on a collection
 * view, which is a native dependency and a rewrite.
 *
 * So this reproduces its behaviour rather than being it, and the behaviour is
 * four things — all of which were missing before, which is why it did not look
 * the same:
 *
 *  1. THE ROW FOLLOWS THE FINGER. Slice 1 deliberately avoided this: the
 *     Reanimated worklets plugin was unproven then, and a toolchain failure is
 *     only diagnosable through a fifteen-minute build. The plugin has been
 *     confirmed since, and the day carousel already follows the finger. This
 *     was the largest difference — a row that decides on release feels like a
 *     button being pressed, not like a sheet being pulled.
 *  2. The action is exactly the strip uncovered, so the red grows out of the
 *     edge with the drag instead of waiting there at full size behind.
 *  3. Past the resting width the row resists, keeping a third of the movement.
 *  4. Pulled far enough it commits on its own, and the row carries on out
 *     rather than bouncing back first.
 *
 * Release is a spring, not a timing. The system's is, and the difference is
 * legible even when nobody can say why.
 */

/** Where the row rests when open, and how wide the action reads. */
const ACTION_WIDTH = 96;
/** Past this, releasing opens rather than closes. */
const OPEN_THRESHOLD = ACTION_WIDTH / 2;
/** Past this, the swipe was unambiguous: run the action. */
const FULL_SWIPE = 200;
/** A flick counts even when short: points per second. */
const FLICK_VELOCITY = 800;
/** How much of the drag survives past the resting position. */
const RESISTANCE = 1 / 3;

const SPRING = { damping: 20, stiffness: 260, mass: 0.6 } as const;

export function SwipeToDeleteRow({
  children,
  onDelete,
  actionLabel = 'Supprimer',
}: {
  children: ReactNode;
  onDelete: () => void;
  actionLabel?: string;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Negative, always: 0 closed, -ACTION_WIDTH open, -width gone.
  const offset = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = Gesture.Pan()
    // Only claims the touch once the movement is clearly horizontal, and gives
    // up if it started as a vertical scroll. That is what lets it coexist with
    // the list, the day carousel, and the edge gesture that goes back.
    .activeOffsetX([-20, 20])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      start.value = offset.value;
    })
    .onUpdate((event) => {
      const raw = start.value + event.translationX;
      if (raw > 0) {
        // Closed and pulled the other way: nothing to reveal on that side.
        offset.value = 0;
        return;
      }
      // Past the resting width the row still moves, but grudgingly — what
      // follows is a decision, and it should feel like one.
      offset.value =
        raw < -ACTION_WIDTH ? -ACTION_WIDTH + (raw + ACTION_WIDTH) * RESISTANCE : raw;
    })
    .onEnd((event) => {
      const travelled = -offset.value;

      if (travelled > FULL_SWIPE || event.velocityX < -FLICK_VELOCITY) {
        // Carries on out rather than bouncing back first: the row leaving IS
        // the confirmation, and one that returns before vanishing reads as a
        // mistake being corrected.
        offset.value = withTiming(-width, { duration: 180 }, (finished) => {
          if (finished === true) runOnJS(onDelete)();
        });
        return;
      }

      offset.value = withSpring(travelled > OPEN_THRESHOLD ? -ACTION_WIDTH : 0, SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  // Exactly the strip uncovered, so the red grows from the edge with the drag.
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(0, -offset.value) }));

  function close(): void {
    offset.value = withSpring(0, SPRING);
  }

  function remove(): void {
    offset.value = withTiming(-width, { duration: 180 }, (finished) => {
      if (finished === true) runOnJS(onDelete)();
    });
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.action, { backgroundColor: theme.colors.danger }, actionStyle]}
      >
        <Pressable
          onPress={remove}
          style={styles.actionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text
            style={[styles.actionLabel, { color: theme.colors.onAccent }]}
            numberOfLines={1}
          >
            {actionLabel}
          </Text>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: theme.colors.surface }, rowStyle]}>
          {/* Tapping an open row closes it rather than triggering the row. */}
          <Pressable onPress={close} accessibilityLabel="Annuler la suppression">
            <View pointerEvents="box-none">{children}</View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  action: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The label is laid out at the resting width and clipped as the strip
    // narrows, so it slides in from the edge instead of shrinking.
    overflow: 'hidden',
  },
  actionPress: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});
