import type { ReactNode } from 'react';
import { useState } from 'react';
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
import { ACTION_WIDTH, settleSwipe } from './swipe-settle';

/**
 * Swipe left to delete (specs 8.3), and to take a line out of the basket.
 *
 * ## How close this gets to the system, and where it stops
 *
 * The Files app uses UISwipeActionsConfiguration on a UITableView. React
 * Native binds nothing to it -- there is no component, in the framework or in
 * the libraries section 5 allows, that IS that control; the ones that look
 * like it are JavaScript reimplementations too. Matching it exactly would mean
 * a native module and every list in the application rebuilt on a collection
 * view, which is a native dependency and a rewrite.
 *
 * So this reproduces its behaviour rather than being it: the row follows the
 * finger, the action is exactly the strip uncovered, and release is a spring,
 * not a timing, because the system's is.
 *
 * ## REMOVING TAKES TWO GESTURES, NEVER ONE
 *
 * The first swipe only uncovers the action, however far it is pulled -- past
 * the resting width the row resists, keeping a third of the movement, and
 * releasing leaves it open. What removes is then either a press on the button
 * now fully visible, or a SECOND swipe.
 *
 * A single long swipe that deletes puts an irreversible action at the end of a
 * movement that is also how one scrolls, browses and goes back, and it fires
 * from a gesture nobody has yet seen the consequence of -- the button is only
 * revealed as it is being crossed. Two gestures cost one more moment and buy
 * the sight of what is about to happen. The Journal deletes a logged entry
 * through this same component, so the rule is worth more there still.
 *
 * Once open the row stops resisting: the pull that removes travels freely, the
 * action spreads with it, and the row carries on out rather than bouncing back
 * first -- a row that returns before vanishing reads as a mistake corrected.
 *
 * ## THE GESTURE'S SHAPE IS THE REFERENCE IMPLEMENTATION'S, NOT AN INVENTION
 *
 * A first version was hard to start from the left or the middle of a row while
 * working from the right. Three things were wrong with it, and all three are
 * settled by reading `ReanimatedSwipeable` in gesture-handler itself rather
 * than by guessing -- it is the closest thing to a reference, it ships in a
 * dependency already present, and it is what lives inside other people's
 * lists:
 *
 *  1. NO VERTICAL VETO. The first version failed the gesture past 16 points of
 *     vertical travel. A thumb swiping leftward pivots from the base of the
 *     hand, so the further left it starts the more its arc rises in the first
 *     millimetres -- the veto won the race against the horizontal threshold
 *     exactly where the row was found unresponsive, and near the thumb, on the
 *     right, it never fired. The reference sets no vertical veto at all: a
 *     vertical drag is left to the scroll view, which claims it first anyway.
 *  2. TEN POINTS, NOT TWENTY. Half the travel to start, which is the
 *     difference between a row that answers and one that has to be insisted on.
 *  3. THE PAN BELONGS TO THE CONTAINER, WHICH DOES NOT MOVE. Attaching it to
 *     the layer being translated puts the recognizer's own view under the
 *     finger and in motion. The reference puts the pan on the still container
 *     and only the tap on the moving layer.
 *
 * The tap is a gesture too, not a Pressable: it is armed ONLY while the row is
 * open, so it closes an open row without swallowing a press on a row at rest
 * -- the Journal's rows are pressable, this component's second user.
 */

/** How much of the drag survives past the resting position. */
const RESISTANCE = 1 / 3;
/** Horizontal travel that claims the touch. The reference's own figure. */
const ACTIVATE = 10;

const SPRING = { damping: 20, stiffness: 260, mass: 0.6 } as const;
const EXIT = { duration: 180 } as const;

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
  // Mirrored in React state because it arms the tap and closes the content to
  // touches -- neither of which a shared value can do.
  const [open, setOpen] = useState(false);

  const pan = Gesture.Pan()
    // Ten points of horizontal travel claims the touch, and nothing vertical
    // is vetoed: a vertical drag belongs to the scroll view, which recognises
    // it long before this reaches its threshold.
    //
    // LEFTWARD ONLY WHILE THE ROW IS CLOSED. The reference implementation takes
    // both directions because it has actions on both sides; this one has an
    // action on one side, and claiming a rightward drag would steal the back
    // gesture -- which starts on these very rows, the basket being nothing but
    // rows. Open, the row takes the rightward drag back, since closing itself
    // is then what that drag means.
    .activeOffsetX(open ? [-ACTIVATE, ACTIVATE] : -ACTIVATE)
    // Captured at activation rather than at touch-down: a spring may still be
    // running between the two, and its value then is not where the row rests.
    .onStart(() => {
      start.value = offset.value;
    })
    .onUpdate((event) => {
      const raw = start.value + event.translationX;
      if (raw > 0) {
        // Pulled the other way past its closed position: nothing on that side.
        offset.value = 0;
        return;
      }
      if (open) {
        // Already open, so this pull is the one that removes: it follows the
        // finger with nothing held back, and the action spreads with it.
        offset.value = raw;
        return;
      }
      // Closed, the row resists past the resting width. It cannot remove
      // whatever it is given, and resistance is how a movement says so
      // without the row simply stopping dead.
      offset.value =
        raw < -ACTION_WIDTH ? -ACTION_WIDTH + (raw + ACTION_WIDTH) * RESISTANCE : raw;
    })
    .onEnd((event) => {
      const landing = settleSwipe({
        open,
        travelled: -offset.value,
        velocityX: event.velocityX,
      });

      if (landing === 'removed') {
        offset.value = withTiming(-width, EXIT, (finished) => {
          if (finished === true) runOnJS(onDelete)();
        });
        return;
      }

      const opening = landing === 'open';
      offset.value = withSpring(opening ? -ACTION_WIDTH : 0, SPRING);
      runOnJS(setOpen)(opening);
    });

  // Armed only while the row is open, so a row at rest passes taps through to
  // whatever it contains.
  const tap = Gesture.Tap()
    .enabled(open)
    .shouldCancelWhenOutside(true)
    .onStart(() => {
      offset.value = withSpring(0, SPRING);
      runOnJS(setOpen)(false);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  // Exactly the strip uncovered, so the red grows from the edge with the drag.
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(0, -offset.value) }));

  function remove(): void {
    offset.value = withTiming(-width, EXIT, (finished) => {
      if (finished === true) runOnJS(onDelete)();
    });
  }

  return (
    <GestureDetector gesture={pan}>
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

        <GestureDetector gesture={tap}>
          <Animated.View
            // Open, the layer itself takes the touch: a press meant for the row
            // would otherwise act on a row the finger cannot fully see.
            pointerEvents={open ? 'box-only' : 'auto'}
            style={[{ backgroundColor: theme.colors.surface }, rowStyle]}
          >
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureDetector>
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
